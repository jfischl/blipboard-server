/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview Initializes mongo database using config.MONGO.collections values
 * @usage var mongo = require('./lib/mongo')
 *        mongo.initialize(function (err,data) { 
 *            // do stuff after mongo is initialized
 *        }
 * @author vladimir@blipboard.com, aneil@blipboard.com
 *
 * @created Wed, Feb 22 2012 - 16:11:30 -0800
 * @updated Thu, Feb 23 2012 - 17:45:06 -0800
 */

var winston = require('winston');
var logutil = require('./logutil');
var logHandler = logutil.logHandler;
var logCallback = logutil.logCallback;
var async = require('async');
var mongoConfig = require('../config').MONGO;
var assertClass = require('./javascript').assertClass;
var classOf = require('./javascript').classOf;
var mongoskin = require('mongoskin');
var BBError = require('./error').BBError;
var sprintf = require('sprintf').sprintf;
var sets = require('simplesets');
var assert = require('assert');
var db; 
var _isInitialized = false;
var Tile = require('./tile').Tile;
var ObjectID = (new mongoskin.SkinDb("")).ObjectID; 
/**
 * @desc Initializes a collection
 * @param {string} exportName exported variable name (from mongo.js)
 * @param {string} collectionName actual mongo collection name
 * @param {array} indexes an array of index specifiers (as per mongoskin's ensureIndex)
 * @param {callback(error, data)}
 */
var initCollection = function initCollection (exportName, collectionName, indexes, callback) {
  assertClass(exportName,String);
  assertClass(collectionName,String);
  assertClass(indexes,Array);
  assertClass(callback,Function);

  function onCreated (error, collection) {
    if ( error ) { 
      winston.log('info',"Error creating collection: " + error);
      return callback(error); 
    }

    //winston.log('info',"Collection '" + collectionName + "' created and exported as '" + exportName + "'");

    exports[exportName] = collection;

    /**
     * Returns an async worker that creates the specified index 
     * @param {array} index specifier
     */
    function indexWorker(index) {
      return function (callback) { 
        //winston.log('info',"Ensuring index "+JSON.stringify(index) + " on "+collectionName);
        var ensureIndexArgs = index.concat([callback]);
        collection.ensureIndex.apply(collection,ensureIndexArgs);
      }
    }
    
    // create the indexes:
    async.parallel(indexes.map(indexWorker), callback);
  }

  var collection = db.collection(collectionName);

  if ( collection ) {
    onCreated (null, collection);
  }
  else {
    db.createCollection(collectionName, onCreated);
  }
}

/**
 * A thin wrapper around collectionWorker that takes a collection configuration as input
 * @param {collectionConfig} - description of a collection { name: collectionName, indexes: { indexNAme1: [indexArgs] } } 
 */
var collectionWorker = function collectionWorker(collectionConfig) {
  return function (callback) {
    initCollection(collectionConfig.name, collectionConfig.mongoName, collectionConfig.indexes,callback);
  };
};
/**
 * Required startup function - reads config.MONGO and creates properties representing collections
 */
var initialize = function initialize (callback) {
  winston.log('info',"mongo.initialize: initializing mongo collections. " + mongoConfig.blipboardURL);
  // create the collection workers from the configurations
  var collectionWorkers = mongoConfig.collections.map(collectionWorker);
  
  db = mongoskin.db(mongoConfig.blipboardURL, {w: 1});
  exports.db = db;
  async.parallel(collectionWorkers, function(error, result) {
    if (!error) {
      _isInitialized = true;
    }
    if (callback) {
      callback(error,result);
    }
  });
};

var close = function close(callback) {
  db.close(callback);
};

/** getter */
var isInitialized = function isInitialized() { 
  return _isInitialized;
};

/**
 * Creates an object suitable for the region field (e.g., in ChannelRegionWeight)
 * @param {string} rtype one of MONGO.regionType
 * @param {string} data describes the region 
 */
var validRegionTypes = new sets.Set();
for (var rKey in mongoConfig.regionType) {
  validRegionTypes.add(mongoConfig.regionType[rKey]);
}
var isRegionType = function isRegionType(x) {
  return validRegionTypes.has(x);
}
var region = function region(rtype,data) {
  if (!isRegionType(rtype)) {
    throw new BBError(sprintf("invalid regionType: %s",JSON.stringify(rtype)));
  }
  if (rtype===mongoConfig.regionType.global) {
    data = "";
  }
  else if (typeof(data) != 'string') {
    throw new BBError(sprintf("region() expecting string data, but received: %s", data))
  }
  return rtype+":"+data;
}

var isRegion = function isRegion(x) {
  if (typeof(x)==='string') {
    var parts = x.split(":");
    var rtype = parts[0];
    return isRegionType(parts[0]);
  }
  return false;
}

var validChannelTypes = new sets.Set();
for (var cKey in mongoConfig.channelType) {
  validChannelTypes.add(mongoConfig.channelType[cKey]);
}
function isChannelType(x) {
  return validChannelTypes.has(x);
}

var zoomLevelValues = new sets.Set();
for (var name in mongoConfig.zoomLevel) {
  zoomLevelValues.add(mongoConfig.zoomLevel[name]);
}
var isZoomLevel = function isZoomLevel(x) {
  return zoomLevelValues.has(x);
}

/**
 * @usage 
*          tile(latitude,longitude,zoomLevel)
 *         tile({latitude:latitude,longitude:longitude},zoomLevel);
 */
var tile = function tile(latitude,longitude,zoomLevel) {
  if (classOf(latitude)==Object) {
    // location object provided - remap arguments:
    var location = latitude;
    var zoomLevel = longitude;
    latitude = location.latitude;
    longitude = location.longitude;
  }

  zoomLevel = zoomLevel===undefined ? mongoConfig.tileZoomLevel : zoomLevel;
  assert(isZoomLevel(zoomLevel));
  return new Tile(latitude,longitude,zoomLevel);
}

/**
 * 
 */
var mongoHandler = function mongoHandler(message,errorBack,callback) {
  if (classOf(message)!==String) {
    callback = errorBack;
    errorBack = message;
    message = undefined;
  }
  if (!callback) {
    callback = function (result) {
      errorBack(undefined,result);
    }
  }
  return function mongoErrorHandler(error,result) {
    if (error) {
      if (classOf(error)===Error) { // error is undecorated - convert to mongo Error
        var opt = {cause:error};
        if (message) {
          opt.message = message;
        }
        errorBack(BBError.mongoFailed(opt));
      }
      else {
        errorBack(error);
      }
    }
    else {
      callback(result);
    }
  }
}
/**
 * Given a mongoskin promise and a collection and optional mongoskin find options,
 * retrieves documents from the collection in the order specified by the promise
 * @param {Object} orderQuery a promise as returned by mongo.collection.find()
 * @param {Object} innerJoin maps a single key in orderQuery to a key in Collection
 *                 e.g., { blip:'_id' } will use the value of .blip in orderQuery to find docs with _id in Collection
 * @param {Object} leftJoin maps keys from the orderQuery into the result
 *                 e.g., { viewed:'isRead', 'likeCount':'likes' } copies .viewed and .likeCount to .isRead and .likes
 *                       in result document
 * @param {Collection} collection a mongoskin collection
 * @param {Object} options mongo.collection.find() options
 * @param {Function(error,docs)} callback 
 */
function join(orderQuery, innerJoin, leftJoin, collection, options, callback) {
  var innerJoinKeys = Object.keys(innerJoin);
  assert(innerJoinKeys.length===1);
  var orderKey = innerJoinKeys[0];
  var collectionKey = innerJoin[orderKey];
  var getOrder = function getOrder(wCallback) {
    orderQuery
      .toArray(mongoHandler(
        "Join failed while ordering documents", callback,
        function foundOrdered(orderDocs) {
          wCallback(undefined,orderDocs);
        }));
  }
  
  var findDocuments = function findDocuments(orderDocs,wCallback) {
    if (orderDocs.length>0) {
      var docIds = orderDocs.map(function (doc) { 
        return doc[orderKey];
      });
      var findCriterion = {};
      findCriterion[collectionKey] = {$in: docIds};
      collection.find(findCriterion,options)
        .toArray(mongoHandler(
          "Join failed while finding documents", callback, function foundDocs(collectionDocs) {
            wCallback(undefined,orderDocs,collectionDocs);
          }));
    }
    else {
      wCallback(undefined,[],[]);
    }
  }

  var joinDocuments = function joinDocuments(orderDocs,collectionDocs,wCallback) {
    // set up look up table
    var LUT = {};
    collectionDocs.forEach(function(doc) {
      LUT[doc._id.toString()] = doc;
    });
    
    // this loop returns only docs which are found
    //      some docIds may be missing in result set
    var orderedCollection = [];
    orderDocs.forEach(function (orderDoc) {
      var doc = LUT[orderDoc[orderKey].toString()];
      if (doc) {
        if (leftJoin) {
          for (var key in leftJoin) {
            doc[leftJoin[key]] = orderDoc[key];
          }
        }
        orderedCollection.push(doc);
      }
    });
    wCallback(undefined,orderedCollection);
  }

  if (!callback) {
    callback = options;
    options = {};
  }
  if (options===undefined || options===null) {
    options = {};
  }
  assertClass(orderQuery,mongoskin.SkinCursor);
  assertClass(orderKey,String);
  assertClass(collection,mongoskin.SkinCollection);
  assertClass(callback,Function);

  async.waterfall([getOrder,
                   findDocuments,
                   joinDocuments],
                  callback);
}

var logMongoCallback = function logMongoCallback(message,args,callback) {
  return logCallback("info",message,args,function mongoCallback(error,result) {
    if (error) {
      callback(BBError.mongoFailed({cause:error}));
    }
    else {
      callback(result);
    }
  });
}

var logMongoHandler = function logMongoHandler(message,args,errorBack,successBack) {
  var mongoErrorBack = function (error) {
    errorBack(BBError.mongoFailed({cause:error}));
  }
  return logHandler("info",message,args,mongoErrorBack,successBack);
}

exports.errors = {
  objectsInCappedNSCannotGrow: 10003,
  duplicateKeyError: 11000,
  duplicateKeyOnUpdate: 11001,
  idxNoFails:12000,
  cantSortWithSnapshot:12001,
  cantIncSetAnIndexedField0:12010,
  cantIncSetAnIndexedField1:12011,
  cantIncSetAnIndexedField2:12012,
  replSetError:13312,
  badOffsetAccessDataFile:13440
}

exports.__defineGetter__('isInitialized', isInitialized);
exports.initialize = initialize;
exports.close = close;
exports.region = region;
exports.regionType = mongoConfig.regionType;
exports.isRegion = isRegion;
exports.isRegionType = isRegionType;
exports.channelType = mongoConfig.channelType;
exports.isChannelType = isChannelType;
exports.tileZoomLevel = mongoConfig.tileZoomLevel;
exports.zoomLevel = mongoConfig.zoomLevel;
exports.readConcurrency = mongoConfig.readConcurrency;
exports.writeConcurrency = mongoConfig.writeConcurrency;
exports.ObjectID = ObjectID;
exports.tile = tile;
exports.isZoomLevel = isZoomLevel;
exports.join = join;
exports.mongoHandler = mongoHandler;
exports.logMongoCallback = logMongoCallback;
exports.logMongoHandler = logMongoHandler;
