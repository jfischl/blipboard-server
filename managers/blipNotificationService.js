/**
 * @fileoverview blipNotificationService
 * @author aneil@blipboard.com
 */

var config = require('../config');

// lib
var BBError = require('../lib/error').BBError;
var ObjectID = require('../lib/mongo').ObjectID;
var Tile = require('../lib/tile').Tile;
var classOf = require('../lib/javascript').classOf;
var graphite = require('../lib/graphite');
var js = require('../lib/javascript');
var mongo = require('../lib/mongo');
var pushnot = require('../lib/pushnot');
var mongoHandler = mongo.mongoHandler;
var notificationManager = require('./notificationManager');

// managers
var userManager = require('./userManager');
var blipManager = require('./blipManager');
var v = require('./validate');

// 
var async = require('async');
var winston = require('winston');
var sprintf = require('sprintf').sprintf;



/**
 * Notify all users near a blip about the blip
 * @param {Array} userIds an array of ObjectIDs
 * @param {Object} blip valid mongo document 
 * @param {Function} callback - called with no arguments when all notifications have been made
 */
var pushNotifyUsersNearBlip = function pushNotifyUsersNearBlip(userIds,blip,callback) {
  function onValidated(prepared) {
    var notifyUser = function notifyUser(userId,qCallback) { notifyUserOfBlip(userId,blip,qCallback); };
    var queue = async.queue(notifyUser, config.URBANAIRSHIP.concurrency);

    // find users at tile...
    userManager.usersAtTile(
      blip.place.location.tileIndex,
      userIds,
      function(error,usersAtTile) {
        if (error) {
          return callback(error);
        }
        else {
          if (usersAtTile && usersAtTile.length>0) {
            queue.drain = function markBlipsNotified() {
              mongo.receivedBlips.update({user:{$in:usersAtTile},blip:blip._id},
                                         {$set:{notified:true}},
                                         {multi:true,safe:false},
                                         function () {});
            };

            // queue the push notifications 
            usersAtTile.forEach(function (userId) { queue.push(userId); });
            callback();
          }
          else {
            callback();  
          }
        }
      });
  }

  v.validate({blip:[blip,
                    v.hasKeyPath('place.location.tileIndex',String),
                    v.hasKeyPath('message',String),
                    v.hasKeyPath('author.name',String)]},
             callback,
             onValidated) ;
};

var pushNotifyUserAtLocation = function pushNotifyUserAtLocation(userId, latitude, longitude, callback) 
{
  var tiles = Tile.fromCenterAndDistanceSpan(latitude, longitude, 600, 600, config.MONGO.tileZoomLevel);
  var tileIndexes = tiles.map(function(tile) { return tile.toIndex(); });
  pushNotifyUserAtTile(userId, tileIndexes, callback);
};

/**
 * Attempts to find a blip for the user at the tile; if it does, notifies the user
 * @param {ObjectID} userId 
 * @param {String} tileIndex
 * @param {Function} callback(error,success)
 */
var pushNotifyUserAtTile = function pushNotifyUserAtTile(userId,tileIndexes,callback) {
  function onValidated(prepared) {
    if (classOf(tileIndexes)!==Array) {
      tileIndexes = [tileIndexes];
    }

    // find an unread & unnotified blip for the user at the tile and notify the user
    var now = new Date();
    var query = { user:userId,
                  tileIndex: {$in: tileIndexes},
                  isRead:false,          // unread
                  blacklisted: {$ne: true}, 

                  // must test for the case where there is no effectiveDate and fallback to expiryDate
                  $and: [ {$or: [ {effectiveDate: {$exists:false}, expiryTime: {$gte: now}},
                                  {effectiveDate: null, expiryTime: {$gte: now}},
                                  {effectiveDate: {$gte:now}} ] },
                          {$or: [ { notified:false }, 
                                  { notified: {$exists:false} } ] } ]
                };

    //winston.debug("query=" + js.pp(query));
    // authorType is part of the sort so that we get 'user' blips before 'place' blips
    var sort = {  authorType: -1, popularity: -1, createdTime:   -1 }; // sort by earliest effective date, then most recently created blip
    var update = {$set: {notified:true}};
    var options = {new:true};
    mongo.receivedBlips.findAndModify(query,sort,update,options,mongoHandler(callback,function (receivedBlip) {
      if (receivedBlip) {
        mongo.blips.findOne({_id:receivedBlip.blip}, mongoHandler(callback,function (blip) {
          //winston.info("blipNotificationService.pushNotifyUserAtTile: blip=" + js.pp(blip));          
          notifyUserOfBlip(userId,blip,callback);
        }));
      }
      else {
        winston.debug("No new blips for user " + userId + " in " + js.ppc(tileIndexes));
        callback(null, false);
      }
    }));
  }
  v.validate({userId:[userId,v.isClass(ObjectID)]},
             callback,
             onValidated);
};

/**
 * Internal function: Notifies a single user of a blip without checking user's current location
 * @param {ObjectID} userId
 * @param {Object} blip a valid blip document; this function does no checking to ensure the validity of the blip
 * @param {Function} callback(error,success)
 */
var notifyUserOfBlip = function notifyUserOfBlip(userId,blip,callback) {
  var source;
  if (blip.author) { 
    if (blip.author._id.equals(blip.place._id)) { 
      source = blip.author.name; 
    }
    else {
      source = blip.author.name + " @ " + blip.place.name;
    }
  }
  else if (blip.place) { 
    source = blip.place.name;
  }
  else {
    source = "";
  }
  
  var message = sprintf("%s: %s", source, blip.message);
  notificationManager.makeNewBlipNotification(userId, blip._id, message, function(err) { 
    callback(null, true); 
  });
};

exports.pushNotifyUsersNearBlip = pushNotifyUsersNearBlip;
exports.pushNotifyUserAtTile = pushNotifyUserAtTile;
exports.pushNotifyUserAtLocation = pushNotifyUserAtLocation;

