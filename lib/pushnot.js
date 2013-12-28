var assert = require('assert');
var winston = require('winston');
var UrbanAirship = require('urban-airship');

var config = require('../config').URBANAIRSHIP;
var js = require('./javascript');

var urban_airship = new UrbanAirship(config.api_key, config.secret_key, config.master_key);

var ns = config.namespace;

if (ns.length) { 
  winston.info("Using namespace " + ns + " for Urban Airship aliases");
}

// userid: String representing the userid of the recipient of the push notification
// count: set value for the badge
// text: text to display in the alert
// options: a dictionary of options to include in the message: 
//          latitude: Number
//          longitude: Number 
//          userId: String - channelId
//          blipId: String - blipId
var sendPushNotification = function sendPushNotification(userid, count, text, options, callback) {
  if (!callback) { 
    callback = js.noop;
  }
  assert(callback);

  var payload = { 
    "aliases" : [ns + userid],
    "aps" : {
      "badge": count,
    }
  };

  if (options) { 
    if (options.latitude) { 
      payload.latitude = options.latitude.toFixed(4);
    }
    if (options.longitude) { 
      payload.longitude = options.longitude.toFixed(4);
    }
    if (options.userId) {
      payload.uid = options.userId;
    }
    if (options.blipId) {
      payload.bid = options.blipId;
    }
    if (options.likerId) {
      payload.lid = options.likerId;
    }
    if (options.commentId) {
      payload.cid = options.commenterId;
    }
    if (options.id) {
      payload.id = options.id;
    }
  }
  
  // !jf! only play a sound if there is a text alert
  if (text) { 
    payload.aps.sound = "blip.aiff";  // "default"
    payload.aps.alert = text.trunc(240-JSON.stringify(payload).length);
  }

  winston.info("pushnot.sendPushNotification: contacting Urban Airship "+JSON.stringify(payload));
  if ( !config.no_pushnot ) {
    urban_airship.pushNotification("/api/push/", payload, function(error) {
      if (error) {
        winston.error("pushnot.sendPushNotification: Failed to send push to " + userid + ":" + payload + " error: " + js.pp(error));
      }
      callback(error,payload);
    });
  }
};

var register = function register(token, userid) 
{
  var payload = { 
    "alias": ns + userid
  };
  urban_airship.registerDevice(token, payload, function(error) { 
    if (error) {
      winston.error("pushnot.register: Failed to register device " + token + " for user: " + userid);
      if (error.message) { console.log(error.message); }
      if (error.stack) { console.log(error.stack); }
    }
  });
};

var unregister = function unregister(token) 
{
  urban_airship.unregisterDevice(token, function(error) { 
    if (error) {
      winston.error("pushnot.register: Failed to unregister device " + token);
      if (error.message) { console.log(error.message); }
      if (error.stack) { console.log(error.stack); }
    }
  });
};


exports.sendPushNotification = sendPushNotification;
exports.register = register;
exports.unregister = unregister;
