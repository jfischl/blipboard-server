/**
 * @fileoverview Listen network manager
 * @author aneil@blipboard.com
 */

var winston = require('winston');
var mongo = require('../lib/mongo');
var ObjectID = require('../lib/mongo').ObjectID;
var async = require('async');
var xor = require('../lib/javascript').xor;
var channelEvents = require('./channelEvents');
var validate = require('./validate');
var sprintf = require('sprintf').sprintf;
var config = require('../config');
var sets = require('simplesets');
var assert = require('assert');
var classOf = require('../lib/javascript').classOf;
var blipManager = require('./blipManager');
////////////////////////////////////////////////////////////////////////////////
// Listen / unListen


/**
 * Records that a user is listening to a channel
 * @param {ObjectID} listenerId the user
 * @param {ObjectID} channelId channel the user listens to
 */
function listen(listenerId,channelId,callback) {
  winston.log("info", listenerId + " listenTo " + channelId);

  // Returns a callback which provides success=true if document was created,
  function makeEnsureExistsCallback(callback) {
    return function ensureExistsCallback(error,success) {
      //winston.log('info',sprintf("ensureExistsCallback:(%s,%s)",JSON.stringify(error),JSON.stringify(success)));
      if (!error) {
        callback(null,1);
      }
      else if (error['code'] == mongo.errors.duplicateKeyError) {
        callback(null,0);
      } 
      else {
        callback(error);
      }
    }
  }
  
  function ensureChannelListenerWorker (callback) {
    mongo.channelListeners.save({channel:channelId,listener:listenerId},
                                {safe:true}, // only return after operation is complete!
                                makeEnsureExistsCallback(callback));
  }
  
  function ensureChannelListensToWorker (callback) {
    mongo.channelListensTos.save({channel:listenerId,listensTo:channelId},
                                 {safe:true},
                                 makeEnsureExistsCallback(callback));
  }

  function distributeExistingBlips ( callback ) {
    blipManager.distributeBlipsOnTuneIn(channelId, listenerId, callback);
  }

  function checkIfAnyExistingListeners(callback) { 
    mongo.channelListeners.findOne({channel:channelId,type:config.MONGO.channelType.place}, {fields:['_id']}, function(error, result) {
      if (result === null) {
        // fire an event that there is a first listener to a "new" channel
        // winston.info("listenNetworkManager: first listener on channel " + channelId);
        channelEvents.firstListenerToChannel(channelId);
      }
      callback(error, result);
    });
  }

  function listenUpdateDB (prepared) {
    checkIfAnyExistingListeners(function (error, result) { 
      if (error) { 
        callback(error); 
      }
      else {
        async.parallel([ ensureChannelListenerWorker,
                         ensureChannelListensToWorker,
                         distributeExistingBlips
                       ],
                       makeTakeActionCallback(channelId,
                                              listenerId,
                                              onAddListenerChangeAction(channelId,listenerId),
                                              onNoChange,
                                              onDBInconsistentAction(channelId,listenerId),
                                              callback));
      }
    });
  }
  
  validate.validate({ ids:[[listenerId,channelId], validate.areAllClass(ObjectID), validate.idsExist(mongo.channels)] },
                    callback,
                    listenUpdateDB);
}


/**
 * Records that a user is listening to a channel
 * @param {ObjectID} listenerId the user
 * @param {ObjectID} channelId channel the user listens to
 */
function unlisten(listenerId,channelId,callback) {
  winston.log("info", "unlisten " + listenerId + " " + channelId);

  function removeChannelListenerWorker (callback) {
    // remove calls back with result=#docs removed on success
    mongo.channelListeners.remove({channel:channelId,listener:listenerId},{safe:true},callback);
  }
  
  function removeChannelListensToWorker (callback) {
    mongo.channelListensTos.remove({channel:listenerId,listensTo:channelId},{safe:true},callback);
  }

  function unlistenUpdateDB (prepared) {
    function cleanupReceivedBlips ( error, result ) {
      if ( error ) return callback(error);

      if ( result ) {
        var selector = { author: channelId, user: listenerId }
        var options = { multi: true }
  
        mongo.receivedBlips.remove(selector, options, function onDone ( error, result ) {
          callback(error, result);
        });
      }
      else callback(error, result);
    }

    async.parallel([removeChannelListenerWorker, removeChannelListensToWorker],
                   makeTakeActionCallback(channelId,
                                          listenerId,
                                          onRemoveListenerChangeAction(channelId,listenerId),
                                          onNoChange,
                                          onDBInconsistentAction(channelId),
                                          cleanupReceivedBlips));
  }

  validate.validate({ ids:[[listenerId,channelId], validate.areAllClass(ObjectID), validate.idsExist(mongo.channels)] },
                    callback,
                    unlistenUpdateDB);

}


function onDBInconsistentAction(channelId,listenerId) {
  return function onDBInconsistent() {
    channelEvents.listenNetworkInconsistency(channelId,listenerId)
  };
  return onDBInconsistent;
}

