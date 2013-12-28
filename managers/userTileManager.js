/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview stores information about tiles
 * @author aneil@blipboard.com
 *
 */
var mongo = require('../lib/mongo');

/** 
 * Retrieve the last update time from Facebook for place data at location's tile. 
 * @param {object} location a location object which has a tileIndex string
 * @param {function(error,lastUpdateTime)} callback with lastUpdateTime for this tile or 0 if no data at the tile. 
 */
var getLastFacebookUpdateTime = function getLastFacebookUpdateTime(location, callback) {
  function onFoundTileInfo(error, result) {
    if (error) {
      // !jcf! might want to consider logging but ignoring this error and returning existing data if it exists
      callback(error);
    }
    else if (result===null || result===undefined || !result.lastFacebookPlaceUpdateTime) {
      callback(null,0);
    }
    else {
      callback(null,result.lastFacebookPlaceUpdateTime);
    }
  }

  mongo.tileInfos.findOne({tileIndex: location.tileIndex}, 
                          {fields:['lastFacebookPlaceUpdateTime']}, 
                          onFoundTileInfo);
};

// !jcf! nothing to do if this fails. next update will do this again. 
var updateLastFacebookUpdateTime = function updateLastFacebookUpdateTime(location) {
  mongo.tileInfos.update({tileIndex:location.tileIndex},
                         {$set: {lastFacebookPlaceUpdateTime: new Date()}},
                         {safe: true, upsert:true});
};

exports.updateLastFacebookUpdateTime = updateLastFacebookUpdateTime;
exports.getLastFacebookUpdateTime = getLastFacebookUpdateTime;