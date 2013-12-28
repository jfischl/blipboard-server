/**
 * @fileoverview Channel manager
 * @author aneil@blipboard.com
 */

var assert = require('assert');
var async = require('async');
var sets = require('simplesets');
var sprintf = require('sprintf').sprintf;
var winston = require('winston');

var ObjectID = require('../lib/mongo').ObjectID;
var blipManager = require('./blipManager');
var channelEvents = require('./channelEvents');
var className = require('../lib/javascript').className;
var config = require('../config');
var js = require('../lib/javascript');
var listenNetworkManager = require('./listenNetworkManager');
var mongo = require('../lib/mongo');
var notificationManager = require('./notificationManager');
var topicManager = require('./topicManager');
var pushnot = require('../lib/pushnot');
var v = require('./validate');
var channelType = require('../config').MONGO.channelType;

/**
 * @desc Retrieve information about a particular channel
 */
var getChannel = function ( myId, channelId, callback ) {
  v.validate( {myId: [myId, v.isClass(ObjectID)],
               channel: [ channelId, v.loadDocument(mongo.channels) ] },
              callback,
              function (prepared) { 
                var decorated = isListeningDecoratorCallback(myId, callback);
                decorated = topicManager.decorateChannelsWithTopics(decorated);
                decorated(null, prepared.channel);
              });
};

/**
 * @desc Retrieve information about a list of Channels 
 * pass in list of chids
 */
var getChannels = function ( myId, channelIds, callback ) {
  v.validate( {myId: [myId, v.undefinedOK, v.isClass(ObjectID)],
               channelIds: [ channelIds, v.areAllClass(ObjectID) ] },
              callback,
              function (prepared) { 
                var decorated = isListeningDecoratorCallback(myId, callback);
                decorated = topicManager.decorateChannelsWithTopics(decorated);
                mongo.channels.findItems({"_id":{$in:prepared.channelIds}}, function(error,channels) { 
                  decorated(error,channels);
                });
              });
};

/**
 * Decorates a list of returned channel documents with isListening attribute.
 * if a single channel is passed in (instead of an Array) it will return a single decorated channel
 * @param {ObjectID} listenerId the user who is listening
 * @param {function(error,channels)} callback a callback expected to provide a list of channel documents
 * @return {function(error,channels)} returns a modified callback which decorates each channel document with isListening
 */
var isListeningDecoratorCallback = function isListeningDecoratorCallback  (listenerId,callback) {
  function decorateWithIsListening(channels) {
    // we'll manipulate the paging data if we need to but still pass back paging structure in the callback
    var passedInChannels = channels; 

    channels = channels || [ ];
    var singleChannel = false;
    if (channels && channels.paging && channels.data) { 
      // handles the case where the channels are in paging format
      channels = channels.data;
    }
    else if ( !(channels instanceof Array) ) { 
      channels = [ channels ]; 
      singleChannel = true;
    }

    //winston.debug("channelManager.isListeningDecoratorCallback(post): " + js.pp(channels));

    if (listenerId) { // could be null in the case of a non-logged in user
      listenNetworkManager.findListensTos(listenerId, function (error, channelIds) {
        if (error) { 
          return callback(error); 
        }
        channelIds = channelIds || [ ];
        
        // make a set for efficient testing:
        var listensToSet = new sets.Set(channelIds.map(function(id) { return id.toString(); }));
        
        // decorate each channel with .isListening
        channels.forEach(function(channel) {
          var channelId = channel._id.toString();
          channel.isListening = listensToSet.has(channelId); // if its in the listensTo set
        });
        
        if (singleChannel) { 
          assert(channels.length === 1);
          callback(null, channels[0]);
        }
        else {
          callback(null, passedInChannels);
        }
      });
    }
    else {  // no listenerId
      if (singleChannel) { 
        assert(channels.length === 1);
        callback(null, channels[0]);
      }
      else {
        callback(null,passedInChannels);
      }
    }
  }

  return mongo.mongoHandler("decoratingWithIsListening", callback, decorateWithIsListening);
};

