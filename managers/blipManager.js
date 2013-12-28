/**
 * @fileoverview Blip manager
 * @author aneil@blipboard.com
 */
var moment = require('moment');
var assert = require('assert');
var async = require('async');
var sets = require('simplesets');
var sprintf = require('sprintf').sprintf;
var winston = require('winston');

var TileStatusEnum = require('./tileManager').Enum;
var blipNotificationService = require('./blipNotificationService');
var blipRefreshService = require('./blipRefreshService');
var categories = require('../data/categories');
var channelEvents = require('./channelEvents');
var channelManager = require('./channelManager');
var config = require('../config');
var js = require('../lib/javascript');
var listenNetworkManager = require('./listenNetworkManager');
var mongo = require('../lib/mongo');
var notificationManager = require('./notificationManager');
var placeManager = require('./placeManager');
var pushnot = require('../lib/pushnot');
var topicManager = require('./topicManager');
var userManager = require('./userManager');
var v = require('./validate');

var BBError = require('../lib/error').BBError;
var ObjectID = require('../lib/mongo').ObjectID;
var Tile = require('../lib/tile').Tile;
var assertClass = require('../lib/javascript').assertClass;
var channelType = require('../config').MONGO.channelType;
var classOf = require('../lib/javascript').classOf;
var logMongoCallback = mongo.logMongoCallback;
var logMongoHandler = mongo.logMongoHandler;
var mongoHandler = mongo.mongoHandler;

var abbreviatedChannel = function abbreviatedChannel(channel) 
{
  // This is no longer required as we do a join with the Channel before returning the blip
  var abbrev = {
    // Base Channel
    _id: channel._id, 
    name: channel.name,
    type: channel.type,
    location: channel.location
  };

  if (channel.facebook && channel.facebook.id) { 
    js.setPathValue(abbrev, ['facebook', 'id'], channel.facebook.id);
  }
  
  return abbrev;
};

/* params : { 
     authorId: ObjectId,
     placeId: ObjectId,
     topicIds: [ObjectId*],
     message: String,
     expiryTime: ISODate,
     facebook: facebookPost // optional dictionary if this is from facebook post
     alert: Bool // alert the nearby users
 */
var broadcast = function broadcast(params, callback) {
  v.validate({ place:      [ params.placeId, v.loadDocument(mongo.channels, {type:channelType.place}) ],
               author:     [ params.authorId, v.loadDocument(mongo.channels, {blacklisted: {$ne: true}}) ],
               topicIds:   [ params.topicIds, v.undefinedOK, v.idsExist(mongo.topics) ],
               message:    [ params.message, v.isClass(String), v.test(mustHaveContent) ], 
               expiryTime: [ params.expiryTime, v.prepareDate ],
               callback:   [ callback, v.isClass(Function) ] },
             callback,
             createBlip);
  
  function createBlip(prepared) {
    if (!prepared.topicIds || prepared.topicIds.length === 0) { 
      prepared.topicIds = [prepared.place.defaultTopicId];
      winston.info("blipManager.broadcast: adding default topicID " + prepared.place.defaultTopicId + " since none specified");
    }

    var match, blip = { message:  prepared.message, 
                        author:   abbreviatedChannel(prepared.author),
                        place:    abbreviatedChannel(prepared.place),
                        topicIds: prepared.topicIds,
                        createdTime: new Date(),
                        expiryTime:  new Date(prepared.expiryTime) };

    if (params.facebook) {
      blip.facebook = { postid: params.facebook.id,
                        objectId: params.facebook.object_id,
                        type: params.facebook.type,
                        picture: params.facebook.picture, // thumbnail
                        source: params.facebook.source,   // source photo
                        sourceWidth: params.facebook.sourceWidth, // source photo width
                        sourceHeight: params.facebook.sourceHeight, // source photo height
                        link: params.facebook.link,
                        likeCount:  params.facebook.likes ? params.facebook.likes.count||0 : 0,
                        commentCount: params.facebook.comments ? params.facebook.comments.count||0 : 0 };
      blip.createdTime = new Date(params.facebook.created_time);
    }
    else {
      blip.createdTime = new Date();
      blip.likes = []; 
    }

    // only determine an effective date (aka blue blip) if it's a place blip
    if (blip.author.type === channelType.place) { 
      evaluateEffectiveDate(blip);
    }

    blip.popularity = blipPopularity(blip);

    if (blip.author.type == channelType.place && !blip.effectiveDate) { 
      blip.blacklisted = true;
    }

    mongo.blips.insert(blip, distributeAndReturnDoc);
  }

  function distributeAndReturnDoc(error, result) {
    if (error) {
      winston.error("blipManager.broadcast error:" + JSON.stringify(error));
      callback(BBError.mongoFailed({cause:error}));
    }
    else {
      result = (result instanceof Array) ? result[0] : result;
      assert(result);
      winston.info("blipManager.broadcast: " + result._id + " -> " 
                   + result.message.substring(0,25) 
                   + " ("+ result.author.name + "/" + result.author._id + ")"
                   + " topicids=" + js.ppc(result.topicIds)
                   + " created=" + result.createdTime 
                   + " effective=" + result.effectiveDate
                   + " expiry=" + result.expiryTime);

      channelManager.adjustBlipsCount(result.author._id, 1);
      if (!result.place._id.equals(result.author._id)) { 
        channelManager.adjustBlipsCount(result.place._id, 1);
      }

      channelManager.adjustChannelScore(result.author._id, 1); 
      distributeBlipToListeners(result._id, params.alert, function (error,result) {
        if (error) {
          winston.error("blipManager.broadcast distributeBlipToListeners error: " + JSON.stringify(error));
        }
      });
      
      // need to decorate the blip so it has isListening and topics
      callback = channelManager.decorateChannelsForBlipsCallback(result.author._id, callback);
      callback = topicManager.decorateBlipsWithTopics(callback);
      callback(null,result);
    }
  }
  function isPlaceType(c) { 
    winston.log('info',"isPlaceType: ("+ JSON.stringify(c)+")");
    return c.type === channelType.place;
  }
  function mustHaveContent(message) {
    var trimmedMessage = message.replace(/^\s*|\s*$/g, '');
    return trimmedMessage.length>1;
  }
};

