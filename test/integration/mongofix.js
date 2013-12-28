/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview Mongo fixture
 * @author vladimir@blipboard.com
 *
 * @created Tue, Mar 06 2012 - 18:12:11 -0800
 * @updated Tue, Mar 13 2012 - 14:22:43 -0700
 */

var async = require('async');
var js = require('../../lib/javascript');
var mongo = require('../../lib/mongo');
var ObjectID = mongo.ObjectID;
var mongoConfig = require('../../config').MONGO;
var Tile = require('../../lib/tile').Tile;

/**
 * @desc Turn a document into a fixture document that can be easily identified and removed by clean up
 */
function fixdoc ( doc ) { doc.isFixture = true; return doc; }

function fakeLocation ( ) {
  var lat = (Math.random() - 0.5) * 180;
  var lon = (Math.random() - 0.5) * 360;
  return {
    latitude: lat,
    longitude: lon,
    tileIndex: Tile(lat, lon, mongoConfig.tileZoomLevel).toIndex()
  };
}

function fakeLikes ( ) { return Math.ceil(Math.random() * 1000); }

/**
 * @desc Fixture class for mongo
 */
function MongoFix ( ) {
  if ( !(this instanceof MongoFix) ) {
    var fix = new MongoFix( );
    fix.set.apply(fix, arguments);
    return fix;
  }
  this.__state = { }
  this.__setup = [ ];
  this.set.apply(this, arguments);
}

/**
 * @desc Get state value for a particular key
 * @param {string}
 */
MongoFix.prototype.get = function get ( key ) { return this.__state[key]; }

/**
 * @desc Extend setup procedure
 */
MongoFix.prototype.set = function set ( ) {
  var self = this;
  for (var i in arguments) (function (arg) {
    if ( typeof arg !== 'object' ) throw new Error('wrong argument type');

    if ( arg instanceof Array ) self.set.apply(self, arg);
    else {
      var make = 'make';
      if ( arg.make ) make += arg.make[0].toUpperCase() + arg.make.substring(1);

      self.__setup.push(function setupWorker (callback) {
        if ( !self[make] ) throw new Error('do not know how to ' + make);
        self[make](arg, function onDone (error, result) {
          if ( error ) return callback(error);
          if ( arg.key ) self.__state[arg.key] = result;
          callback();
        });
      });
    }
  }) (arguments[i]);
}

/**
 * @desc Reset fixture to a clean state
 * @param {function(error)}
 */
MongoFix.prototype.reset = function reset ( callback ) {
  async.series(this.__setup, callback);
}

/**
 * @desc Make a user fixture
 * @param {object} named arguments
 * @param {function(error, data)}
 */
MongoFix.prototype.makeUser = function makeUser ( args, callback ) {
  var doc = fixdoc({
    name: args.name,
    type: mongoConfig.channelType.user,
    password: require('../../lib/password').makeSaltedHash(args.name)
  });

  mongo.channels.save(doc, callback);
}

/**
 * @desc Make a notification fixture
 * @param {object} named arguments
 * @param {function(error, data)}
 */
MongoFix.prototype.makeNotification = function makeNotification ( args, callback ) {
  var doc = fixdoc({
    userId: this.get(args.user)._id,
    time: args.time,
    type: args.type,
  });

  if (args.blip) { 
    doc.blipId = this.get(args.blip)._id;
  }

  if (args.listener) { 
    doc.listenerId = this.get(args.listener)._id;
  }

  if (args.liker) { 
    doc.likerId = this.get(args.liker)._id;
  }

  if (args.comment) { 
    doc.commentId = this.get(args.comment)._id;
  }

  mongo.notifications.save(doc, callback);
}

/**
 * @desc Make a topic fixture
 * @param {object} named arguments
 * @param {function(error, data)}
 */
MongoFix.prototype.makeTopic = function makeTopic ( args, callback ) {
  var doc = fixdoc({
    name: args.name,
    identifier: args.identifier ? args.identifier : args.name,
    description: args.description ? args.description : (args.name + " description"),
    picture: args.picture ? args.picture : "http://localhost/" + args.name + ".png",
    picture2x: args.picture2x ? args.picture2x : "http://localhost/" + args.name + "@2x.png"
  });

  mongo.topics.save(doc, callback);
}

/**
 * @desc Make a place fixture
 * @param {object} named arguments
 * @param {function(error, data)}
 */
var facebookCounter = 1000;
MongoFix.prototype.makePlace = function makePlace ( args, callback ) {
  if (args.location) { 
    args.location.tileIndex = mongo.tile(args.location.latitude, args.location.longitude).toIndex();
  }

  var doc = fixdoc({ 
    name: args.name,
    description: "description of " + args.name,
    type: mongoConfig.channelType.place,
    location: args.location || fakeLocation(),
    score: args.score || 0,

    facebook: { id: args.facebookId || facebookCounter++,
                likes: args.likes || fakeLikes(), 
                checkins: args.checkins || 0,
                talking_about_count: args.talking_about_count || 0,
                lastRefresh: 1 }
  });
  mongo.channels.save(doc, callback);
}