/**
 * Decorates a list of returned blip documents with Author and Place Channel documents
 * Adds isListening property to both author and place 
 * @param {ObjectID} listenerId the user who is listening
 * @param {function(error,blips)} callback a callback expected to provide a list of blip documents
 * @return {function(error,blips)} returns a modified callback which decorates each blip document with author and place (join)
 */
var decorateChannelsForBlipsCallback = function decorateChannelsForBlipsCallback (listenerId, callback) {

  function collectIds(blips) { 
    var channelIds = [];
    blips.forEach(function (blip) { 
      assert(blip);
      if (blip.author && blip.author._id) { 
        channelIds.push(blip.author._id);
      }
      if (blip.place && blip.place._id) {
        channelIds.push(blip.place._id);
      }
    });
    return channelIds;
  }

  function decorate(input) {
    var blips = input || [];
    var singleBlip = false;

    if (blips.paging && blips.data) { 
      // handles the case where the blips are in paging format
      blips = blips.data;
    }
    else if ( !(blips instanceof Array) ) { 
      blips = [ blips ]; 
      singleBlip = true;
    }

    var channelIds = collectIds(blips);
    getChannels(listenerId, channelIds, function(error, list) { 
      if (error) { 
        winston.info("channelManager.decorateChannelsForBlipsCallback: " + js.pp(error));
        winston.debug("channelManager.decorateChannelsForBlipsCallback: listenerId=" + listenerId + " channelIds: " + js.ppc(channelIds));
        return callback(error);
      }

      // create a dictionary of the channels reference in the blips
      var channels = {};
      list.forEach(function(channel) { 
        assert(channel._id);
        channels[channel._id] = channel;
      });
      
      // this filters out any blips that don't have a matching channel
      blips = blips.filter(function(blip) { 
        if (channels[blip.place._id] && channels[blip.author._id]) { 
          return true;
        }
        else {
          winston.info("channelManager.decorateChannelsForBlips: warning: missing channel " + js.pp(blip) );
        }
      });
      
      blips.forEach(function(blip, index) { 
        assert(channels[blip.author._id]);
        assert(channels[blip.place._id]);
        blip.author = channels[blip.author._id]; 
        blip.place = channels[blip.place._id];
      });

      if (singleBlip) { 
        assert(blips.length === 1);
        callback(null, blips[0]);
      }
      else {
        callback(null, input);
      } 
    });
  }
  return mongo.mongoHandler("decoratingWithIsListening",callback, decorate);
};




/**
 * returns a function which takes a channelId and followerId
 *         and updates the stats.followers count of channelId by {count}
 *         and updates the stats.following count of followerId by {count}
 * @param {number} count integer value to increment (decrement) the counts by
 * @returns {function(channelId,followerId)} an event handler suitable for either
 *                 addedChannelListener or removedChannelListener
 *                 (note: followerId is ignored)
 */
function updateStatsOnFollowAction(count) {
  return function updateStats(channelId,followerId) {
    async.parallel({
      followers: function(callback) { 
        mongo.channels.update({_id:channelId},{$inc:{'stats.followers':count}}, callback);
      },
      following: function(callback) { 
        mongo.channels.update({_id:followerId},{$inc:{'stats.following':count}}, callback);
      }
    }, function(error) { 
      if (error) { 
        // fire the listenersCountInvalid event!
        channelEvents.listenersCountInvalid(channelId);
      }
    });
  };
}

var notifyChannelOfNewListener = function notifyChannelOfNewListener(channelId, listenerId) { 
  // only notify if the channel is a UserChannel
  mongo.channels.findOne({_id:channelId, type:config.MONGO.channelType.user}, 
                         {fields:['_id', 'recommended']}, createNotification);
  
  function createNotification(error, user) {
    if (!error && user) {
      mongo.channels.findOne({_id:listenerId}, {fields:['name']}, function(error, listener) {
        if (!error && listener) {
          notificationManager.makeNewListenerNotification(user, listener);
        }
      });
    }
  }
};