var lookupDay = { "sunday": 0, 
                  "monday": 1, 
                  "tuesday": 2, 
                  "wednesday": 3, 
                  "thursday": 4, 
                  "friday": 5, 
                  "saturday": 6 };

// !JCF! Note: the timezone offset should be based on the timezone of the blip.place
var evaluateEffectiveDate = function evaluateEffectiveDate ( blip ) {
  var createdTime = moment(blip.createdTime.getTime());
  var match=null;
  var tzOffset = 480 - blip.createdTime.getTimezoneOffset(); // hardcoded for now! should be based on the place's timezone

  function eod(t) { 
    return moment(t).subtract('minutes',tzOffset).endOf('day').add('minutes',tzOffset);
  }
  function day(t, d) { 
    return moment(t).subtract('minutes',tzOffset).endOf('day').day(d).add('minutes',tzOffset);    
  }

  if ( blip.message.match(/\b(thanks)|(congrat(ulation)?s)\b/i)) {
    blip.effectiveDate = new Date(0);
    blip.expiryTime = blip.effectiveDate;
  }
  else if ( blip.message.match(/\btomorrow\b/i) ) {
    blip.effectiveDate = eod(createdTime).add('days',1).toDate();
    blip.expiryTime = blip.effectiveDate;
  }
  else if ( blip.message.match(/\b(today|tonight|tonite)\b/i) ) {
    blip.effectiveDate = eod(createdTime).toDate();
    blip.expiryTime = blip.effectiveDate;
  }
  else if ( blip.message.match(/\bweekend\b/i) ) {
    blip.effectiveDate = day(createdTime, 7).toDate();
    blip.expiryTime = blip.effectiveDate;
  }
  else if ( match = blip.message.match(/\b(last\s+)?((sunday)|(monday)|(tuesday)|(wednesday)|(thursday)|(friday)|(saturday))\b/i) ) {
    var d = lookupDay[match[0].toLowerCase()];
    if (d===undefined) { // !am! it's not a day, so it must be "last {day}"
      blip.effectiveDate = new Date(0); // force it to be in the past
      blip.expiryTime = blip.effectiveDate;
    }
    else {
      if (d < createdTime.subtract('minutes',tzOffset).day()) { 
        d += 7;
      }
      blip.effectiveDate = day(createdTime, d).toDate();
      blip.expiryTime = blip.effectiveDate;
    }
  }
};

var broadcastFacebookPost = function broadcastFacebookPost(facebookId, post, notify, callback) {
  mongo.channels.findOne({"facebook.id": facebookId}, {fields:['_id', 'facebook', 'name', 'defaultTopicId']}, function (error,channel) {
    if (error) {
      winston.info("blipManager.broadcastFacebookPost: couldn't add facebook post to blips: ", error);
      callback(error);
    }
    else {
      assert(callback !== undefined);
      winston.info("blipManager.broadcastFacebookPost: " + facebookId 
                   + " ("+ channel.name+")" 
                   + " @" + post.created_time 
                   + " : " + post.message.substring(0,25));

      var createdTime = post.created_time instanceof Date ? post.created_time : new Date(post.created_time);
      var expiryTime = new Date(createdTime.getTime() + config.EXPIRY.place);
      var doc = {authorId: channel._id, 
                 placeId: channel._id, 
                 message: post.message,
                 expiryTime: expiryTime,
                 facebook: post,
                 alert: notify};
      if (channel.defaultTopicId) { 
        doc.topicIds = [channel.defaultTopicId];
      }
      else { 
        winston.info("No default topic for " + js.pp(channel));
        assert(0);
      }

      broadcast(doc, callback);
    }
  });
};

/**
 * Retrieves array of blips (with paging specified in options)
 * @param {Object} criterion mongoDB find criterion
 * @param {Object} options {until:ObjectID,since:ObjectID,limit:Number,fields:String*}
 * @param {Function(error,blipsArray)} callback
 */
var retrieveBlips = function retrieveBlips(criterion, options, callback) {
  // !jcf! note: filter out the facebook video posts for now
  criterion['facebook.type'] = {$ne: 'video'};

  if (options.since) {
    criterion.createdTime = { $gte: options.since }; 
  }
  if (options.until) {
    criterion.createdTime = { $lte: options.until };
  }
  if (options.topicIds && options.topicIds.length > 0) { 
    criterion.topicIds = {$in: options.topicIds};
  }
  var queryOptions = {};

  if (options.fields) {
    queryOptions = {fields:fields};
  }
  var query = mongo.blips.find(filterBlacklisted(criterion),queryOptions);
  
  if (options.limit) {
    query = query.limit(options.limit);
  }

  query.sort({createdTime:-1});
  
  query.toArray(callback);
};

/**
 * Gets all the blips where blip.author._id = channelId
 * @param {ObjectID} channelId
 * @param {Object} options {until:ObjectID,since:ObjectID,limit:Number,fields:String*}
 * @param {Function(error,channelDocs)} callback
 */
