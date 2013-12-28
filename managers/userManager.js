/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview User controller - user channel specific methods
 * @author aneil@blipboard.com
 *
 * @created Thu, Feb 23 2012 - 18:13:20 -0800
 * @updated Fri, Mar 02 2012 - 10:52:26 -0800
 */

var assert = require('assert');
var async = require('async');
var sprintf = require('sprintf').sprintf;
var winston = require('winston');

var BBError = require('../lib/error').BBError;
var Tile = require('../lib/tile').Tile;
var blipManager = require('./blipManager');
var blipNotificationService = require('./blipNotificationService');
var channelEvents = require('./channelEvents');
var channelManager = require('./channelManager');
var classOf = require('../lib/javascript').classOf;
var config = require('../config');
var facebook = require('../lib/facebook');
var js = require('../lib/javascript');
var listenNetworkManager = require('./listenNetworkManager');
var logutil = require('../lib/logutil');
var notificationManager = require('./notificationManager');
var mongo = require('../lib/mongo');
var password = require('../lib/password');
var placeManager = require('./placeManager');
var pushnot = require('../lib/pushnot');
var v = require('./validate');

var ObjectID = mongo.ObjectID;
var logCallback = logutil.logCallback;
var logHandler = logutil.logHandler;
var logMongoHandler = mongo.logMongoHandler;
var mongoHandler = mongo.mongoHandler;

var passwordIsValid = function passwordIsValid(password) {
  return classOf(password)===String && password.length >= 8;
};


var createFacebookUser = function createFacebookUser (accessToken, password, callback) {
  v.validate({ accessToken:  [accessToken, v.isClass(String)],
               password: [password, v.test(passwordIsValid, "invalid password")] },
             callback,
             function (prepared) {
               updateUser(undefined, accessToken, password, callback);
            });
};

var updateFacebookUser = function updateFacebookUser (user, accessToken, callback) {
  updateUser(user._id, accessToken, undefined, callback);
};

var invalidateUserAccessToken = function invalidateUserAccessToken(token, callback) 
{
  winston.info("userManager.invalidateUserAccessToken: " + token);
  v.validate({ token: [token, v.isClass(String)] },
             callback,
             function validated(prepared) { 
               mongo.channels.update({ 'facebook.accessToken': token }, {$unset: {'facebook.accessToken': ''}}, callback);
             });
};