var updateRefreshTime = function updateRefreshTime(channelId, callback) {
  var now = new Date();
  //winston.info("channelManager.updateRefreshTime: " + channelId + " -> " + now);
  mongo.channels.update({_id:channelId}, {$set:{'facebook.lastRefresh': now}}, {safe:true}, callback);
};

// updates the next channel 
var scheduleNextRefresh = function scheduleNextRefresh(callback) { 
  var stale = new Date();
  stale.setHours(stale.getHours()-config.FACEBOOK.placeRefreshPostsInterval);

  function refresh(error, channel) {
    if (channel) {
      assert (channel.facebook && channel.facebook.lastRefresh !== undefined);
      var now = new Date(), nextTimeout;
      nextTimeout = new Date(channel.facebook.lastRefresh);
      nextTimeout.setHours(nextTimeout.getHours()+config.FACEBOOK.placeRefreshPostsInterval);

      if (now.getTime() > nextTimeout.getTime() ) {
        winston.info("channelManager.scheduleNextRefresh refresh " + channel._id);
        channelEvents.refreshChannelBlips(channel._id);
        callback();
      }
      else {
        winston.info("channelManager.scheduleNextRefresh: " + JSON.stringify(channel) + " at:" + nextTimeout);
        setTimeout(channelEvents.refreshChannelBlips, (nextTimeout.getTime() - now.getTime()), channel._id);
        callback();
      }
    }
    else {
      winston.info("channelManager: refresh error occurred. Try again in 15 seconds");
      setTimeout(channelEvents.refreshChannelBlips, 15000, undefined);
      callback();
    }
  }

  mongo.channels.findOne({'type': config.MONGO.channelType.place, 
                          'facebook.lastRefresh': {$exists: true} }, 
                         {'_id': 1, 'facebook.lastRefresh': 1}, // fields
                         {sort:[['facebook.lastRefresh',1]]},   // sort
                         refresh);
};

var recommendUserChannel = function recommendUserChannel(channelId, callback) 
{
  winston.info("Recommend user channel " + channelId);
  v.validate( {channelId: [channelId, v.isClass(ObjectID), v.idsExist(mongo.channels)]}, callback, recommend);
  function recommend(prepared) { 
    mongo.channels.update({_id: channelId, type:config.MONGO.channelType.user}, {$set: {recommended: true}}, callback);
  }
};

var deleteChannel = function deleteChannel(channelId, callback) 
{
  winston.info("Deleting channel " + channelId);
  
  function remove(prepared) { 
    function removeWorker(collection,criterion) {
      return function removeFixtures(callback) {
        collection.remove(criterion,callback);
      };
    }
    
    async.parallel([removeWorker(mongo.channels,{_id: channelId}),
                    removeWorker(mongo.channelListeners,
                                 {$or:[{'channel':channelId},
                                       {'listener':channelId}]}),
                    removeWorker(mongo.channelListensTos,
                                 {$or:[{'channel':channelId},
                                       {'listensTo':channelId}]}),
                    removeWorker(mongo.blips,
                                 {$or:[{'author._id':channelId},
                                       {'place._id':channelId},
                                       {'topics':channelId}]}),
                    removeWorker(mongo.receivedBlips,
                                 {$or:[{'user':channelId}, 
                                       {'author':channelId},
                                       {'placeId':channelId}]})],
                   function (error,result) {
                     if (error) {
                       winston.error("Failed: " + error);
                       callback(error);
                     }
                     else {
                       callback();
                     }
                   });
  }
  v.validate( {channelId: [channelId, v.isClass(ObjectID)]}, callback, remove);
};