MongoFix.prototype.makeBlip = function makeBlip ( args, callback ) {
  var self = this;
  function fixLike(like) { 
    return { id: self.get(like.id)._id, 
             name: like.name };
  }

  function fixTopic(topic) { 
    return self.get(topic)._id;
  }
  
  var doc = fixdoc({
    message: args.message,
    author: this.get(args.author),
    place: this.get(args.place),
    createdTime: args.createdTime,
    expiryTime: args.expiryTime,
    effectiveDate: args.effectiveDate ? args.effectiveDate : args.expiryTime,
    popularity: args.popularity,
    likes: args.likes ? args.likes.map(fixLike) : [],
    topicIds: args.topics ? args.topics.map(fixTopic) : []
  });

  //console.log("make blip: " + js.pp(doc));
  mongo.blips.save(doc, callback);
}

MongoFix.prototype.makeReceivedBlip = function makeReceivedBlip ( args, callback ) {
  var self = this;
  function fixTopic(topic) { 
    return self.get(topic)._id;
  }

  var blip = this.get(args.blip);
  var doc = fixdoc({
    user: this.get(args.user)._id,
    blip: this.get(args.blip)._id,
    author: this.get(args.blip).author._id,
    authorType: this.get(args.blip).author.type,
    placeId: this.get(args.place)._id,
    createdTime: blip.createdTime,
    expiryTime: blip.expiryTime,
    effectiveDate: blip.effectiveDate,
    popularity: blip.popularity,
    isRead: false, 
    notified: false, 
    tileIndex: Tile(args.latlng.latitude, args.latlng.longitude, mongoConfig.tileZoomLevel).toIndex(),
    location: args.latlng,
    topicIds: args.topics ? args.topics.map(fixTopic) : []
  });
  //console.log("received=" + js.pp(doc));
  mongo.receivedBlips.save(doc, callback);
}


/**
 * @desc Make a tunein connection between two channels
 * @param {object} named arguments
 * @param {function(error, data)}
 */
MongoFix.prototype.makeTunein = function makeTunein ( args, callback ) {
  var listener = this.get(args.listener);
  var listensTo = this.get(args.listensTo);

  var channelListener = fixdoc({channel: listensTo._id, listener: listener._id});
  var channelListensTo = fixdoc({channel: listener._id, listensTo: listensTo._id});
  //console.log("makeTuneIn: " + js.pp(channelListener) + js.pp(channelListensTo));
  async.parallel([function(callback) { mongo.channelListeners.save(channelListener, callback); },
                  function(callback) { mongo.channelListensTos.save(channelListensTo, callback); }], 
                 callback);
  //require('../../managers/listenNetworkManager').listen(listener._id, listensTo._id, callback);
}

/**
 * @desc Remove all the fixture related documents from the database
 * @param {function(error, data)}
 */
function cleanup ( callback ) {

  async.parallel({
    channels: function (callback) { 
      mongo.channels.find({isFixture:true},{fields:['_id']}).toArray(function (error,results) {
        function removeWorker(collection,criterion) {
          return function removeFixtures(callback) {
            collection.remove(criterion,callback);
          };
        }
        
        var fixtureIds = results.map(function(r) {return r._id});
        //console.log("mongofix.cleanup " + js.ppc(fixtureIds));
        async.parallel([removeWorker(mongo.channels,{_id: {$in:fixtureIds}}),
                        removeWorker(mongo.channelListeners,
                                     {$or:[{'channel':{$in:fixtureIds}},
                                           {'listener':{$in:fixtureIds}}]}),
                        removeWorker(mongo.channelListensTos,
                                     {$or:[{'channel':{$in:fixtureIds}},
                                           {'listensTo':{$in:fixtureIds}}]}),
                        removeWorker(mongo.blips,
                                     {$or:[{'author._id':{$in:fixtureIds}},
                                           {'place._id':{$in:fixtureIds}},
                                           {'topics':{$in:fixtureIds}}]}),
                        removeWorker(mongo.receivedBlips,
                                     {$or: [{'user':{$in:fixtureIds}},
                                            {'author':{$in:fixtureIds}},
                                            {'placeId':{$in:fixtureIds}}]}),
                        removeWorker(mongo.notifications,
                                     {'user':{$in:fixtureIds}}),
                       ], callback);
      });
    }, 
    topics: function (callback) { 
      mongo.topics.remove({isFixture: true}, callback);
    },
    notifications: function (callback) { 
      mongo.notifications.remove({isFixture:true}, callback);
    }, 
    blips: function (callback) {
      mongo.blips.remove({$or:[{'author.isFixture':true},
                               {'place.isFixture':true},
                               {isFixture:true}]}, callback);
    }
  }, function (err, results) { 
    callback();
  });
}
exports.MongoFix = MongoFix;
exports.cleanup = cleanup;