/**
   @desc Creates or updates a user channel document. Valid combinations are token,password or id,token
   @param {ObjectID} id  (optional)
   @param {String} accessToken (mandatory)
   @param {String} password (optional)
   @param {function(Error, UserChannel} provides newly created channel

   cases: 
   1. (token,password) - new:    token -> facebook.id not in any UserChannel (200)
   2. (token,password) - update: token -> facebook.id matches/updates existing UserChannel (200)
   3. (token,password) - error:  invalid token (401)
   4. (id,token)       - update: update UserChannel (200)
   5. (id,token)       - error:  invalid id (400)
   6. (id,token)       - error:  invalid token (401)
   7. (id,token)       - error:  facebook-profile.id doesn't match user.fbid (403)
   8. (id,token)       - update: no matching facebook id. convert from anonymous account to facebook account
*/
var updateUser = function updateUser(id, accessToken, userPassword, callback) { 
  v.validate({ id:           [id, v.undefinedOK, v.idsExist(mongo.channels)],
               userPassword: [userPassword, v.undefinedOK, v.isClass(String),v.test(passwordIsValid, "invalid password")],
               accessToken:  [accessToken, v.isClass(String)],
               callback:     [callback, v.isClass(Function)] },
             callback,
             doit);

  function doit(prepared) {
    async.waterfall([
      function fetchProfile(callback) { 
        facebook.getMe(accessToken, function fetchedProfile(error, fb) {
          if (error) {  // !jf! should differentiate between authentication and other errors. 
            invalidateUserAccessToken(accessToken, function() { 
              callback(BBError.failedToAuthenticate('Invalid access token')); // case 3 and 6
            });
          }
          else {
            callback(null, fb);
          }
        });
      },
      function fetchUser(fb, callback) { 
        mongo.channels.findOne({ 'facebook.id': fb.id, 
                                 type: config.MONGO.channelType.user },
                               ['_id', 'name'], 
                               function(error, user) { 
                                 callback(error, fb, user); 
                               });
      },
      function updateUser(fb, user, callback) { 
        var update = { name: fb.name,
                       displayName: fb.name,
                       picture:  "http://graph.facebook.com/" + fb.id + "/picture",
                       email: fb.email,
                       facebook: { id: fb.id, accessToken: accessToken }, 
                       type: config.MONGO.channelType.user
                     };
        var criterion;
        if (userPassword) {
          update.password = password.makeSaltedHash(userPassword);
        }

        if (user && fb && user.facebook && user.facebook.id !== fb.id) { // case 7
          winston.info("userManager.updateUser: facebook id " + user.facebook.id + " doesn't match " + fb.id);
          return callback(BBError.forbidden("Facebook profile id " + user.facebook.id + " doesn't match " + fb.id));
        }
        
        if (id) {
          winston.info("userManager.updateUser: update existing " + id + " fb=" + fb.id);
          criterion = {_id: id}; // don't match facebook.id since it may not be populated yet
        }
        else if (user && user._id) { 
          winston.info("userManager.updateUser: update existing on POST " + user._id + " fb=" + fb.id);
          criterion = {_id: user._id}; // don't match facebook.id since it may not be populated yet
        }
        else {
          winston.info("userManager.updateUser: create new user " + update.name);
        }
        if (criterion) { 
          //winston.debug("userManager.updateUser: findAndModify");
          mongo.channels.findAndModify(criterion, // query 
                                       {"_id":-1}, // sort
                                       {$set: update},
                                       {'new':true, upsert:true},
                                       function(error,channel) { 
                                         callback(error,channel);
                                       });
        }
        else {
          //winston.debug("userManager.updateUser: insert");
          mongo.channels.insert(update, callback);
        }
      },
      function follow(user, callback) { 
        if (user instanceof Array) {
          user = user[0];
        }
        //winston.debug("userManager.updateUser: user=" + js.pp(user));

        assert(typeof(callback) === 'function');
        if (!user.lastFBNetworkSync) {
          winston.info("userManager.updateUser update facebook followers and top gurus " + user._id);
          async.parallel({
            social: function(callback) { 
              updateSocialNetworks(user, accessToken, callback);
            },
            gurus: function(callback) { 
              updateRecommendedGurus(user, callback);
            }
          }, function() {
            callback(null, user);
          });
        }
        else {
          callback(null, user);
        }
      }
    ], function(error, user) { 
      callback(error, user);
    });
  }
};

var updateRecommendedGurus = function updateRecommendedGurus(user, callback) 
{
  var makeMessages = function makeMessage(channels) { 
    assert(channels && channels.length > 0);
    var result = { title: "You're now following ",
                   subtitle: "Follow more to make Blipboard more fun",
                   message: "We added "
                 };
    if (channels.length === 1) { 
      result.message += "1 guru";
      result.title += "1 guru!";
    }
    else {
      result.message += channels.length + " gurus";
      result.title += channels.length + " gurus!";
    }
    result.message += ' to your "Following" map. Follow more gurus to make Blipboard more fun!';

    return result;
  }

  async.waterfall([
    function search(callback) { 
      searchRecommended(15, callback);
    },
    function listen(users, callback) { 
      winston.info('userManager.updateRecommendedGurus: adding ' + users.length + ' gurus to ' + user.name + '\'s network');
      var tunein = function tunein ( channel, callback ) {
        winston.debug(sprintf("userManager (guru): %s(%s) auto-follow %s(%s)", 
                              user.name, user._id, channel.name, channel._id));
        listenNetworkManager.listen(user._id, channel._id, callback);
      };
      if (users.length > 0) {
        async.each(users, tunein, function done(error) { 
          callback(error, users);
        });
      }
      else {
        callback("no recommended gurus");
      }
    },
    function sendNotifications(users, callback) { 
      assert(users.length > 0);
      var strings = makeMessages(users);
      notificationManager.makeNewTopUsersNotification(user._id, 
                                                      strings.title,
                                                      strings.subtitle,
                                                      strings.message,
                                                      callback);
    }], function(error) { 
      if (error) { 
        winston.info("Failed to follow top gurus: " + js.pp(error));
      }
      callback(null, user);
    });
};

