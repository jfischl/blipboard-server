/**
 * Copyright (c) 2013 Blipboard. All rights reserved.
 *
 * @fileoverview topic manager
 * @author jason@blipboard.com
 *
 * @created 
 * @updated 
 */

var assert = require('assert');
var async = require('async');
var sets = require('simplesets');
var sprintf = require('sprintf').sprintf;
var winston = require('winston');

var BBError = require('../lib/error').BBError;
var config = require('../config');
var js = require('../lib/javascript');
var logutil = require('../lib/logutil');
var mongo = require('../lib/mongo');
var v = require('./validate');

var ObjectID = mongo.ObjectID;
var logCallback = logutil.logCallback;
var logHandler = logutil.logHandler;
var logMongoHandler = mongo.logMongoHandler;
var mongoHandler = mongo.mongoHandler;

var getTopics = function getTopics(page, callback) 
{
  assert(page);
  page.retrieve(mongo.topics, 
                {}, // all topics
                null,
                callback);
};

var getMatchingTopics = function getMatchingTopics(topicIds, callback) 
{
  v.validate( {topicIds: [ topicIds, v.areAllClass(ObjectID) ] },
              callback,
              function (prepared) { 
                mongo.topics.findItems({"_id":{$in:prepared.topicIds}},callback);
              });
};

/**
 * Decorates a list of returned blip documents with topics by mapping from topicIds to topic documents
 * if a single blip is passed in (instead of an Array) it will return a single decorated blip
 * @param {function(error,blip)} callback a callback expected to provide a list of blip documents
 * @return {function(error,blips)} returns a modified callback which decorates each blip document with Topics
 */
var decorateBlipsWithTopics = function decorateBlipsWithTopics(callback) 
{
  function objectIDToString(id) { 
    return id.toString(); 
  }

  function findTopicIds(blips) { 
    var topicIds = new sets.Set();
    blips.forEach(function(blip) { 
      if (blip.topicIds) { 
        topicIds = topicIds.union(new sets.Set(blip.topicIds.map(objectIDToString)));
      }
    });
    return topicIds;
  }

  function findMatchingTopic(topics, topicId) {
    for (var i=0; i<topics.length; i++) {
      if (topics[i]._id.toString() === topicId.toString()) {
        return topics[i];
      }
    }
    assert(false);
    return null;
  }

  function decorate(blips) {
    // we'll manipulate the paging data if we need to but still pass back paging structure in the callback
    var passedInBlips = blips; 

    blips = blips || [ ];
    var singleBlip = false;
    if (blips.paging && blips.data) { 
      // handles the case where the blips are in paging format
      blips = blips.data;
    }
    else if ( !(blips instanceof Array) ) { 
      blips = [ blips ]; 
      singleBlip = true;
    }

    var topicIds = findTopicIds(blips).array().map(mongo.ObjectID);
    getMatchingTopics(topicIds, function (error, topics) { 
      if (error) { 
        return callback(error);
      }
      blips.forEach(function(blip) {
        if (blip.topicIds) { 
          blip.topics = [];
          blip.topicIds.forEach(function (topicId) { 
            var topic = findMatchingTopic(topics, topicId);
            blip.topics.push(topic);
          });
        }
      });

      //winston.debug("topicManager.decorateBlipsWithTopics: " + js.pp(blips));
      if (singleBlip) { 
        assert(blips.length === 1);
        callback(null, blips[0]);
      }
      else {
        callback(null, passedInBlips);
      }
    });
  }
  
  return mongo.mongoHandler("decoratingBlipsWithTopics", callback, decorate);
};


/**
 * Decorates a list of returned channel documents with topics by mapping from topicIds to topic documents
 * if a single channel is passed in (instead of an Array) it will return a single decorated channel
 * @param {function(error,channel)} callback a callback expected to provide a list of channel documents
 * @return {function(error,channels)} returns a modified callback which decorates each channel document with Topics
 */