var getBroadcastsByChannel = function getBroadcastsByChannel(channelId, options, callback) {
  if (!callback) {
    callback = options;
    options = {};
  }
  v.validate( { channelId: [ channelId, v.idsExist(mongo.channels) ],
                limit:     [ options.limit, v.undefinedOK, v.isClass(Number) ],
                topicIds:  [ options.topicIds, v.areAllClass(ObjectID) ],
                since:     [ options.since, v.undefinedOK, v.isClass(ObjectID) ],
                until:     [ options.until, v.undefinedOK, v.isClass(ObjectID) ],
                fields:    [ options.fields, v.undefinedOK, v.isClass(Array) ],
                callback:  [ callback, v.isClass(Function) ]
              },
              callback,
              function retrieveBroadcasts(prepared) {
                var decorated = channelManager.decorateChannelsForBlipsCallback(channelId, callback);
                decorated = topicManager.decorateBlipsWithTopics(decorated);
                retrieveBlips({'author._id':channelId}, prepared, decorated);
              });
};

/**
 * calculates a numeric value representing popularity
 * @param {blip} blip object
 */
var blipPopularity = function blipPopularity(blip) {
  // shamelessly ripping off the Reddit algorithm for now...
  // http://bibwild.wordpress.com/2012/05/08/reddit-story-ranking-algorithm/
  var blipLikes = (blip.likes) ? blip.likes.length : 0;
  var score = blipLikes * config.POPULAR.likeMultiplier ; 
  //var displacement = Math.log(score)/Math.LN10; 
  var blipDate = new Date(blip.createdTime);

  // if the author is a user, make the blip more popular (as if it were authored 90 days in the future)
  if (blip.author.type === channelType.user) { 
    blipDate.setDate(blipDate.getDate() + config.POPULAR.peopleBlipBoost);
  }
  else if (blip.effectiveDate) { 
    blipDate.setDate(blipDate.getDate() + config.POPULAR.effectiveBlipBoost);    
  }

  var epoch = blipDate.getTime();
  var timePeriod = config.POPULAR.timePeriod; 
  var popularity = score + epoch/timePeriod;

  winston.debug(sprintf("blipManager.blipPopularity %s created=%s adjusted=%s likes=%d popularity=%f likex=%f time-period=%f",
                        blip.author.type, blip.createdTime, blipDate, blipLikes, popularity, config.POPULAR.likeMultiplier, timePeriod)); 

  return popularity; //Math.round((displacement + epoch/timePeriod)*10^7)/10^7; 
};

var updateBlipPopularity = function updateBlipPopularity(blipOrId,callback) {
  if (classOf(blipOrId)===ObjectID) {
    v.validate({ blip: [blipOrId, v.loadDocument(mongo.blips,blipOrId)] },
               callback,
               onValidated);
  }
  else if (classOf(blipOrId)===Object) {
    onValidated({blip:blipOrId});
  }

  function onValidated(prepared) {
    //winston.info("updateBlipPopularity: " + JSON.stringify(prepared.blipOrId,null,1));
    var popularity = blipPopularity(prepared.blip);
    mongo.blips.update({_id:prepared.blip._id}, 
                       {$set:{popularity: popularity}},
                       {safe:true},
                       mongo.mongoHandler("updateBlipPopularity " + popularity, callback));
  }
};

var getPopularBlips = function getPopularBlips(listenerId, params, callback) {
  function sortBlips(blips) { 
    blips.sort(function(a,b) { 
      return b.popularity-a.popularity; 
    });
    return blips;
  }

  function findBlips(criterion) { 
    var decorate = channelManager.decorateChannelsForBlipsCallback(listenerId, callback);
    decorate = topicManager.decorateBlipsWithTopics(decorate);
    
    // !jcf! this approach works but is not very efficient if there are many popular blips in the region since group
    // can't be limited. can switch to map/reduce or aggregation framework (in 2.2)
    mongo.blips.group( ['place._id'],  // keys (group by)
                       filterExpired(filterBlacklisted(criterion)), // cond
                       { 'popularity': 0}, // initial
                       function(doc,out) { // reduce
                         if (out.popularity < doc.popularity) { 
                           out.popularity = doc.popularity; 
                           out._id = doc._id;
                         }
                       },
                       null, // finalize
                       null, // command 
                       function (error, results) { // callback
                         //assert(!error);
                         if (error) { 
                           winston.info("blipManager.getPopularBlips mongo error: " + js.pp(error));
                           return callback(error);
                         }

                         //winston.debug("criterion=" + js.pp(criterion));
                         //winston.debug("results=" + js.pp(results));


                         var sortedIds = sortBlips(results).map(function(blip) { 
                           return blip._id; 
                         });

                         mongo.blips.find({'_id':{$in: sortedIds}})
                           .sort({popularity:-1})
                           .limit(config.POPULAR.limit)
                           .toArray(decorate);
                       });
  }
  
  function onValidated(prepared) {
    var criterion,cursor;

    if (prepared.location.tileIndexes) {
      //winston.debug("blipManager.getPopularBlips type=" + params.type + " topicids=" + params.topicIds + " for tileIndexes: "+ prepared.location.tileIndexes.length);
      criterion = {'place.location.tileIndex':Tile.simplifyTileCodesAsRegExp(prepared.location.tileIndexes),
                   'place.location.latitude': {$gte: prepared.location.southwest.latitude,
                                               $lte: prepared.location.northeast.latitude},
                   'place.location.longitude':{$gte: prepared.location.southwest.longitude,
                                               $lte: prepared.location.northeast.longitude}
                  };
    }
    else {
      assert(prepared.location.tileIndex);
      criterion = {'place.location.tileIndex':prepared.location.tileIndex};
    }

    if (params.type) { 
      criterion['author.type'] = params.type;
    }
    else { // force to user if not specified. 
      criterion['author.type'] = channelType.user;
    }

    if (params.topicIds && params.topicIds.length > 0) {
      criterion.topicIds = {$in: params.topicIds};
    }

    findBlips(criterion);
  }

  if (params.bounds) {
    v.validate({ location: [params.bounds, v.isBounds, v.addBoundsTileIndexes] }, callback, onValidated);
  }
  else {
    v.validate({ location: [ params.location, v.isLocation, v.addLocationTileIndex] }, callback, onValidated);
  }
};