var updateSocialNetworks = function updateSocialNetworks(user, accessToken, callback) 
{
  assert(callback);
  var makeMessage = function makeMessage(channels) { 
    var filterUserChannel = function(channel) { 
      return channel.type === config.MONGO.channelType.user; 
    };
    var filterPlaceChannel = function(channel) { 
      return channel.type === config.MONGO.channelType.place; 
    };
    
    var newUserChannelCount = channels.filter(filterUserChannel).length;
    var newPlaceChannelCount = channels.filter(filterPlaceChannel).length;
    
    var result = { title: "You're following more blippers!",
                   subtitle: "",
                   message: 'Your "Following" map now shows blips of ' };
    if (newUserChannelCount) { 
      result.message += newUserChannelCount;
      result.message += (newUserChannelCount === 1 ? " friend" : " friends");

      result.subtitle += newUserChannelCount;
      result.subtitle += (newUserChannelCount === 1 ? " Facebook friend" : " Facebook friends");
      
      if (newPlaceChannelCount) { 
        result.message += " and ";
        result.subtitle += " and ";
      }
    }

    if (newPlaceChannelCount) { 
      result.message += newPlaceChannelCount;
      result.message += (newPlaceChannelCount === 1 ? " place" : " places");
      
      result.subtitle += newPlaceChannelCount;
      result.subtitle += (newPlaceChannelCount === 1 ? " place" : " places");
    }
    result.message += " you like from Facebook";
    result.subtitle += ' added to "Following" map';
    
    return result;
  };

  async.waterfall([
    function searchFacebook(callback) { 
      facebook.getMySocialNetwork(accessToken, callback);
    },
    function lookupChannels(network, callback) {
      winston.info("userManager.updateSocialNetworks: " + js.ppc(network));
      if (network.length > 0) { 
        var selector = { 'facebook.id': { $in: network } };
        var fields = [ '_id', 'name', 'type' ];
        mongo.channels.find(selector, fields).toArray(callback);
      }
      else {
        callback(null, []);
      }
    },
    function listen(channels, callback) { 
      winston.info('userManager.updateSocialNetworks: adding ' + channels.length + ' channels to ' + user.name + '\'s network');
      var tunein = function tunein ( channel, callback ) {
        winston.debug(sprintf("userManager.updateSocialNetworks (facebook): %s(%s) auto-follow %s %s(%s)", 
                              user.name, user._id, channel.type, channel.name, channel._id));
        listenNetworkManager.listen(user._id, channel._id, callback);
      };
      async.each(channels, tunein, function(error) { 
        callback(error, channels);
      });
    },
    function markFacebookSync(channels, callback) {
      winston.debug("userManager.updateSocialNetworks: mark lastFBNetworkSync: " + user.facebook.id);
      var selector = { 'facebook.id': user.facebook.id };
      var fields = { $set: { lastFBNetworkSync: new Date() } };
      mongo.channels.update(selector, fields, function ignore ( ) {});
      callback(null, channels);
    },
    function sendNotification(channels, callback) { 
      if (channels.length) { 
        var strings = makeMessage(channels);
        notificationManager.makeNewChannelNotification(user._id, 
                                                       strings.title,
                                                       strings.subtitle,
                                                       strings.message,
                                                       user._id, 
                                                       "urn:blipboard:Icon-Small.png",
                                                       callback);
      }
      else {
        callback(null);
      }
    }
  ], function(error) {
    if (error) { 
      winston.info("Failed to follow facebook likes " + js.pp(error));
    }
    callback(null, user);
  });
};

/**
 * @desc Creates an user document - essentially a channel with a new random password
 * @param{function(error, {_id: ObjectID, password: string}} provides newly created channel
 */
var createAnonymousUser = function createAnonymousUser (userPassword, callback) {
  function create(prepared) {
    var newUser = { password: password.makeSaltedHash(userPassword), 
                    type: config.MONGO.channelType.user,
                    twitter: { } };
    mongo.channels.save(newUser, {safe:true,upsert:true}, callback);
  }

  v.validate({ userPassword:  [userPassword, v.test(passwordIsValid, "invalid password")] },
             callback,
             create);
};

var createTwitterUser = function createTwitterUser ( twitUser, callback ) {
  var user = {
    displayName: twitUser.name,
    facebook: {
    },
    twitter: {
      id: twitUser.id,
      handle: '@' + twitUser.screen_name.toLowerCase()
    },
    isDeveloper: false,
    lastFBNetworkSync: new Date(0),
    name: twitUser.name,
    password: password.makeSaltedHash(password.randomString(10)),
    picture: twitUser.profile_image_url,
    type: config.MONGO.channelType.user
  };

  mongo.channels.save(user, { safe: true, upsert: true }, callback);
};


/**
 * @desc Update a user's password. for use with basic authentication
 * @param {ObjectID}
 * @param {string}
 * @param {function(error)}
 */