/**
 * finds the listeners of a channel - returning the joined channel documents
 * @param {ObjectID} channelId
 * @param {function(err,channels)} channels is array of channel documents
 **/
var findListeners = function findListeners(channelId, isListeningId, callback) {
  listenNetworkManager.findListeners(channelId, function (error, chids) {
    if (error) { 
      callback(error);
    }
    else {
      mongo.channels.findItems({"_id":{$in:chids}},
                          isListeningDecoratorCallback(isListeningId,callback));
    }
  });
};

/**
 * finds the channels listening to channel - returning the joined channel documents
 * @param {ObjectID} channelId
 * @param {function(err,channels)} channels is array of channel documents
 **/
var findListensTos = function findListensTos(channelId, isListeningId, callback) {
  listenNetworkManager.findListensTos(channelId, function (error, chids) {
    if (error) { 
      callback(error);
    }
    else {
      mongo.channels.findItems({"_id":{$in:chids}},
                               isListeningDecoratorCallback(isListeningId,callback));
    }
  });
};

var adjustBlipsCount = function adjustBlipsCount(id, delta, callback) 
{
  if (!callback) { 
    callback = js.noop;
  }
  mongo.channels.update({_id: id}, {$inc: {'stats.blips': delta}}, callback);
};

var adjustChannelScore = function adjustChannelScore(id, delta, callback) 
{ 
  if (!callback) { 
    callback = js.noop;
  }
  winston.info("channelManager.adjustChannelScore: " + id + " -> " + delta);
  mongo.channels.update({_id: id}, {$inc: {'stats.score': delta}}, callback);
};

var initializeChannelScore = function initializeChannelScore(id, callback) { 
  blipManager.getBlipCountForAuthor(id, function (error, count) { 
    if (error) {
      winston.error("channelManager.initializeChannelScore: error: " + error);
      callback(error); 
    }
    else {
      winston.info("channelManager.initializeChannelScore: " + id + " -> " + count);
      mongo.channels.update({_id: id}, {$set: {'stats.score': count}}, callback);  
    }
  });
};

var setLastReadNotification = function setLastReadNotification(user, notificationId, callback) 
{
  winston.debug("channelManager.setLastReadNotification: " + user._id + " -> " + notificationId);
  mongo.channels.update({_id: user._id}, {$set: {lastReadNotificationId: notificationId}}, callback);
};

var initializeStats = function initializeStats(id, callback) 
{
  async.auto({
    countBlips: function(callback) { 
      mongo.blips.count({$or: [{'author._id': id}, {'place._id': id}], blacklisted: {$ne: true}}, callback);
    }, 
    countFollowers: function(callback) { 
      mongo.channelListeners.count({channel: id}, callback);
    }, 
    countFollowing: function(callback) { 
      mongo.channelListensTos.count({channel: id}, callback);
    }, 
    countLikesAndComments: function(callback) { 
      mongo.blips.find({'author._id': id, blacklisted: {$ne: true}}).toArray(function(error, blips) { 
        if (error) { 
          return callback(error);
        }
        var count = blips.reduce(function(prev,blip) { 
          return prev + (blip.likes ? blip.likes.length : 0) + (blip.comments ? blip.comments.length : 0);
        }, 0);
        callback(null, count);
      });
    }, 
    
    update: ['countBlips', 'countFollowers', 'countFollowing', 'countLikesAndComments', function(callback, results) {
      var stats = {stats: {blips: results.countBlips,
                           followers: results.countFollowers,
                           following: results.countFollowing,
                           score: results.countLikesAndComments + results.countBlips}
                  };
      console.log(id + " initializing stats: " + js.ppc(stats));
      mongo.channels.update({_id: id}, 
                            {$set: stats, $unset: {score: 1, listenersCount: 1}},
                            callback);
    }]
  }, callback);
};

