/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview stores information about tiles
 * @author aneil@blipboard.com
 *
 */
var assert = require('assert');
var winston = require('winston');

var mongo = require('../lib/mongo');
var js = require('../lib/javascript');
var assertClass = require('../lib/javascript').assertClass;

var TileStatusEnum = { 
  FRESH: 0,
  STALE: 1,
  REFRESHING: 2,
  NODATA: 3
};

/** 
 * Retrieve the last update time from Facebook for place data at location's tile. 
 * @param {object} tileIndex 
 * @param {function(error,tileIndex,lastUpdateTime, refreshTime)} callback with lastUpdateTime for tileIndex or 
 *                                                   lastUpdateTime=0 if no data at the tile. 
 */
var getLastFacebookUpdateTime = function getLastFacebookUpdateTime(tileIndex, callback) {
  function onFoundTileInfo(error, result) {
    if (error) {
      // !jcf! might want to consider logging but ignoring this error and returning existing data if it exists
      callback(error);
    }
    else if (result===null || result===undefined || !result.lastFacebookPlaceUpdateTime) {
      callback(null,tileIndex, 0, 0);
    }
    else {
      callback(null, tileIndex, result.lastFacebookPlaceUpdateTime, result.refreshTime);
    }
  }

  mongo.tileInfos.findOne({tileIndex: tileIndex}, 
                          {fields:['lastFacebookPlaceUpdateTime','refreshTime']}, 
                          onFoundTileInfo);
};

// !jcf! nothing to do if this fails. next update will do this again. 
// if offset is specified, it will mark the tile as updated at now + offsetInSecs
// this is useful if you want to mark a tile not to be updated until some time in the future. 
var updateLastFacebookUpdateTime = function updateLastFacebookUpdateTime(tileIndex, offsetInSecs) {
  var now = new Date();
  if (offsetInSecs) { 
    now.setSeconds(now.getSeconds() + offsetInSecs);
  }
  assertClass(tileIndex, String);
  mongo.tileInfos.update({tileIndex: tileIndex},
                         {$set: { lastFacebookPlaceUpdateTime: now, refreshTime: 0} },
                         {upsert:true, safe:true}, 
                         function(error,result) { 
                           if (error) {
                             winston.debug("tileManager:update: " + tileIndex + " ERR=" + js.pp(error));
                           }
                         });
};

var refreshingFacebook = function refreshingFacebook(tileIndex) { 
  mongo.tileInfos.update({tileIndex:tileIndex},
                         {$set: {refreshTime: new Date()}},
                         {upsert:true, safe:false});
};

exports.updateLastFacebookUpdateTime = updateLastFacebookUpdateTime;
exports.getLastFacebookUpdateTime = getLastFacebookUpdateTime;
exports.refreshingFacebook = refreshingFacebook;
exports.Enum = TileStatusEnum;