var setUserPassword = function setUserPassword(userId, pass, callback) 
{
  v.validate({ userId: [userId, v.idsExist(mongo.channels)],
               password: [pass, v.test(passwordIsValid, "invalid password")] },
             callback,
             update);

  function update(prepared) { 
    mongo.channels.update({_id: userId}, 
                          {$set: {password: password.makeSaltedHash(prepared.password)}}, 
                          {upsert: false}, 
                          callback);
  }
};

/**
 * @desc Authenticate user with the given credentials
 * @param {string} identifier 
 * @param {string} password
 * @param {function(error, user)}
 */
var authenticateUserBasic = function authenticateUserBasic (identifier, pswd, callback) {
  function onValidated(prepared) {
    var criterion = {};
    var identifier = prepared.identifier;

    try {
      criterion._id = ObjectID(identifier); 
    }
    catch (e) {
      if (identifier.indexOf("@")!=-1) {
        criterion.email = identifier;
      }
    }
    mongo.channels.findOne(criterion, authenticate);
  }

  function authenticate(error, user) {
    if ( error ) {
      return callback(BBError.mongoFailed({ cause: error }));
    }
    if ( !user ) {
      return callback(BBError.failedToAuthenticate('User with the given id does not exist.'));
    }
    if ( !password.matchesSaltedHash(pswd, user.password) ) {
      return callback(BBError.failedToAuthenticate('Password did not pass validation'));
    }
    
    callback(null, user);
  }
  
  winston.info("userManager.authenticateUserBasic: " + identifier);
  v.validate({ identifier: [identifier, v.isClass(String)] },
             callback,
            onValidated);
};

/**
 * @desc Authenticate user with the given credentials
 * @param {string} identifier 
 * @param {string} token
 * @param {function(error, user)}
 */
var authenticateUserAccessToken = function authenticateUserAccessToken (identifier, token, callback) {
  function authenticate(error, user) {
    if ( error ) {
      callback(BBError.mongoFailed({ cause: error }));
    }
    else if ( !user ) {
      facebook.getMe(token, function fetchedProfile(error, fbuser) {
        if (error) {  
          invalidateUserAccessToken(token, function() { 
            // !jf! should differentiate between authentication and other errors. 
            callback(BBError.failedToAuthenticate('Invalid access token'));
          });
        }
        else {
          mongo.channels.findOne({ 'facebook.id': fbuser.id }, function(error, bbuser){ 
            //winston.info("userManager.authenticateUserAccessToken: " + JSON.stringify(bbuser));
            callback(error, bbuser);
          });
        }
      });
    }
    // access_token matches what we have in the user document
    else if ( user.facebook && token === user.facebook.accessToken) {
      callback(null, user);
    }
    else { 
      assert(0);
    }
  }

  //winston.info("userManager.authenticateUserAccessToken: " + identifier);
  v.validate({ token:  [token, v.isClass(String)] },
             callback,
             function (prepared) {
               mongo.channels.findOne({ 'facebook.accessToken': token }, authenticate);
             });
};

/**
 * Reports the user's location to the backend
 * @param {string} userId
 * @param {object} location data
 * @param {function(error, data)}
 */
var reportLocation = function reportLocation (user, newLocation, details, callback) {
  winston.log('info', "userManager: reportLocation " + user._id + " " + " reason=" + JSON.stringify(details) + " -> " + js.ppc(newLocation));
  var userIsValid = function userIsValid(user) {
    return (user._id instanceof ObjectID) &&
      user.type ===mongo.channelType.user &&
      (!user.currentLocation || // there is no current location OR
       ( // current location must be valid    winston.log('info', sprintf("found user %s incoming blips (%d)", userId, count));

         typeof(user.currentLocation.latitude) ==='number' &&
           typeof(user.currentLocation.longitude) ==='number'));
  };

  var validationOK = function validationOK(prepared) {
    
    var onLocationModified = function onLocationModified () {
      var currentTileIndex = user.currentLocation ? 
        mongo.tile(user.currentLocation.latitude,user.currentLocation.longitude).toIndex() : undefined;

      // has the user's tileIndex changed?
      if ( currentTileIndex !== prepared.newLocation.tileIndex ) {
        channelEvents.currentTileChanged(user._id, prepared.newLocation);
        blipNotificationService.pushNotifyUserAtLocation(user._id,prepared.newLocation.latitude, prepared.newLocation.longitude, function(){});
      }
      callback(null, prepared.newLocation);

    };
    
    var createdTime = new Date();
    // mongo.reportedLocationHistory.insert({user: user._id, 
    //                                       createdTime: createdTime,
    //                                       tileIndex: prepared.newLocation.tileIndex, 
    //                                       latitude: prepared.newLocation.latitude, 
    //                                       longitude: prepared.newLocation.longitude, 
    //                                       reason: details.reason,
    //                                       age: details.age,
    //                                       accuracy: details.accuracy,
    //                                       speed: details.speed}, 
    //                                      {safe:false});

    delete prepared.newLocation.tileIndexes;
    prepared.newLocation.updated = new Date();
    
    mongo.channels.update({ _id: user._id, type:mongo.channelType.user },  // query
                          { $set: { currentLocation: prepared.newLocation } }, // update
                          { safe: true}, 
                          mongoHandler(callback,onLocationModified));
  };

  v.validate({ user: [user, v.test(userIsValid,"invalid user")],
               newLocation: [newLocation, v.isLocation,v.addLocationTileIndex]},
             callback,
             validationOK);
};

