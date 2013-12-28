/**
 * @fileoverview Channel events
 * @author aneil@blipboard.com
 */
var winston = require('winston');
var util = require('util');
var mongo = require('../lib/mongo');
var emitter = require('../lib/events').emitter;
var className = require('../lib/javascript').className;
var assert = require('assert');

/**
 * Used to request recomputation of the listeners count...
 * @param {ObjectID} channelId
 */
var listenersCountInvalid = function listenersCountInvalid(channelId) {
  winston.log('info',"listenersCountInvalid event ("+channelId+")");
  emitter.emit("listenersCountInvalid",channelId);
};

/**
 *  Registers for notifications that the listeners count is invalid
 *  @param {callback(channelId)} the channelId which has an invalid listenersCount
 */
var onListenersCountInvalid = function onListenersCountInvalid(callback) {
  emitter.on("listenersCountInvalid",callback);
};

/**
 * Whenever user switches his location significantly enough that the tile changes
 * @param{ObjectId} channelId
 * @param{object} location - a valid location object !am! need to define this 
 */
var currentTileChanged = function currentTileChanged(channelId,location) {
  winston.log('info',"currentTileChanged for "+channelId);
  emitter.emit("currentTileChanged",channelId,location);
};

/**
 * Registers for notifications whenever user switches his location significantly enough that the tile changes
 * @param{function(channelId,location)} callback
 */
var onCurrentTileChanged = function onCurrentTileChanged(callback) {
  emitter.on("currentTileChanged",callback);
};

/**
 * Whenever a new channel listener is added
 * @param {ObjectId}
 */
var addedChannelListener = function addedChannelListener(channelId,listenerId) {
  emitter.emit("addedChannelListener",channelId,listenerId);
};

/**
 * Registers for notifications that a new channel listener is added
 * @param {function(channelId,listenerId)}
 */
var onAddedChannelListener = function onAddedChannelListener(callback) {
  emitter.on("addedChannelListener", callback);
};


/**
 * Whenever a channel listener is removed
 * @param {ObjectId}
 */
var removedChannelListener = function removedChannelListener(channelId,listenerId) {
  emitter.emit("removedChannelListener",channelId,listenerId);
};

/**
 * Registers for notifications that a channel listener is removed
 * @param {function(channelId,listenerId)}
 */
var onRemovedChannelListener = function onRemovedChannelListener(callback) {
  emitter.on("removedChannelListener",callback);
};

/**
 * Whenever an inconsistency is detected in the listen network
 */
var listenNetworkInconsistency = function listenNetworkInconsistency(channelId,listenerId) {
  emitter.emit("listenNetworkInconsistency",channelId,listenerId);
};

/**
 * Registers for notifications that an edge in the listen network 
 * has become (or was) inconsistent
 * @param {function(channelId,listenerId)}
 */
var onListenNetworkInconsistency = function onListenNetworkInconsistency(callback) {
  emitter.on("listenNetworkWasInconsistent",callback);
};

/**
 * Whenever a channel is first listened to
*/
var firstListenerToChannel = function firstListenerToChannel(channelId) {
  emitter.emit("firstListenerToChannel", channelId);
};

var onFirstListenerToChannel = function onFirstListenerToChannel(callback) { 
  emitter.on("firstListenerToChannel", callback);
};

var refreshChannelBlips = function refreshChannelBlips(channelId) {
  emitter.emit("refreshChannelBlips", channelId);
};

var onRefreshChannelBlips = function onRefreshChannelBlips(callback) {
  emitter.on("refreshChannelBlips", callback);
};

var tileChannelsUpdated = function tileChannelsUpdated(location) { 
  emitter.emit("tileChannelsUpdated", location);
};

var onTileChannelsUpdated = function onTileChannelsUpdated(callback) {
  emitter.once("tileChannelsUpdated", callback);
};

exports.addedChannelListener = addedChannelListener;
exports.onAddedChannelListener = onAddedChannelListener;
exports.removedChannelListener = removedChannelListener;
exports.onRemovedChannelListener = onRemovedChannelListener;
exports.listenersCountInvalid = listenersCountInvalid;
exports.onListenersCountInvalid = onListenersCountInvalid;
exports.currentTileChanged = currentTileChanged;
exports.onCurrentTileChanged = onCurrentTileChanged;
exports.onListenNetworkInconsistency = onListenNetworkInconsistency;
exports.listenNetworkInconsistency = listenNetworkInconsistency;
exports.firstListenerToChannel = firstListenerToChannel;
exports.onFirstListenerToChannel = onFirstListenerToChannel;
exports.refreshChannelBlips = refreshChannelBlips;
exports.onRefreshChannelBlips = onRefreshChannelBlips;
exports.tileChannelsUpdated = tileChannelsUpdated;
exports.onTileChannelsUpdated = onTileChannelsUpdated;
