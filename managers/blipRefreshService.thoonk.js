var assert = require('assert');
var async = require('async');
var sprintf = require('sprintf').sprintf;
var winston = require('winston');

var blipManager = require('./blipManager');
var channelEvents = require('./channelEvents');
var config = require('../config');
var facebook = require('../lib/facebook');
var mongo = require('../lib/mongo');
var ObjectID = mongo.ObjectID;
var v = require('./validate');

var thoonk,jobs;

var loadBlips = function loadBlips(channelId, callback) {
  function processNewChannel(prepared) {
    function broadcast(blip, callback) {
      if (blip.message) {
        blipManager.broadcastFacebookPost(prepared.channel.facebook.id, blip, callback);
      }
    }
    
    winston.info("blipRefreshService: newChannel: " + JSON.stringify(prepared));
    if (prepared.channel.type === config.MONGO.channelType.place && prepared.channel.facebook.id) {
      winston.log("info", "blipRefreshService: newChannel: " + prepared.channel.facebook.id);
      facebook.getBlips(prepared.channel.facebook.id, function (error, blips) {
        if (!error) {
          var now = new Date(); 
          var expires=new Date();
          expires = expires.setHours(now.getHours() + 1);
          async.forEach(blips, broadcast, function (err) {
            var refresh = { channelId: channelId, at: expires };
            winston.info("blipRefreshService: scheduling a refresh on " + JSON.stringify(refresh));
            jobs.put(refresh, callback);
          });
        }
      });
    } // if a valid facebook place channel
  }

  winston.info("blipRefreshService: " + channelId);
  v.validate({ channel: [ channelId, v.loadDocument(mongo.channels) ] },
             function errBack(error) {
               winston.log("blipRefreshService: error loading new channnel " + channelId + " : " + JSON.stringify(error,null,1));
               callback(error);
             },
             processNewChannel);
};

/** 

*/
var nextItem = function nextItem() {
  var TIMEOUT = 15;
  // refreshItem = { channelId: blipChannelID, at: Date }
  function refresh(error, refreshItem, id, timedout) { 
    function load() {
      winston.info("Load blips at " + refreshItem.channelId);
      loadBlips(ObjectID(refreshItem.channelId), function() {
        jobs.finish(id);
        process.nextTick(nextItem);
      });
    }

    if (timedout) {
      winston.info("blipRefreshServer: timedout");
      process.nextTick(nextItem);
    }
    else if (!error) {
      var now = new Date(),
      at = new Date(refreshItem.at);
      if (at < now) {
        winston.info("blipRefreshService: refresh job fired: " + id + " :" + refreshItem.channelId);
        load();
      }
      else {
        winston.info("blipRefreshService: refresh job wait: " + id + " until " + (at - now));
        setTimeout(function() { process.nextTick(nextItem); }, TIMEOUT*1000);
      }
    }
  }
  
  jobs.get(TIMEOUT, refresh); // after 60 seconds, put job back in job queue
};

var initializePublisher = function initialize() {
  thoonk = require("thoonk").createClient(config.REDIS.hostname, config.REDIS.port, config.REDIS.database);
  jobs = thoonk.job(config.REDIS.queues.refresher);

  jobs.once("ready", function() {  
    channelEvents.onFirstListenerToChannel(function (channelId) {
      winston.info("blipRefreshService: onFirstListenerToChannel: " + channelId);
      loadBlips(channelId, function() {});
    });
  });
};

var initializeConsumer = function initializeConsumer() {
  thoonk = require("thoonk").createClient(config.REDIS.hostname, config.REDIS.port, config.REDIS.database);
  jobs = thoonk.job(config.REDIS.queues.refresher);
  
  jobs.once("ready", function() {
    winston.info("blipRefreshService: polling refresh job queue");
    nextItem();
  });
};

exports.initializePublisher = initializePublisher;
exports.initializeConsumer = initializeConsumer;