var updateEditableUser = function updateEditableUser(user, updatedAccount, callback) 
{
  v.validate({ id: [user._id, v.idsExist(mongo.channels)] }, callback, update);
  function update(prepared) { 
    mongo.channels.findAndModify({_id: prepared.id, type:mongo.channelType.user}, // query
                                 {_id: 1}, // sort
                                 {$set: {description: updatedAccount.description}},
                                 {'new': true, 'upsert': false},
                                 callback);
  }
};

/**
 * returns user Ids that at the tileIndex
 * @param {String} tileIndex
 * @param {Array} subsetOf optional array of userIds to look for at tileIndex
 * @param {Function(error,userIds)} callback where userIds is an array of ObjectIDs
 */
var usersAtTile = function userAtTile(tileIndex, subsetOf, callback) {
  function retrieveUserIds(prepared) {
    var criterion = {'currentLocation.tileIndex':tileIndex,
                     type: mongo.channelType.user};
    if (subsetOf) {
      criterion._id = {$in: subsetOf };
    }
    mongo.channels.findItems(criterion,
                             {fields:[],_id:1}, // only get _id
                             logMongoHandler(
                               "userManager.usersAtTile",criterion,
                               callback,
                               function foundUsers(users) {
                                 callback(undefined,users.map(function(u) {return u._id; }));
                               }));
  }
  if (!callback) {
    callback = subsetOf;
    subsetOf = undefined;
  }

  v.validate({ location: [ v.isLocation, v.addLocationTileIndex ]},
             callback,
             retrieveUserIds);
};

/**
 * Retrieve user channels
 * @param {object} params { q:optional location:mandatory recommended:optional }
 */
var search = function search(listenerId, params, callback) {
  function onValidated(prepared) {
    var criterion = { type:mongo.channelType.user, 
                      name:{$exists:true}, 
                      'stats.score':{$gt: 0} };
    if (params.recommended) { 
      criterion[recommended] = true;
    }
    params.page.retrieve(mongo.channels, criterion, null, channelManager.isListeningDecoratorCallback(listenerId,callback));
  }
  
  v.validate( { listenerId: [ listenerId, v.undefinedOK, v.isClass(ObjectID) ] }, callback, onValidated);
};

// this version is not paged (but it is limited)
var searchRecommended = function searchRecommended(limit, callback) 
{
  if (limit === undefined) { 
    limit = 3;
  } 
  else if (limit > 50) { 
    winston.info("userManager.searchRecommended: limit restricted " + limit + " to 50");
    limit = 50;
  }
  
  mongo.channels.find({type:mongo.channelType.user, 
                       name:{$exists:true}, 
                       recommended:true, 
                       'stats.score':{$gt:0}},
                      {limit:limit, sort:[['stats.score',-1]]}).toArray(function(error, channels) {
                        callback(error, channels);
                      });
};

exports.createAnonymousUser = createAnonymousUser;
exports.updateFacebookUser = updateFacebookUser;
exports.invalidateUserAccessToken = invalidateUserAccessToken;
exports.createFacebookUser = createFacebookUser;
exports.createTwitterUser = createTwitterUser;
exports.setUserPassword = setUserPassword;
exports.reportLocation = reportLocation;
exports.updateEditableUser = updateEditableUser;
exports.authenticateUserBasic = authenticateUserBasic;
exports.authenticateUserAccessToken = authenticateUserAccessToken;
exports.usersAtTile = usersAtTile;
exports.search = search;
exports.searchRecommended = searchRecommended;
