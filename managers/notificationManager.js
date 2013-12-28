/**
 * @fileoverview Notification manager
 * @author aneil@blipboard.com
 */

var assert = require('assert');
var async = require('async');
var sets = require('simplesets');
var sprintf = require('sprintf').sprintf;
var winston = require('winston');

var blipManager = require('./blipManager');
var channelManager = require('./channelManager');
var channelEvents = require('./channelEvents');
var graphite = require('../lib/graphite');
var js = require('../lib/javascript');
var mongo = require('../lib/mongo');
var ObjectID = require('../lib/mongo').ObjectID;
var channelType = require('../config').MONGO.channelType;
var notificationType = require('../config').MONGO.notificationType;
var pushnot = require('../lib/pushnot');
var topicManager = require('./topicManager');
var v = require('./validate');

var makeNotification = function createNotification(notification, message, callback) 
{
  async.waterfall([
    function insertNotification(callback) { 
      //winston.debug("insert notification: " + js.ppc(notification));
      mongo.notifications.insert(notification, {safe:true}, callback);
    },
    function getLastReadId(results, callback) { 
      //winston.debug("get last read " + js.ppc(results));
      channelManager.getChannel(notification.userId, notification.userId, function(error, user) { 
        var notification = (results instanceof Array) ? results[0] : results;
        //winston.info("notificationManager.makeNotification: '" + message + "' -> " + js.pp(user));
        //winston.debug("notificationManager.makeNotification: " + js.ppc(notification));
        callback(error, user.lastReadNotificationId, notification);
      });
    },
    function getUnreadCount(lastReadNotificationId, notification, callback) { 
      var criterion = { userId:  notification.userId};
      if (lastReadNotificationId) { // if nothing has been marked read yet on this channel
        criterion._id = {$gt: lastReadNotificationId};
      }
      //winston.info("count nots >= " + lastReadNotificationId);
      mongo.notifications.count(criterion, function (error, count) { 
        callback(error, count);
      });
    },
    function deliverAlert(count, callback) { 
      //winston.debug(sprintf("notificationManager.makeNotification:%s(%d) -> %s", message, count, js.ppc(notification)));
      graphite.set("alerts." + notification.type, 1);
      pushnot.sendPushNotification(notification.userId, count, message, {id: notification._id.toString()});
      callback();
    }
  ], function(err, result) {
    if (err) { 
      winston.info("notificationManager.makeNotification failed: " + js.pp(err));
    }
    if (callback) { 
      callback(err,result);
    }
  });
};

var makeNewListenerNotification = function makeNewListenerNotification(user, listener, callback) 
{
  assert(user && user._id);
  var notification = {
    userId: user._id,
    time: new Date(),
    type: notificationType.tunein,
    listenerId: listener._id
  };

  var message; // don't send an alert message (badge only) to recommended guru
  if (!user.recommended)  {
    message = sprintf("%s is following your blips", listener.name);
  }
  
  makeNotification(notification, message, callback);
};

var makeNewLikeNotification = function makeNewLikeNotification(liker, blip, callback) 
{
  assert(blip.author.type === channelType.user);

  var notification = { 
    userId: blip.author._id,
    time: new Date(),
    type: notificationType.like,
    likerId: liker._id,
    blipId: blip._id
  };
  var message =  sprintf("%s likes your blip", liker.name);
  winston.debug("notificationManager.makeNewLikeNotification: " + js.ppc(notification));
  makeNotification(notification, message, callback);
};

var makeNewBlipNotification = function makeNewBlipNotification(userId, blipId, message, callback) 
{
  var notification = { 
    userId: userId, 
    time: new Date(),
    type: notificationType.blip,
    blipId: blipId
  };
  winston.debug("notificationManager.makeNewBlipNotification: " + js.ppc(notification));
  makeNotification(notification, message, callback);
};

var makeNewCommentNotification = function makeNewCommentNotification(userId, blipId, commentId, message, callback)
{
  var notification = {
    userId: userId,
    time: new Date(),
    type: notificationType.comment,
    blipId: blipId,
    commentId: commentId
  };
  winston.debug("notificationManager.makeNewCommentNotification: " + js.ppc(notification));
  makeNotification(notification, message, callback);
};

var makeNewChannelNotification = function makeNewChannelNotification(userId, title, subtitle, message, channelId, picture, callback)
{
  var notification = {
    userId: userId,
    time: new Date(),
    type: notificationType.channel,
    title: title,
    subtitle: subtitle,
    picture: picture,  // may be left out
    channelId: channelId
  };
  makeNotification(notification, message, callback);
};

var makeNewTopUsersNotification = function makeNewTopUsersNotification(userId, title, subtitle, message, callback)
{
  var notification = {
    userId: userId,
    time: new Date(),
    type: notificationType.topusers,
    title: title,
    subtitle: subtitle,
    picture: "urn:blipboard:Icon-Small.png"
  };
  makeNotification(notification, message, callback);
};