var decorateChannelsWithTopics = function decorateBlipsWithTopics(callback) 
{
  function objectIDToString(id) { 
    return id.toString(); 
  }

  function findTopicIds(channels) { 
    var topicIds = new sets.Set();
    channels.forEach(function(channel) { 
      if (channel.defaultTopicId) { 
        topicIds = topicIds.add(objectIDToString(channel.defaultTopicId));
      }
    });
    return topicIds;
  }

  function findMatchingTopic(topics, topicId) {
    for (var i=0; i<topics.length; i++) {
      if (topics[i]._id.toString() === topicId.toString()) {
        return topics[i];
      }
    }
    assert(false);
    return null;
  }

  function decorate(channels) {
    // we'll manipulate the paging data if we need to but still pass back paging structure in the callback
    var passedInChannels = channels; 

    channels = channels || [ ];
    var singleChannel = false;
    if (channels.paging && channels.data) { 
      // handles the case where the channels are in paging format
      channels = channels.data;
    }
    else if ( !(channels instanceof Array) ) { 
      channels = [ channels ]; 
      singleChannel = true;
    }

    var topicIds = findTopicIds(channels).array().map(mongo.ObjectID);
    getMatchingTopics(topicIds, function (error, topics) { 
      if (error) { 
        return callback(error);
      }
      channels.forEach(function(channel) {
        if (channel.defaultTopicId) { 
          channel.defaultTopic = findMatchingTopic(topics, channel.defaultTopicId);
        }
      });

      //winston.debug("topicManager.decorateChannelsWithTopics: " + js.pp(channels));
      if (singleChannel) { 
        assert(channels.length === 1);
        callback(null, channels[0]);
      }
      else {
        callback(null, passedInChannels);
      }
    });
  }
  
  return mongo.mongoHandler("decoratingChannelsWithTopics", callback, decorate);
};



var s3;
if (config.S3.key && config.S3.secret) { 
    s3 = require('s3').createClient({key: config.S3.key,
                                     secret: config.S3.secret,
                                     bucket: config.S3.imageBucket});
}

var uploadImage = function uploadImage(local, remote, callback) 
{
  if (!s3) { 
    return callback("AWS S3 keys not defined");
  }

  winston.debug("topicManager.uploadImage: " + local);
  var uploader = s3.upload(local, remote);
  uploader.on('error', function(err) {
    winston.error("topicManager.uploadImage: " + js.pp(err));
    callback(err);
  });
  
  uploader.on('end', function() {
    winston.info("topicManager.uploadImage: " + js.pp(remote) + " COMPLETE");
    callback();
  });
};

var loadDefinitions = function loadDefinitions(definitions, callback) 
{
  var loadDefinition = function loadDefinition(definition, callback) { 
    winston.info("topicManager.loadDefinitions: " + definition.identifier);
    var image1x = definition.identifier + ".png", image2x = definition.identifier+"@2x.png";
    async.series([
      function upload1x(callback) { 
        uploadImage(__dirname + "/../data/" + definition.pictureFile, image1x, callback);
      },
      function upload2x(callback) { 
        uploadImage(__dirname + "/../data/" + definition.pictureFile2x, image2x, callback);
      },
      function updateDatabase(callback) { 
        mongo.topics.update({identifier: definition.identifier},
                            {$set: {parentId: definition.parentId,
                                    name: definition.name,
                                    description: definition.description,
                                    picture: config.S3.imagesBaseUrl + image1x,
                                    picture2x: config.S3.imagesBaseUrl + image2x
                                   }
                            },
                            {upsert: true}, 
                            function (error, result) { 
                              winston.info(definition.identifier + " : " + js.pp(error));
                              callback(error);
                            });  
      }], callback);
  };
  winston.debug("definitions: " + js.pp(definitions));
  assert(mongo.topics);
  async.eachSeries(definitions, loadDefinition, callback);
};

exports.getTopics = getTopics;
exports.getMatchingTopics = getMatchingTopics;
exports.decorateBlipsWithTopics = decorateBlipsWithTopics;
exports.decorateChannelsWithTopics = decorateChannelsWithTopics;
exports.loadDefinitions = loadDefinitions;