// Retrieve blips for channelId personalized for the user (userId). 
var getChannelBlipStream = function getChannelBlipStream(userId, channelId, options, callback) {
  function retrieveStream(prepared) {
    var criterion;

    switch (prepared.channel.type) {
    case channelType.user:
      criterion = {'author._id': prepared.channel._id};
      break;

    case channelType.place:
      criterion = {'place._id': prepared.channel._id};
      break;
      
    default:
      callback(BBError.notImplemented());
      break;
    }

    var decorated = channelManager.decorateChannelsForBlipsCallback(userId, callback);
    decorated = topicManager.decorateBlipsWithTopics(decorated);
    //winston.debug("blipManager.getChannelBlipStream: " + js.pp(criterion) + " " + js.pp(prepared));
    retrieveBlips(criterion, prepared, decorated);
  }


  function process(prepared) {
    if (prepared.channel.type === channelType.place && 
        prepared.channel.facebook && 
        prepared.channel.facebook.lastRefresh === undefined) {
      winston.info("blipManager.getChannelBlipStream: loading blip stream from facebook for " + prepared.channel.name);
      //winston.info(JSON.stringify(prepared.channel,null,1));

      // !jcf! commented this out since the spider should keep everything up to date. 
      // blipRefreshService.loadBlips(prepared.channel._id, function (error) {
      //   retrieveStream(prepared);
      // });
      retrieveStream(prepared);
    }
    else {
      retrieveStream(prepared);
    }
  }

  if (!callback) {
    callback = options;
    options = {};
  }

  v.validate( { channel: [ channelId, v.loadDocument(mongo.channels) ],
                topicIds:  [ options.topicIds, v.areAllClass(ObjectID) ],
                limit:     [ options.limit, v.undefinedOK, v.isClass(Number) ],
                since:     [ options.since, v.undefinedOK, v.isClass(ObjectID) ],
                until:     [ options.until, v.undefinedOK, v.isClass(ObjectID) ],
                fields: [ options.fields, v.undefinedOK, v.isClass(Array) ]
              },
              callback,
              process
            );
};

/**
 * Adds a comment
 * @param {ObjectID} - blipId
 * @param {ObjectID} - userId of commenter
 * @param {String} - text of comment
 * @param {function(error,comment)} - {id:"blipId_commentId",author:{}, message:"....", createdTime:}
 */
var addComment = function addComment(blipId, commentAuthorId, text, callback) {
  var handleBlip = function handleBlip(newComment, blip) { 
    async.series([
      function notifyBlipAuthor(callback) {
        // notify blip.author and each blip.comments.author 
        //    do not notify blip.likers at this time?
      
        // notify author of blip: 'Bob commented on your blip."
        if (!newComment.author._id.equals(blip.author._id)) {
          var message = newComment.author.name + " commented on your blip";
          notificationManager.makeNewCommentNotification(blip.author._id, blip._id, newComment.id, message, callback);
        }
        else {
          callback();
        }
      },
      function incrementScore(callback) { 
        channelManager.adjustChannelScore(blip.author._id, 1, callback);
      },
      function notifyOtherCommenters(callback) { 
        // notify other commenters
        var notified = new sets.StringSet([blip.author._id,commentAuthorId]);
        async.eachSeries(blip.comments, function(comment, callback) { 
          if (!notified.has(comment.author._id)) {
            var message = newComment.author.name + " commented on a blip you commented on";
            notified.add(comment.author._id);
            notificationManager.makeNewCommentNotification(comment.author._id, blip._id, newComment.id, message, callback);
          }
          else {
            callback();
          }
        }, callback);
      }
    ], function(error, results) { 
      if (error) { 
        winston.info("blipManager.addComment: error: " + js.pp(error));
        callback(error);
      }
      else {
        //winston.debug("blipManager.addComment: added" + js.pp(newComment));
        callback(null,newComment); 
      }
    });
  };
  
  function onValidated(prepared) {
    var commentPartId = new mongo.ObjectID();
    var newComment = { 
      id:blipId.toString()+"_"+commentPartId.toString(),
      author:prepared.author,
      text:text,
      createdTime:new Date() 
    };
    
    winston.info(sprintf("blipManager.addComment blipId:%s commentAuthor:%s (%s)",
                         blipId.toString(), newComment.author.name, newComment.author._id.toString()));
    mongo.blips.findAndModify({_id:blipId},
                              {}, // sort
                              {$push:{comments:newComment}},
                              {safe:true,multi:false,'new':true},
                              mongo.logMongoHandler("blipManager.addComment",
                                                    newComment,
                                                    callback,
                                                    handleBlip.curry(newComment)));
  }

  v.validate({  blipId:      [blipId, v.idsExist(mongo.blips)],
                author:      [commentAuthorId, v.loadDocument(mongo.channels,{},
                                                              channelManager.minimumChannelFieldSelector)],
                text:        [text, v.isClass(String)] },
             callback,
             onValidated);
};