var mergePlaceChannels = function mergePlaceChannels(channelId, toMergeId, callback) 
{
  v.validate( { channel: [ channelId, v.loadDocument(mongo.channels) ] ,
                mergeChannel: [ toMergeId, v.loadDocument(mongo.channels) ]},
              callback,
              merge);
  function merge(prepared) { 
    assert (prepared.channel.type === channelType.place && 
            prepared.mergeChannel.type === channelType.place);
    winston.info("Merging " + js.pp(prepared.channel._id) + " with " + js.pp(prepared.mergeChannel._id));
    
    async.auto({
      updateFollowers: function(callback) { 
        mongo.channelListeners.update({channel: toMergeId}, {$set: {channel: channelId}}, {multi:true}, function(error,result) {
          if (error && error.code === 11001) { 
            error = null;
          }
          callback(error, result);
        });
      }, 
      updateFollowing: function(callback) { 
        mongo.channelListensTos.update({listensTo: toMergeId}, {$set: {listensTo: channelId}}, {multi:true}, function(error,result) {
          if (error && error.code === 11001) { 
            error = null;
          }
          callback(error, result);
        });
      }, 
      updatePlaceBlips: function(callback) {
        mongo.blips.update({'place._id': toMergeId}, {$set: {'place._id': channelId}}, {multi:true}, callback);
      },
      updatePersonBlips: function(callback) {
        mongo.blips.update({'author._id': toMergeId}, {$set: {'author._id': channelId}}, {multi:true}, callback);
      },
      updateReceivedBlips: function(callback) { 
        mongo.receivedBlips.update({'placeId': toMergeId}, {$set: {placeId: channelId}}, {multi:true}, callback);
      },
      updateReceivedBlipsAuthor: function(callback) { 
        mongo.receivedBlips.update({'author': toMergeId}, {$set: {author: channelId}}, {multi:true}, callback);
      },
      updateChannelNotifications: function(callback) { 
        mongo.notifications.update({channelId: toMergeId}, {$set: {channelId: channelId}}, {multi:true}, callback);
      },
      updatePlaceNotifications: function(callback) { 
        mongo.notifications.update({placeId: toMergeId}, {$set: {placeId: channelId}}, {multi:true}, callback);
      },
      blacklist: function(callback) { 
        mongo.channels.update({_id: toMergeId}, {$set: {blacklisted: true, ignore: true}}, callback);
      },
      updateStats: ['updateFollowers', 
                    'updateFollowing', 
                    'updatePlaceBlips', 
                    'updatePersonBlips', 
                    'updateReceivedBlips', 
                    'updateReceivedBlipsAuthor', 
                    'updateChannelNotifications', 
                    'updatePlaceNotifications', 
                    'blacklist', 
                    function(callback, results) { 
                      initializeStats(channelId, callback);
                    }], 
    }, callback);
  }
};


exports.getChannel = getChannel;
exports.getChannels = getChannels;
exports.findListeners = findListeners;
exports.findListensTos = findListensTos;
exports.isListeningDecoratorCallback = isListeningDecoratorCallback;
exports.decorateChannelsForBlipsCallback = decorateChannelsForBlipsCallback;
exports.updateRefreshTime = updateRefreshTime;
exports.scheduleNextRefresh = scheduleNextRefresh;
exports.deleteChannel = deleteChannel;
exports.recommendUserChannel = recommendUserChannel;
exports.minimumChannelFieldSelector = {_id:1,name:1,displayName:1,description:1,picture:1,type:1};
exports.adjustBlipsCount = adjustBlipsCount;
exports.adjustChannelScore = adjustChannelScore;
exports.initializeChannelScore = initializeChannelScore;
exports.setLastReadNotification = setLastReadNotification;
exports.initializeStats = initializeStats;
exports.mergePlaceChannels = mergePlaceChannels;

channelEvents.onAddedChannelListener(updateStatsOnFollowAction(1));
channelEvents.onAddedChannelListener(notifyChannelOfNewListener);
channelEvents.onRemovedChannelListener(updateStatsOnFollowAction(-1));