var makeNewWebNotification = function makeNewWebNotification(userId, title, subtitle, url, message, callback)
{
  var notification = {
    userId: userId,
    time: new Date(),
    type: notificationType.web,
    title: title,
    subtitle: subtitle,
    url: url
  };
  makeNotification(notification, message, callback);
};

var makeNewNoActionNotification = function makeNewNoActionNotification(userId, title, subtitle, message, callback)
{
  var notification = {
    userId: userId,
    time: new Date(),
    type: notificationType.noaction,
    title: title,
    subtitle: subtitle
  };
  makeNotification(notification, message, callback);
};

var makeNewCreateBlipNotification = function makeNewCreateBlipNotification(userId, title, subtitle, placeId, message, callback)
{
  var notification = {
    userId: userId,
    time: new Date(),
    type: notificationType.createblip,
    title: title,
    subtitle: subtitle,
    placeId: placeId
  };
  makeNotification(notification, message, callback);
};

var makeNewProfileEditorNotification = function makeNewProfileEditorNotification(userId, title, subtitle, message, callback)
{
  var notification = {
    userId: userId,
    time: new Date(),
    type: notificationType.profile,
    title: title,
    subtitle: subtitle
  };
  makeNotification(notification, message, callback);
};

var getNotifications = function getNotifications(user, page, callback) 
{
  var blipIds = [], channelIds = [];

  assert(user._id);

  v.validate({ notificationId: [user.lastReadNotificationId, v.undefinedOK, v.isClass(ObjectID), 
                                v.idsExist(mongo.notifications)],
               userId: [user._id, v.idsExist(mongo.channels)]},
             callback, retrieve);

  function retrieve(prepared) {
    page.retrieve(mongo.notifications, {userId: user._id}, {}, processNotifications);
  }

  function decorateReadStatus(notifications) { 
    notifications.data.forEach(function (notification) { 
      if (user.lastReadNotificationId &&
          notification._id.getTimestamp() <= user.lastReadNotificationId.getTimestamp()) {
        notification.isNew = false;
      }
      else {
        notification.isNew = true;
      }
    });
  }
  
  function collectIds(notifications) { 
    channelIds.push(user._id);
    notifications.data.forEach(function (notification) { 
      if (notification.likerId) { 
        channelIds.push(notification.likerId);
      }
      if (notification.listenerId) {
        channelIds.push(notification.listenerId);
      }
      if (notification.placeId) {
        channelIds.push(notification.placeId);
      }
      if (notification.channelId) {
        channelIds.push(notification.channelId);
      }

      if (notification.blipId) {
        blipIds.push(notification.blipId);
      }
    });
  }

  function processNotifications(error, notifications) { 
    if (error) { 
      return callback(BBError.mongoFailed({cause: error}));
    }
    decorateReadStatus(notifications);
    collectIds(notifications);

    async.parallel({
      channels: function (callback) { 
        channelManager.getChannels(user._id, channelIds, callback);
      },
      blips: function (callback) { 
        blipManager.getBlips(user._id, blipIds, topicManager.decorateBlipsWithTopics(callback));
      }
    }, function (error, results) { 
      notifications.channels = results.channels;
      notifications.blips = results.blips;

      callback(error, notifications);
    });
  }
};


var acknowledgeNotifications = function acknowledgeNotifications(user, notificationId, page, callback) 
{
  assert(notificationId);
  assert(user._id);
  assert(page);

  v.validate({ notificationId: [notificationId, v.isClass(ObjectID), v.idsExist(mongo.notifications)],
               userId: [user._id, v.idsExist(mongo.channels)]},
             callback, retrieve);
  
  function retrieve(prepared) {
    //winston.info("notificationManager.markNotificationsRead: " + js.ppc(user) + " to " + notificationId);
    channelManager.setLastReadNotification(user, notificationId, function done(error) { 
      if (error) { 
        callback(BBError.mongoFailed({cause:error}));
      }
      else {
        user.lastReadNotificationId = notificationId;
        getNotifications(user, page, callback);
      }
    });
  }
};

exports.makeNewListenerNotification = makeNewListenerNotification;
exports.makeNewLikeNotification = makeNewLikeNotification;
exports.makeNewBlipNotification = makeNewBlipNotification;
exports.makeNewCommentNotification = makeNewCommentNotification;
exports.makeNewChannelNotification = makeNewChannelNotification;
exports.makeNewTopUsersNotification = makeNewTopUsersNotification;
exports.makeNewWebNotification = makeNewWebNotification;
exports.makeNewNoActionNotification = makeNewNoActionNotification;
exports.makeNewCreateBlipNotification = makeNewCreateBlipNotification;
exports.makeNewProfileEditorNotification = makeNewProfileEditorNotification;
exports.getNotifications = getNotifications;
exports.acknowledgeNotifications = acknowledgeNotifications;