/**
 * Deletes a comment given a commentId.  If commentAuthorId is given, comment will be deleted only if author matches
 * @param {String} - commentId
 * @param {ObjectID} - optional id of the Author of the comment
 * @param {function(error,blip) - result is the modified blip object
 * Note: commentIds, unlike collection Ids, are strings of the form "{blipId}_{commentObjectId}"
 *       This is necessary because comments are stored inside the blips they comment on.
 */
var deleteComment = function deleteComment(commentId,commentAuthorId,callback) {
  if (!callback && js.classOf(commentAuthorId) === Function) {
    callback = commentAuthorId;
    commentAuthorId = undefined;
  }
  var commentIdParts = commentId.split("_");
  var blipIdString = commentIdParts[0];
  var commentPartIdString = commentIdParts[1];
  try {
    var blipId = mongo.ObjectID(blipIdString);
  }
  catch (e) {
    return callback(BBError.validationError(sprintf("commentId (%s): invalid",commentId)));
  }
  
  function decrementScore(blip) { 
    channelManager.adjustChannelScore(blip.author._id, -1);
  }

  function onValidated(prepared) {
    var pullCriterion = {id:commentId};
    if (commentAuthorId) {
      pullCriterion['author._id'] = commentAuthorId;
    }
    mongo.blips.findAndModify({ _id:blipId },
                              {}, // sort
                              {$pull: { comments: pullCriterion}}, // update
                              {safe:true, multi:false, new:true, fields:{comments:1,author:1}}, // options
                              mongo.logMongoHandler("blipManager.deleteComment",
                                                    pullCriterion,
                                                    callback,
                                                    function onDeleted(blip) { 
                                                      decrementScore(blip);
                                                      callback(null,blip);
                                                    }));
  }

  v.validate( { blipId:   [ blipId, v.idsExist(mongo.blips) ],
                commentAuthorId: [ commentAuthorId, v.undefinedOK, v.isClass(mongo.ObjectID)] },
              callback,
              onValidated);             
};

/**
 * Finds a blip by Id
 * @param {function(error,blip)} - error is BBError.notFound on failure
 */
var getBlip = function getBlip(id, listenerId, callback) {
  var decorated;
  if (!callback) {
    // only id and callback provided - do not decorate with author.isListening
    callback = listenerId;
    listenerId = undefined;
    decorated = callback;
  }
  else {
    // listenerId provided
    assert(js.classOf(listenerId)===ObjectID);
    decorated = channelManager.decorateChannelsForBlipsCallback(listenerId, callback);
  }

  decorated = topicManager.decorateBlipsWithTopics(decorated);
  v.validate({id:[id, v.isClass(ObjectID), v.idsExist(mongo.blips)],
              listenerId:[listenerId,v.undefinedOK,v.isClass(ObjectID)]},
             callback,
             findTheBlip);

  function findTheBlip(prepared) {
    mongo.blips.findOne({_id:id}, decorated);
  }
};

var getBlips = function getBlips(listenerId, ids, callback) 
{ 
  assert(listenerId !== undefined);
  var decorated = channelManager.decorateChannelsForBlipsCallback(listenerId,callback);
  decorated = topicManager.decorateBlipsWithTopics(decorated);
  
  v.validate({ids:[ids, v.areAllClass(ObjectID), v.idsExist(mongo.blips)],
              listenerId:[listenerId,v.isClass(ObjectID)]},
             callback,
             function (prepared) { 
               mongo.blips.findItems({"_id":{$in:prepared.ids}},decorated);
             });
};

var setLike = function setLike(blipId, userId, value, callback) {
  function update(prepared) {
    var updater;
    //winston.debug("pre-like blip = " + JSON.stringify(prepared.blip,null,1));
    if (value) {
      updater = { $addToSet: {likes: {id: prepared.liker._id, 
                                      name: prepared.liker.name } } };
    }
    else {
      updater = { $pull: {likes: {id: prepared.liker._id} } }; 
    }

    async.waterfall([
      function updateBlip(callback) { 
        mongo.blips.findAndModify({_id: prepared.blip._id}, 
                                  [['_id', 'asc']],
                                  updater,
                                  { 'new':true },  
                                  function (err, blip) { 
                                    callback(err,blip);
                                  });
      },
      function updatePopularity(blip, callback) {
        updateBlipPopularity(blip, function() {
          callback(null, blip);
        });
      },
      function sendPushNotification(blip, callback) { 
        // !jf! note, this will send a push notification when somebody likes a blip that has already been liked. 
        if (value && prepared.blip.author.type === channelType.user) { 
          winston.info(sprintf("Notify %s(%s) that %s has liked their blip", 
                               prepared.blip.author.name,
                               prepared.blip.author._id,
                               prepared.liker.name));
          notificationManager.makeNewLikeNotification(prepared.liker, prepared.blip, function (error) { 
            callback(error, blip);
          });
        }
        else { 
          callback(null, blip);
        }
      }], function (err, blip) { 
        callback(err, blip); // return results of first function
      });
  }

  v.validate( {blip: [blipId, v.loadDocument(mongo.blips)],
               liker: [userId, v.loadDocument(mongo.channels, {type:channelType.user})]},
              callback,
              update );
};

var like = function like(blipId, userId, callback) {
  setLike(blipId, userId, true, function returnLikers(error, blip) {
    if (error) { 
      callback(error);
    }
    else {
      //winston.debug("post-like blip = " + JSON.stringify(blip,null,1));
      channelManager.adjustChannelScore(blip.author._id, 1); 
      callback(null, blip.likes || []);
    }
  });
};

