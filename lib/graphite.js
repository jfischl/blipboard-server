var assert = require('assert');
var dgram = require('dgram');
var winston = require('winston');
var config = require('../config');
var client = dgram.createSocket("udp4");
var js = require('./javascript');

var send = function send(data, callback) 
{ 
  if (!callback) { 
    callback = js.noop;
  }

  var message = new Buffer(config.HOSTEDGRAPHITE.api_key + "." + data + '\n');
  //winston.debug("graphite.send: " + message);
  client.send(message, 0, message.length, 2003, "carbon.hostedgraphite.com", callback);
};

var set = function set(key, value, callback) 
{
  if (!callback) { 
    callback = js.noop;
  }

  if (config.HOSTEDGRAPHITE && config.HOSTEDGRAPHITE.api_key) { 
    send(key + " " + value, callback);
  }
  else {
    callback("graphite not configured");
  }
};

exports.set = set;
