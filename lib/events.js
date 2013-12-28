/**
 * @fileoverview shared EventEmitter
 * @author jason@blipboard.com
 */
var winston = require('winston');
var EventEmitter = require('events').EventEmitter;
var emitter = exports.emitter = new EventEmitter();

exports.serverReady = function serverReady() {
  winston.log('info',"blipboard server ready event");
  emitter.emit('blipboardServerReady');
};

exports.onServerReady = function onServerReady(callback)
{
  emitter.on('blipboardServerReady', callback);
};