var unlike = function like(blipId, userId, callback) {
  setLike(blipId, userId, false, function returnResult(error, blip) {
    if (error) { 
      callback(error);
    }
    else {
      channelManager.adjustChannelScore(blip.author._id, -1); 
      callback(null, blip.likes || []);
    }
  });
};


/**
 * Distributes a blip to all the listeners of that blip's author, topics and place
 * @param {ObjectID} blipId
 * @param {bool} notify if true, send push notification immediately to nearby users
 * @param {Function(error,results)} callback 
 *                  where results = { "userId1": userResult1, 
 *                                    "userId2": userResult2,
 *                                    ... }
 *                  each result is 0,1 or an error object
 */
var distributeBlipToListeners = function distributeBlipToListeners(blipId,notify,callback) {
  // !am! playing it conservatively here and getting the blip from the DB 
  //      The service can't rely on the caller correctly providing the
  //      authorId, placeId or topicIds for the blipId, so makes sure to 
  //      retrieve this from the DB itself.
  v.validate( { blip: [ blipId, v.loadDocument(mongo.blips) ] },
              callback,
              doDistribution );
  
  function doDistribution(prepared) {
    async.waterfall([findListeners, 
                     insertNewBlip],
                    function (error, result) {
                      if (error) {
                        winston.error("blipManager.distributeBlipToListeners("+blipId+"): Finished", error);
                      }
                      if (callback) {
                        callback(error,result);
                      }
                    });

    // WATERFALL METHOD 1
    function findListeners(wCallback) {
      // We want to find all of the listeners for the blip.
      // Sources of the blip are the author, place and topics:
      var blip = prepared.blip;
      var sources = [blip.author._id,blip.place._id];
      prepared.sources = sources; // for logging
      listenNetworkManager.findListeners(sources,wCallback);
    }
    
    // WATERFALL METHOD 2
    // inserts the blip in receivedBlips of all listeners
    function insertNewBlip(listeners,wCallback) {
      prepared.listeners = listeners; // for logging
      if (listeners.length===0) {
        return wCallback(undefined,{});
      }

      var listenersSet = new sets.StringSet(listeners); // unique set of listeners based on the blip's sources 
      var results = {}; // userIdString: null | insertedDoc | error, indicating result of update operation
      var usersToNotify = [];

      var insertReceivedBlipDoc = function insertReceivedBlipDoc(userId, qCallback) {
        // qCallback calls back with {userId: 0 | 1 | error, userId2:...}
        assert(prepared.blip.place._id);
        
        mongo.receivedBlips.insert({ user:userId, 
                                     tileIndex:prepared.blip.place.location.tileIndex,
                                     placeId: prepared.blip.place._id, 
                                     location: { 
                                       latitude: prepared.blip.place.location.latitude,
                                       longitude: prepared.blip.place.location.longitude
                                     },
                                     topicIds: prepared.blip.topicIds, 
                                     blip:blipId,
                                     author: prepared.blip.author._id,
                                     authorType: prepared.blip.author.type,
                                     isRead:false,
                                     createdTime:prepared.blip.createdTime,
                                     effectiveDate:prepared.blip.effectiveDate,
                                     popularity: prepared.blip.popularity,
                                     expiryTime:prepared.blip.expiryTime },
                                   { safe:true },  
                                   function (error,result) {
                                     // three outcomes: error, duplicate (no op), success
                                     if (error) {
                                       if (error.code == mongo.errors.duplicateKeyError) {
                                         results[userId.toString()] = 0; // no op
                                       }
                                       else {
                                         results[userId.toString()] = error; // failure!
                                         winston.error("blipManager.distributeBlipToListeners("
                                                       + JSON.stringify({blip:blipId,sources:prepared.sources,listeners:prepared.listeners})
                                                       + ") while inserting blip for user "+userId.toString(),
                                                       result);
                                       }
                                     }
                                     else { // success!
                                       //winston.debug("blipManager.distribute insert result:  "+ js.pp(result));
                                       if (result.length === 1) { 
                                         results[userId.toString()] = 1;
                                         usersToNotify.push(userId);
                                       }
                                       else {
                                         assert(result.length === 0); // should not be multiple inserts
                                         results[userId.toString()] = 0; // no op
                                       }
                                     }
                                     qCallback();
                                   });
      };

      var queue = async.queue(insertReceivedBlipDoc, config.MONGO.writeConcurrency);
      
      // queue each user to add the blip
      listenersSet.array().forEach(function (userId) {
        // don't notify the user about their own blips
        if (!prepared.blip.author._id.equals(userId)) {  
          queue.push(userId, function () {});
        }
      });
      
      // when all of the users' receivedBlips have been updated, notify users at the location
      queue.drain = function finished() {
        winston.info("blipManager.distributeBlipToListeners("
                      + JSON.stringify({blip:blipId,sources:prepared.sources,nlisteners:prepared.listeners.length})
                      + ") => updated receivedBlips for users " + JSON.stringify(usersToNotify));

        if (notify && usersToNotify.length>0) {
          blipNotificationService.pushNotifyUsersNearBlip(usersToNotify,
                                                          prepared.blip,
                                                          function (){});
        }
        wCallback(undefined,results);
      };
    } // end insertNewBlip
  } // end doDistribution
}; // end distributeBlipToListeners


