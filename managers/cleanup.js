/**
 * @fileoverview cleanup.js - utility functions to be used with care
 * @author aneil@blipboard.com
 */

var async = require('async');
var winston = require('winston');
var mongo = require('../lib/mongo');
var classOf = require('../lib/javascript').classOf;
mongo.initialize();

/**
 * Removes a channel and all associated objects
 */
var deleteChannel = function deleteChannel(id,callback) {
  if (classOf(id)!==mongo.ObjectID) {
    id = mongo.ObjectID(id);
  }
  var removeWorker = function removeWorker(col,crit) {
    return function worker (pCallback) {
      col.remove(crit,function (error,result) {
        winston.info(col.collectionName + ".remove("+JSON.stringify(crit)+")=>"+JSON.stringify(error||result));
        pCallback(error,result);
      });
    }
  }
  async.parallel([removeWorker(mongo.channels,{_id: id}),
                  removeWorker(mongo.channelListeners,
                               {$or:[{'channel':id},
                                     {'listener':id}]}),
                  removeWorker(mongo.channelListensTos,
                               {$or:[{'channel':id},
                                     {'listensTo':id}]}),
                  removeWorker(mongo.blips,
                               {$or:[{'author':id},
                                     {'topics':id},
                                     {'location.place':id}]}),
                  removeWorker(mongo.channelRanks,
                               {'channel':id}),
                  removeWorker(mongo.receivedBlips,
                               {'user':id})],
                 function (error,result) {
                   winston.info("cleanup.deleteChannel deleting all other data associated with user result=",error || result);
                 });
}

var deleteChannelBlips = function deleteChannelBlips(id,callback) {
  function findBlipIds(wCallback) {
    mongo.blips.findItems({$or:[{'author':id},
                                {'topics':id},
                                {'location.place':id}]},
                          {fields:[],_id:1},
                          function (error,blips) {
                            if (!error) {
                              wCallback(error);
                            }
                            else {
                              wCallback(undefined,blips.map(function (b) {return b._id;}));
                            }
                          });
  }

  function deleteBlipsFromIncomingAndReceived(blipIds,wCallback) {
    async.parallel([
      // !am! whoah! next line is muy inefficient:
      function (callback) { mongo.incomingBlipQueues.update({},{$pullAll:blipIds},callback); },
      function (callback) { mongo.receivedBlips.remove({blip:{$in:blipIds}},callback); }],
                   wCallback);
  }

  if (!callback) {
    callback = function (error,result) {
      winston.info("cleanup.deleteChannel deleting blips from other user incoming and received result=",error || result);
    };
  }
  // find blips belonging to the channel:
  async.waterfall([findBlipIds,
                   deleteBlipsFromIncomingAndReceived
                  ],
                 callback);

}

var deleteAllBlipsFromDatabase = function deleteAllBlipsFromDatabase() {
  mongo.blips.remove({},function (error,result) {
    winston.info("removed blips =>"+JSON.stringify(error||result));
  });
  mongo.receivedBlips.remove({},function (error,result) {
    winston.info("removed receivedBlips =>"+JSON.stringify(error||result));
  });
}

exports.deleteAllBlipsFromDatabase = deleteAllBlipsFromDatabase;
exports.deleteChannel = deleteChannel;