/**
 * @fileoverview Blip API for blip manipulation
 * @author vladimir@blipboard.com
 */
var winston = require('winston');

var mw = require('./middleware');
var blipManager = require('../managers/blipManager');
var channelManager = require('../managers/channelManager');
var js = require('../lib/javascript');
var logutil = require('../lib/logutil');
var logHandler = logutil.logHandler;
var logCallback = logutil.logCallback;
var mongo = require('../lib/mongo');
var resource = require('./resource');
var BBError = require('../lib/error').BBError;

require('../lib/functional');

var api = {
  getPopularBlips: function getPopularBlips (request, callback) {
    if (request.version1_0) { 
      winston.info("client version: " + request.header('BlipboardClientVersion'));
    }
    
    if ( request.bounds.area === 0 ) {
      return callback(null, [ ]);
    }

    var userId = request.user ? request.user._id : null;
    var topicIds = resource.topicIdsFromResource(request.param('topicids'));
    
    blipManager.getPopularBlips(userId,
                                { bounds: request.bounds,
                                  location: request.location,
                                  type: request.param('type'),
                                  limit: request.param('limit'),
                                  topicIds: topicIds 
                                }, 
                                logHandler("blipManager.getPopularBlips",request.user._id,
                                           callback,
                                           function (blips) {
                                             var rblips = blips.map(resource.blipToResource.curry(request));
                                             callback(undefined,{blips:rblips});
                                           }));
  },
  
  likeBlip: function likeBlip(request, callback) { 
    blipManager.like(request.id, request.user._id, function(error, result) {
      if (error) {
        callback(error); 
      }
      else {
        callback(null, {likes: resource.likesToResource(request, result)} );
      }
    });
  },

  unlikeBlip: function unlikeBlip(request, callback) {
    blipManager.unlike(request.id, request.user._id, function(error, result) {
      if (error) {
        callback(error); 
      }
      else {
        callback(null, {likes: resource.likesToResource(request, result)} );
      }
    });
  },

  getBlip: function getBlip (request, callback) {
    var userId = request.user ? request.user._id : null;
    blipManager.getBlip(request.id, userId, function(error,blip) {
      if (error) {
        callback(error);
      }
      else {
        callback(null, {blip: resource.blipToResource(request, blip)});
      }
    });
  },

  markRead: function markRead(request, callback) { 
    blipManager.markReceivedBlipRead(request.user._id, request.id, callback);
  },
  
  deleteBlip: function deleteBlip (request, callback) {
    callback(BBError.notImplemented());
  },

  broadcastBlip: function broadcastBlip (request, callback) {
    callback(BBError.notImplemented());
  },

  searchBlips: function searchBlips (request, callback) {
    callback(BBError.notImplemented());
  },

  addComment: function addComment (request, callback) {
    var blipId = request.id;
    blipManager.addComment(blipId, request.user._id, request.text,function (error,result) {
      if (error) {
        callback(error);
      }
      else {
        callback(null,{comment: resource.commentToResource(request, result)});
      }
    });
  },

  deleteComment: function deleteComment (request,callback) {
    var userId = request.user ? request.user._id : null;
    blipManager.deleteComment(request.commentId,userId,callback);
  }
};

exports.api = api;
exports.map = [
  { method: 'get',    path: '/popular',        action: api.getPopularBlips,
    stack: [ mw.stats("blip.popular"), mw.authenticate, mw.impression,
             mw.requireBoundsOrLocation, mw.restrictBounds ] },

  { method: 'get', path: '/:id',               action: api.getBlip,
    stack: [ mw.stats("blip.get"), mw.authenticate, mw.impression, mw.requireObjectID('id') ] },
  { method: 'delete', path: '/:id',            action: api.deleteBlip,
    stack: [ mw.stats("blip.delete"), mw.authenticate, mw.requireObjectID('id') ] },

  { method: 'post', path: '/:id/likes',        action: api.likeBlip, 
    stack: [ mw.stats("blip.like"), mw.authenticate, mw.requireObjectID('id')] },
  { method: 'delete', path: '/:id/likes',      action: api.unlikeBlip, 
    stack: [ mw.stats("blip.unlike"), mw.authenticate, mw.requireObjectID('id')] },

  { method: 'post', path: '/:id/received/mark-read', action: api.markRead, 
    stack: [ mw.stats("blip.markRead"), mw.authenticate, mw.requireObjectID('id')] },


  { method: 'post',   path: '/:id/comments',      action: api.addComment,
    stack: [ mw.stats("blip.comment"), mw.authenticate, mw.requireObjectID('id'), mw.requireParam('text') ] },

  { method: 'delete', path: '/blips/comments/:commentId', action: api.deleteComment,
    stack: [ mw.authenticate, mw.requireParam('commentId') ] }

];




