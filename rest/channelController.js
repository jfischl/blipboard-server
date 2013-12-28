/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview Channel API for generic channel manipulation
 * @author vladimir@blipboard.com
 *
 * @created Thu, Feb 23 2012 - 20:44:33 -0800
 * @updated Thu, Feb 23 2012 - 20:44:49 -0800
 */

var assert = require('assert');
var winston = require('winston');

var BBError = require('../lib/error').BBError;
var blacklistManager = require('../managers/blacklistManager');
var blipManager = require('../managers/blipManager');
var channelManager = require('../managers/channelManager');
var className = require('../lib/javascript').className;
var config = require('../config');
var js = require('../lib/javascript');
var listenNetworkManager = require('../managers/listenNetworkManager');
var logCallback = require('../lib/logutil').logCallback;
var logHandler = require('../lib/logutil').logHandler;
var mongo = require('../lib/mongo');
var mw = require('./middleware');
var placeManager = require('../managers/placeManager');
var resource = require('./resource');
var userManager = require('../managers/userManager');


require('../lib/functional');

var api = {
  blacklist: function blacklist ( request, callback ) {
    console.log(request.user.name + ' is blacklisting channel (BBID): ' + request.id);

    if ( !request.user.isDeveloper ) {
      return callback(BBError.forbidden({ message: 'Only developers can blacklist channels'}));
    }

    var finalCallback = function finalCallback ( error ) {
      if ( error ) callback(error);
      else callback(null, true);
    };

    blacklistManager.markChannels(true, [request.id], finalCallback);
  },

  search: function search (request, callback) {
    function channelSearchComplete (error, result) {
      result = result || { data: [ ] };

      if (error) {
        callback(error);
      }
      else {
        result.data = result.data.map(resource.channelToResource.curry(request));
        callback(null, { channels : result });
      }
    }
    
    var options = {
      prefix: request.param('q'),
      bounds: request.bounds, 
      location: request.location, 
      page: request.page
    };

    var userId = request.user ? request.user._id : null;

    switch (request.param('type')) {
    case config.MONGO.channelType.place:     
      placeManager.search(userId , options, 
                          logCallback("placeManager.search",{userId:userId,options:options},
                                      channelSearchComplete));
      break;
    case config.MONGO.channelType.user:
      userManager.search(userId, options,
                         logCallback("userManager.search", {userId:userId,options:options},
                                     channelSearchComplete));
      break;
    default:
      callback(BBError.notImplemented());
      break;
    }
  }, 

  createPlace: function createPlace(request, callback) { 
    callback(BBError.notImplemented());
  }, 

  getChannel: function getChannel (request, callback) {
    var onLoadedChannel = function onLoadedChannel ( error, channelDoc ) {
      if ( error ) return callback(error);

      var channel = resource.channelToResource(request, channelDoc);
      channel.isBlacklistable = request.user.isDeveloper;

      callback(null, { channel: channel });
    };

    channelManager.getChannel(request.user._id, request.id, onLoadedChannel);
  },

  updateChannel: function updateChannel (request, callback) {
    callback(BBError.notImplemented());
  },

  getReceivedBlips: function getReceivedBlips (request, callback) {
    var topicIds = resource.topicIdsFromResource(request.param('topicids'));
    blipManager.getReceivedBlips(request.user._id, 
                                 { bounds: request.bounds, 
                                   location: request.location,
                                   topicIds: topicIds
                                 },
                                 logHandler("blipManager.getReceivedBlips", request.user._id,
                                            callback,
                                            function (blips) {
                                              callback(undefined,{blips:blips.map(resource.blipToResource.curry(request))});
                                            }));
  },
  
  getBroadcastsByChannel: function getBroadcastsByChannel (request, callback) {
    var topicIds = resource.topicIdsFromResource(request.param('topicids'));
    var limit = parseInt(request.param('limit'),10);
    limit = isNaN(limit) ? undefined : limit;
    blipManager.getBroadcastsByChannel(request.id, {topicIds: topicIds, limit:limit}, 
                                       function(error,blips) {
                                         if (error) {
                                           callback(error); 
                                         }
                                         else {
                                           callback(null, { blips: blips.map(resource.blipToResource.curry(request)) });
                                         }
                                       });
  },
  
  getChannelBlipStream: function getChannelBlipStream (request, callback) {
    //winston.debug("getChannelBlipStream " + request.param("topicids"));

    var topicIds = resource.topicIdsFromResource(request.param('topicids'));
    var limit = parseInt(request.param('limit'),10);
    limit = isNaN(limit) ? undefined : limit;
    
    blipManager.getChannelBlipStream(request.user._id, request.id, {topicIds: topicIds, limit:limit}, 
                                     function(error,blips) {
                                       if (error) {
                                         callback(error); 
                                       }
                                       else {
                                         callback(null, { blips: blips.map(resource.blipToResource.curry(request)) });
                                       }
                                     });
  },

  broadcastBlip: function broadcastBlip (request, callback) {
    // !jcf! verify that authorid is permitted to broadcast on this channel
    var topicIds = resource.topicIdsFromResource(request.param('topicids'));
    blipManager.broadcast({ authorId: request.authorid,
                            placeId: request.placeid,
                            topicIds: topicIds,
                            message: request.param('message'),
                            expiryTime: request.param('expiry'),
                            alert: true
                          },
                          function (error, document) {
                            if (error) {
                              callback(error); 
                            }
                            else {
                              callback(null, { blip: resource.blipToResource(request, document) });
                            }
                          });
  }, 

  markReceivedBlipsRead: function markReceivedBlipsRead (request, callback) {
    blipManager.markReceivedBlipsRead(request.user._id, request.bounds, request.location, callback);
  },

  markReceivedBlipsReadAtPlace: function markReceivedBlipsReadAtPlace (request, callback) { 
    blipManager.markReceivedBlipsReadAtPlace(request.user._id, request.pid, callback);
  }, 

  markReceivedBlipRead: function markReceivedBlipRead (request, callback) { 
    blipManager.markReceivedBlipRead(request.user._id, request.bid, callback);
  }, 

  listen: function listen (request, callback) {
    listenNetworkManager.listen(request.user._id,request.channelId,callback);
  },

  unlisten: function unlisten (request, callback) {
    listenNetworkManager.unlisten(request.user._id,request.channelId,callback);  // !am! must wrap this callback
  },

  listensTo: function listensTo (request, callback) {
    channelManager.findListensTos(request.channelId, request.user._id, function (error, channels) {
      if (error) {
        callback(error);
      }
      else {
        callback(null, {"channels.data": channels.map(resource.channelToResource.curry(request))});
      }
    });
  },
  listeners: function listeners (request, callback) {
    channelManager.findListeners(request.channelId, request.user._id, function (error, channels) {
      if (error) {
        callback(error);
      }
      else {
        callback(null, {"channels.data": channels.map(resource.channelToResource.curry(request))});
      }
    });
  }
};

