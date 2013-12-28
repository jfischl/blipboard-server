var assert = require('assert');
var async = require('async');
var restler = require('restler');
var winston = require('winston');

var config = require('../config');
var mongo = require('./mongo');
var js = require('./javascript');

var intercomOptions = {username: config.INTERCOM.app_id, 
                       password: config.INTERCOM.app_key};

var registerNewUser = function registerNewUser(user, callback) 
{
  if (!callback) { 
    callback = js.noop;
  }
  if (!intercomOptions.username || !intercomOptions.password) { 
    return callback("intercom not configured");
  }

  var data = { user_id: user._id, 
               email: user.email,
               name: user.displayName,
               created_at: user._id.getTimestamp().getTime()/1000,
               custom_data: { 
                 facebook_id: user.facebook.id,
                 followersCount: user.listenersCount
               }
               //last_seen_ip: ???,
               //last_seen_user_agent: ???
             };

  //winston.info("intercom.registerNewUser: " + user._id + " : " + user.email);
  
  var request = restler.postJson("https://api.intercom.io/v1/users", data, intercomOptions);
  request.once('complete', function(result) { 
    if (result instanceof Error) { 
      winston.info("intercom.registerNewUser: " + user._id + " : " + user.email + " ---> ERROR " + result.message);
      callback(result);
    } 
    else {
      winston.info("intercom.registerNewUser: " + user._id + " : " + user.email + " ---> OK");
      intercom.recordImpression(user._id, undefined, callback); // no ip to send this time
      callback();
    }
  });
};

var recordImpression = function recordImpression(userId, ip, callback) 
{
  if (!callback) { 
    callback = js.noop;
  }

  if (!intercomOptions.username || !intercomOptions.password) { 
    return callback("intercom not configured");
  }
  
  var data = { user_id: userId, 
               last_seen_ip: ip
               //email: user.email
               //current_url: ???,
               //last_seen_user_agent: ???
             };

  //winston.info("intercom.recordImpression: " + userId + " " + intercomOptions.username);
  
  var request = restler.postJson("https://api.intercom.io/v1/users/impressions", data, intercomOptions);
  
  request.once('complete', function(result) { 
    if (result instanceof Error) { 
      winston.info("intercom.recordImpression: " + userId + " ---> ERROR " + result.message);
      callback(result);
    } 
    else {
      //winston.info("intercom.recordImpression: " + userId + " ---> OK");
      //winston.debug("result=" + js.pp(result));
      callback();
    }
  });
};

// this will create an intercom user for every user in the database
var initialize = function initialize(callback) { 
  if (!intercomOptions.username || !intercomOptions.password) { 
    return callback("intercom not configured");
  }

  mongo.channels.find({type: config.MONGO.channelType.user, facebook: {$exists: true}}).toArray(createAccounts);
  
  function createAccounts(error, users) { 
    if (error) { 
      callback(error);
    }
    else {
      async.forEachSeries(users, registerNewUser, callback);
    }
  }
};

var initializeByEmail = function initializeByEmail(email, callback) { 
  if (!intercomOptions.username || !intercomOptions.password) { 
    return callback("intercom not configured");
  }

  mongo.channels.findOne({type: config.MONGO.channelType.user, email: email}, function (error, user) { 
    if (error) {
      winston.info("Couldn't find " + email);
      callback(error);
    }
    else {
      registerNewUser(user, callback);
    }
  });
};



exports.registerNewUser = registerNewUser;
exports.recordImpression = recordImpression;
exports.initialize = initialize;
exports.initializeByEmail = initializeByEmail;