var distributeBlipsOnTuneIn = function distributeBlipsOnTuneIn( channelId, listenerId, callback ) {
  var getChannel = function getChannel ( callback ) {
    mongo.channels.findOne({ _id: channelId }, callback);
  };

  var getBlips = function getBlips ( channel, callback ) {
    var options = { createdTime: -1 };

    if ( channel.type == channelType.place ) {
      options.limit = config.TUNE_IN_DISTRIBUTION.placeBlipLimit; // only the most recent
    } 
    else { 
      options.limit = config.TUNE_IN_DISTRIBUTION.userBlipLimit; // to avoid copying an ever-increasing number of blips
    }

    mongo.blips.find({ $and: [{'author._id': channelId},
                              {'author._id': {$ne: listenerId}}]}, 
                     options).toArray(callback);
  };

  var queueBlips = function queueBlips ( blips, callback ) {
    var tasks = [ ];
    var upsert = function upsert ( receivedDoc, callback ) {
      var selector = { user: receivedDoc.user, blip: receivedDoc.blip }
      var options = { upsert: true, safe: true }
      mongo.receivedBlips.update(selector, receivedDoc, options, function (error, result) {
        if ( error ) {
          winston.log('Queued blip with error: ' + error);
        }
        callback(error,result);
      });
    };
    var upsertTask = function upsertTask(receivedDoc) {
       return function(callback) {
          upsert(receivedDoc,callback);
       } ;
    };
    for ( var i = 0; i < blips.length; i++ ) {
      var blip = blips[i];
      var receivedDoc = {
        user: listenerId,
        blip: blip._id,
        author: blip.author._id,
        authorType: blip.author.type,
        tileIndex: blip.place.location.tileIndex,
        placeId: blip.place._id,
        location: {
          latitude: blip.place.location.latitude,
          longitude: blip.place.location.longitude
        },
        isRead: false,
        createdTime: blip.createdTime,
        expiryTime: blip.expiryTime
      };
      tasks.push(upsertTask(receivedDoc));
    }

    async.parallelLimit(tasks,config.MONGO.writeConcurrency,callback);

  };

  var finalCallback = function finalCallback ( error, result ) {
    callback(error, result);
  }

  async.waterfall([getChannel, getBlips, queueBlips], finalCallback );
}


/**
 * Marks a user's blips read for specific blipId
 * @param {ObjectID} userId
 * @param {String} blipId
 * @param {Function(error,numUpdated)} callback
 */
var markReceivedBlipRead = function markReceivedBlipsRead(userId, blipId, callback) 
{
  function onValidated(prepared) { 
    mongo.receivedBlips.update({blip:prepared.blip._id, user:userId, isRead:false},
                               {$set:{isRead:true}},
                               {upsert:false, safe:true},
                               function (error,result) {
                                 if (error) {
                                   winston.error("blipManager.markReceivedBlipsRead "+ userId, error);
                                   callback(BBError.mongoFailed({cause:error}));
                                 }
                                 else {
                                   winston.info("blipManager.markReceivedBlipsRead "+ userId + "=>"+result);
                                   callback(null,result);
                                 }
                               });
  }

  v.validate( { userId: [userId, v.isClass(ObjectID)],
                blip:   [ blipId, v.loadDocument(mongo.blips) ]  },
              callback,
              onValidated);
}

var markReceivedBlipsReadAtPlace = function markReceivedBlipsReadAtPlace(userId, placeId, callback) 
{
  function onValidated(prepared) { 
    mongo.receivedBlips.update({placeId: placeId, user:userId, isRead:false},
                               {$set:{isRead:true}},
                               {upsert:false, multi:true, safe:true},
                               function (error,result) {
                                 if (error) {
                                   winston.error("blipManager.markReceivedBlipsReadAtPlace "+ placeId, error);
                                   callback(BBError.mongoFailed({cause:error}));
                                 }
                                 else {
                                   winston.info("blipManager.markReceivedBlipsReadAtPlace "+ placeId + "=>"+result);
                                   callback(null,result);
                                 }
                               });
  }

  v.validate( { userId: [userId, v.isClass(ObjectID)] },
              callback,
              onValidated);
}


/**
 * Marks a user's blips read at a tileIndex.
 * @param {ObjectID} userId
 * @param {String} tileIndex
 * @param {Function(error,numUpdated)} callback
 */
var markReceivedBlipsRead = function markReceivedBlipsRead(userId, bounds, location, callback) 
{
  function onValidated(prepared) {
    var criterion; 
    if (prepared.bounds && prepared.bounds.tileIndexes) {
      criterion = {user:userId, 
                   tileIndex:Tile.simplifyTileCodesAsRegExp(prepared.bounds.tileIndexes), 
                   isRead:false};
    }
    else {
      assert(prepared.location.tileIndex);
      criterion = {user:userId, tileIndex:location.tileIndex, isRead:false};
    }

    mongo.receivedBlips.update(criterion,
                               {$set:{isRead:true}},
                               {upsert:false,multi:true,safe:true},
                               function (error,result) {
                                 if (error) {
                                   winston.error("blipManager.markReceivedBlipsRead "+ userId, error);
                                   callback(BBError.mongoFailed({cause:error}));
                                 }
                                 else {
                                   winston.info("blipManager.markReceivedBlipsRead "+ userId + "=>"+result);
                                   callback(null,result);
                                 }
                               });
  }

  if (bounds) {
    v.validate( { userId: [userId, v.isClass(ObjectID)],
                  bounds: [bounds, v.isBounds, v.addBoundsTileIndexes]},
                callback,
                onValidated);
    
    
  }
  else {
    v.validate( { userId:    [userId, v.isClass(ObjectID)],
                  location:  [location, v.isLocation, v.addLocationTileIndex ] },
                callback,
                onValidated);
  }
}

/**
 * Gets blips for the user near a location, unread blips first, most recent first
 * @param {ObjectID} userId
 * @param {Array} fields (optional) fields to be returned
 */
