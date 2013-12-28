/**
 * @fileoverview BlipRefreshService
 * @author jason@blipboard.com
 */

var config = require('../config');

// lib modules
var BBError = require('../lib/error').BBError;
var facebook = require('../lib/facebook');
var graphite = require('../lib/graphite');
var mongo = require('../lib/mongo');
var ObjectID = mongo.ObjectID;
var js = require('../lib/javascript');

// manager modules
var blipManager = require('./blipManager');
var blipNotificationService = require('./blipNotificationService');
var channelManager = require('./channelManager');
var channelEvents = require('./channelEvents');
var listenNetworkManager = require('./listenNetworkManager');
var userManager = require('./userManager');
var v = require('./validate');

// external modules
var assert = require('assert');
var async = require('async');
var sprintf = require('sprintf').sprintf;
var winston = require('winston');


var loadBlips = function loadBlips(channelId, callback) {
  function processNewChannel(prepared) {
    function broadcast(post, callback) {
      var notify = post.notify;
      if (post.message) {
        blipManager.broadcastFacebookPost(prepared.channel.facebook.id, post, notify, callback);
      }
      else { // means nothing to broadcast
        callback();
      }
    }
    if (prepared.channel.type === config.MONGO.channelType.place && prepared.channel.facebook.id && !prepared.channel.blacklisted) {
      winston.info(sprintf("blipRefreshService.loadBlips: %s (%s) topic=%s facebook=%s", 
                           prepared.channel.name,
                           prepared.channel._id, 
                           prepared.channel.defaultTopicId,
                           prepared.channel.facebook.id)); 
      facebook.getPosts(prepared.channel.facebook.id, prepared.channel.facebook.lastRefresh, function (error, posts) {
        if (!error) {
          // for now, filter out all posts that contain a link since we do not have a way to display them in the client. 
          var count = posts.length;
          posts = posts.filter(function(post) { 
            return post.type !== "link" && post.type !== "video";
          });

          var filtered = count - posts.length;
          if (filtered > 0) { 
            winston.info("blipRefreshService.loadBlips posts: " + posts.length + " filtered: " + filtered);
          }

          if (posts.length>0) {
            graphite.set("blips.insert.facebook", posts.length);
            if (filtered > 0) {
              graphite.set("blips.filter.facebook", filtered);
            }
            
            posts[0].notify=true;
            async.forEach(posts, broadcast, function (error,blips) {
              channelManager.updateRefreshTime(channelId, function (error) { 
                callback(null, posts.length); // let caller know how many posts
              });
            }); // async.forEach
          }
          else {
            channelManager.updateRefreshTime(channelId, function(error) { callback(error); });
          }
        }
        else { // error
          var code = js.pathValue(error, ['cause','error','code']);
          if (error.type === BBError.facebookError.type && code === 21) {
            // !jf! this should be somewhere else but it's sooo ugly I kind of only want it here. 
            mongo.channels.update({'facebook.id': prepared.channel.facebook.id}, {$set: {blacklisted: true}}, function() { 
              winston.debug("blipRefreshService: detected invalid facebook place. blacklisted it: " + error.cause.error.message);
              callback(error);
            });
          }
          else { 
            // don't update the refresh time since there was a (possibly) recoverable failure. 
            callback(); 
          }
        }
      });
    } // if a valid facebook place channel
    else {
      callback();
    }
  }

  assert(callback);
  v.validate({ channel: [ channelId, v.loadDocument(mongo.channels) ] },
             function errBack(error) {
               winston.log("blipRefreshService: error loading new channnel " + channelId + " : " + JSON.stringify(error));
               callback(error);
             },
             processNewChannel);
};

var initialize = function initialize() {
  channelEvents.onRefreshChannelBlips(function (channelId) {
    //winston.info("blipRefreshService: onRefreshChannelBlips: " + channelId);    
    if (channelId) {
      loadBlips(channelId, function afterLoad() {
      });
    }
  });
};

exports.initialize = initialize;
exports.loadBlips = loadBlips;