function onNoChange() {
}

function onAddListenerChangeAction(channelId,listenerId) {
  return function onChange() {
    channelEvents.addedChannelListener(channelId,listenerId);
  };
  return onChange;
}

function onRemoveListenerChangeAction(channelId,listenerId) {
  return function onChange() {
    channelEvents.removedChannelListener(channelId,listenerId);
  };
  return onChange;
}

/**
 * Depending on the results delivered, runs actions and calls callback with appropriate values
 * @param {function()} onChange the action to take if results have changed
 * @param {function()} onNoChange the action to take if results have not changed 
 * @param {function()} onInconsistent the action to take if DB is inconsistent
 * @param {function(err,change)} callback is called depending on the change state detected
 * @returns {function(error,results)} takeActionCallback where results is an array of 2 values
 *                                    if they are both non-zero, results have changed
 *                                    if they are both 0, the results have not changed
 *                                    if they are 0 and non-0, results are inconsistent
 */
function makeTakeActionCallback(channelId,listenerId,onChange,onNoChange,onInconsistent,callback) {
  //winston.log('info', "updateListenersCountCallback("+channelId+","+count+")");
  return function takeActionCallback (err,results) {
    if (err) {
      callback(err,null);
    }
    else { 
      // we know both a channelListener and a channelListensTo 
      // were successfully created or already exist at this point
      var dbInconsistent = xor(results[0],results[1]);
      if (dbInconsistent) {
        onInconsistent();
        winston.log('info', "ChannelListensTo | ChannelListeners inconsistency for [channelId,listenerId] = "
                    + JSON.stringify([channelId,listenerId]));
        callback(null,true);
      }
      else if (results[0]) { // results indicate both inserts (or removes) were performed, therefore...
        onChange();
        callback(null,true);
      }
      else {
        onNoChange();
        callback(null,false);
      }
    }
  };
}

// !jcf! technically this should be in channelManager
function recomputeListenersCount(channelId, callback) {
  winston.log("info", "listenNetworkManager.recomputeListenersCount " + channelId + "=" + count);
  channelManager.initializeStats(channelId, callback);
}

/**
 * finds the channelIds the listener is listening to
 * @param {ObjectID} listenerId the user who is listening
 * @param {Array} channelIds optional parameter (may be null), if provided,
 *                what is returned is the subset of channelIds which are tunedIn
 * @param {function(err,channelIds)} callback where channelIds is an array
 **/
function findListensTos(listenerId,channelIds,callback) {
  //winston.log("info", "listenNetworkManager.findListensTo " + listenerId);
  
  if (!callback) {
    callback = channelIds;
    channelIds = undefined;
  }
  if (!channelIds) {
    channelIds = undefined;
  }

  var criterion = {'channel':listenerId};
  if (channelIds) {
    criterion.listensTo = { $in:channelIds };
  }

  function doQuery(prepared) {
    mongo.channelListensTos.find(criterion,
                                 {fields:['listensTo']})
      .toArray(function (error, docs) {
        callback(error, docs ? docs.map(function(doc) { return doc.listensTo; }) : null);
      });
  }

  validate.validate( { listenerId: [listenerId, validate.isClass(ObjectID)],
                       channelIds: [channelIds, validate.undefinedOK, validate.isClass(Array)] 
                     },
                     callback,
                     doQuery );
}

/**
 * finds the listeners of a channel
 * @param {ObjectID} channelId the channel or an array of channelIds
 * @param {Array} listenerIds optional parameter (may be undefined), if provided,
 *                what is returned is the subset of channelIds which are tunedIn
 * @param {function(err,channelIds)} callback where channelIds is an array
 **/
function findListeners(channelIds,listenerIds,callback) {
  //winston.log("info", "listenNetworkManager.findListeners(" + JSON.stringify({channelIds:channelIds,listenerIds:listenerIds}));

  if (!callback) {
    callback = listenerIds;
    listenerIds = undefined;
  }
  if (!listenerIds) {
    listenerIds = undefined;
  }
  if (classOf(channelIds) !== Array) {
    channelIds = [channelIds];
  }
  
  function doQuery(prepared) {
    var criterion = {'channel':{$in:channelIds}};
    if (listenerIds) {
      criterion.listener = { $in:listenerIds };
    }

    mongo.channelListeners.find(criterion,
                                 {fields:['listener']})
      .toArray(function (error, docs) {
        callback(error, docs ? docs.map(function(doc) { return doc.listener; }) : null);
      });
  }

  validate.validate( { channelIds: [channelIds, validate.areAllClass(ObjectID)],
                       listenerIds: [listenerIds, validate.undefinedOK, validate.areAllClass(ObjectID)]
                     },
                     callback,
                     doQuery );
}

// exports
exports.unlisten = unlisten;
exports.listen = listen;
exports.findListensTos = findListensTos;
exports.findListeners = findListeners;
exports.recomputeListenersCount = recomputeListenersCount;

// events handled
channelEvents.onListenersCountInvalid(recomputeListenersCount);