var getReceivedBlips = function getReceivedBlips(userId, options,  callback) {
  function onValidated(prepared) {
    var receivedBlips, criterion;

    if (prepared.bounds && prepared.bounds.tileIndexes) {
      criterion = { user: userId, 
                    authorType: 'user',
                    tileIndex:Tile.simplifyTileCodesAsRegExp(prepared.bounds.tileIndexes),
                    'location.latitude': {$gte: prepared.bounds.southwest.latitude,
                                          $lte: prepared.bounds.northeast.latitude},
                    'location.longitude':{$gte: prepared.bounds.southwest.longitude,
                                          $lte: prepared.bounds.northeast.longitude} };
    }
    else {
      assert(prepared.location.tileIndex);
      criterion = { user: userId, 
                    authorType: 'user',
                    tileIndex:prepared.location.tileIndex };
    }

    if (prepared.topicIds && prepared.topicIds.length > 0) { 
      criterion.topicIds = {$in: prepared.topicIds};
    }
    //winston.debug("blipManager.getReceivedBlips: " + js.pp(criterion));

    receivedBlips = mongo.receivedBlips.find(filterExpired(filterBlacklisted(criterion)),
                                             { fields:['blip','isRead'], _id:0,
                                               limit: config.POPULAR.limit }
                                            )
      .sort({ isRead:1, createdTime:-1 });

    var decorated = channelManager.decorateChannelsForBlipsCallback(userId, callback);
    decorated = topicManager.decorateBlipsWithTopics(decorated);

    mongo.join(receivedBlips, {blip:'_id'}, {isRead:'isRead'}, mongo.blips, {}, decorated);
  }

  if (options.bounds) {
    v.validate( { userId: [userId, v.isClass(ObjectID)],
                  topicIds:  [ options.topicIds, v.undefinedOK, v.areAllClass(ObjectID) ],
                  bounds: [options.bounds, v.isBounds, v.addBoundsTileIndexes]},
                callback,
                onValidated);
    
    
  }
  else {
    v.validate( { userId: [userId, v.isClass(ObjectID)],
                  topicIds:  [ options.topicIds, v.undefinedOK, v.areAllClass(ObjectID) ],
                  location: [options.location, v.isLocation, v.addLocationTileIndex ]},
                callback,
                onValidated);
  }
};

/**
 * @desc Upgrade criterion to filter unwanted blips
 * @property {object}
 * @return {object}
 */
var filterBlacklisted = function filterBlacklisted ( criterion ) {
  return {
    $and: [
      criterion,
      { 'blacklisted': { $ne: true } }, 
      { 'author.blacklisted': { $ne: true } }
      /*,{ 'place.blacklisted': { $ne: true } }*/ 
    ]
  };
};

var filterExpired = function filterExpired ( criterion ) {
  return { $and: [ criterion, { expiryTime: { $gt: new Date() } } ] }
}

var getBlipCountForAuthor = function getBlipCountForAuthor(authorId, callback) { 
  mongo.blips.count({'author._id': authorId}, callback);
};

// can pass in either array of blipIds or single blipId
var deleteBlips = function deleteBlips(blipIds, callback) 
{
  winston.info("blipManager.deleteBlips " + js.ppc(blipIds));
  blipIds = blipIds instanceof Array ? blipIds : [blipIds];    
  async.auto({
    getBlips: function(callback) { 
      mongo.blips.find({_id: {$in:blipIds}}).toArray(callback);
    }, 
    deleteReceivedBlips: ['getBlips', function(callback) { 
      mongo.receivedBlips.remove({blip:{$in:blipIds}}, callback);
    }],
    deleteNotifications: ['deleteNotifications', function (callback) {
      mongo.notifications.remove({blip:{$in:blipIds}}, callback); 
    }],
    deleteBlips: ['getBlips', function(callback) {
      mongo.blips.remove({_id:{$in:blipIds}}, callback);
    }],
    updateStats: ['deleteReceivedBlips', 'deleteBlips','deleteNotifications', function(callback, results) { 
      var authorIds = results.getBlips.map(function(blip) { return blip.author._id.toString(); });
      var placeIds = results.getBlips.map(function(blip) { return blip.place._id.toString(); });
      var ids = authorIds.concat(placeIds).filter(function(id, pos, self) {
        return self.indexOf(id) === pos;
      });
      ids = ids.map(function(id) { return ObjectID(id); });
      winston.debug("update: " + js.ppc(ids));
      async.each(ids, channelManager.initializeStats, callback);
    }]}, callback);
};


exports.distributeBlipsOnTuneIn = distributeBlipsOnTuneIn;
exports.distributeBlipToListeners = distributeBlipToListeners;
exports.findById = getBlip;
exports.getBlip = getBlip;
exports.getBlips = getBlips;
exports.like = like;
exports.unlike = unlike;
exports.broadcast = broadcast;
exports.broadcastFacebookPost = broadcastFacebookPost;
exports.getBroadcastsByChannel = getBroadcastsByChannel;
exports.getChannelBlipStream = getChannelBlipStream;
exports.markReceivedBlipsRead = markReceivedBlipsRead;
exports.markReceivedBlipRead = markReceivedBlipRead;
exports.markReceivedBlipsReadAtPlace = markReceivedBlipsReadAtPlace;
exports.getReceivedBlips = getReceivedBlips;
exports.getPopularBlips = getPopularBlips;
exports.updateBlipPopularity = updateBlipPopularity;
exports.blipPopularity = blipPopularity;
exports.addComment = addComment;
exports.deleteComment = deleteComment;
exports.evaluateEffectiveDate = evaluateEffectiveDate;
exports.getBlipCountForAuthor = getBlipCountForAuthor;
exports.deleteBlips = deleteBlips;