exports.api = api;
exports.map = [
  // actions for blacklisting
  { method: 'post',   path: '/:id/blacklist', action: api.blacklist,
    stack:[ mw.stats("channel.blacklist"), mw.authenticate, mw.requireObjectID('id') ] },

  // actions on channels
  { method: 'get',    path: '', action: api.search,
    stack: [ mw.stats("channel.search"), mw.authenticate, mw.requireBoundsOrLocation, 
             mw.requirePage(
               [{name: 'stats.score', order: -1, type: function (value) { return value; } },
                {name: '_id', order: 1, type: 'objectID'}] )
           ] },
  
  // actions for a single channel
  { method: 'get',    path: '/:id',                   action: api.getChannel,
    stack: [ mw.stats("channel.get"), 
             mw.authenticate, 
             mw.impression, 
             mw.requireObjectID('id') ] },

  { method: 'put',    path: '/:id',                   action: api.updateChannel,
    stack: [ mw.stats("channel.update"),
             mw.authenticate,
             mw.requireObjectID('id') ] },

  { method: 'get',    path: '/:id/received',          action: api.getReceivedBlips,
    stack: [ mw.stats("channel.received.get"),
             mw.authenticate, 
             mw.impression, 
             mw.requireObjectID('id'), 
             mw.checkUserIdMatchesParam('id'),
             mw.requireBoundsOrLocation ] },

  { method: 'post',   path: '/:id/received/mark-read', action: api.markReceivedBlipsRead,
    stack: [ mw.stats("channel.received.markRead"),
             mw.authenticate, 
             mw.requireObjectID('id'), 
             mw.checkUserIdMatchesParam('id'), 
             mw.requireBoundsOrLocation ] },    

  { method: 'post',   path: '/:id/received/place/:pid/mark-read', action: api.markReceivedBlipsReadAtPlace,
    stack: [ mw.stats("channel.received.place.markRead"),
             mw.authenticate, 
             mw.requireObjectID('id'), 
             mw.checkUserIdMatchesParam('id'), 
             mw.requireObjectID('pid') ] },    

  { method: 'post',   path: '/:id/received/blip/:bid/mark-read', action: api.markReceivedBlipRead,
    stack: [ mw.stats("channel.received.blip.markRead"),
             mw.authenticate, 
             mw.requireObjectID('id'), 
             mw.checkUserIdMatchesParam('id'), 
             mw.requireObjectID('bid') ] },    

  { method: 'get',    path: '/:id/broadcasts',        action: api.getBroadcastsByChannel,
    stack: [ mw.stats("channel.broadcasts.get"),
             mw.authenticate, 
             mw.impression, 
             mw.requireObjectID('id') ] },

  { method: 'get',    path: '/:id/stream',            action: api.getChannelBlipStream,
    stack: [ mw.stats("channel.stream.get"),
             mw.authenticate, 
             mw.impression, 
             mw.requireObjectID('id') ] },

  { method: 'post',   path: '/:id/blips',             action: api.broadcastBlip,
    stack: [ mw.stats("channel.blips.create"),
             mw.authenticate, 
             mw.requireObjectID('id'), 
             mw.requireObjectID('authorid'), 
             mw.requireObjectID('placeid'),
             mw.checkUserIdMatchesParam('id'),       // only the authenticated user can broadcast on his channel
             mw.checkUserIdMatchesParam('authorid')
           ] },

  // Tune in:
  { method: 'post',   path: '/:id/listensTo/:channelId',   action: api.listen,
    stack: [ mw.stats("channel.follow"),
             mw.authenticate, 
             mw.requireObjectID('id'), 
             mw.requireObjectID('channelId'), 
             mw.checkUserIdMatchesParam('id') ] },

  { method: 'delete', path: '/:id/listensTo/:channelId',   action: api.unlisten,
    stack: [ mw.stats("channel.unfollow"),
             mw.authenticate, 
             mw.requireObjectID('id'), 
             mw.requireObjectID('channelId'), 
             mw.checkUserIdMatchesParam('id') ] },

  // Tune in network info:
  { method: 'get',    path: '/:channelId/listensTo',              action: api.listensTo, 
    stack: [ mw.stats("channel.follows.get"),
             mw.authenticate, 
             mw.impression, 
             mw.requireObjectID('channelId') ] },

  { method: 'get',    path: '/:channelId/listeners',              action: api.listeners,
    stack: [ mw.stats("channel.followers.get"),
             mw.authenticate, 
             mw.impression, 
             mw.requireObjectID('channelId') ] }

];
