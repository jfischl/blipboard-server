/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview Utilities for logging callback results
 * @author aneil@blipboard.com
 *
 */

var winston = require('winston');
var assertClass = require('./javascript').assertClass;
/**
 * Returns a callback which logs errors to winston.error(...) or winston.{level}(...)
 * and then calls the provided callback 
 * @param {String} level - optional... logCallback("mymessage",myCallback) is fine
 * @param {String} message - required
 * @param {Object} args - required arguments list (to be added to message)
 * @param {Function(error,result)} callback
 */
var logCallback = function logCallback(level,message,args,callback) {
  if (arguments.length === 3) {
    callback = args;
    args = message;
    message = level;
    level = "info";
  }

  var fullMessage;
  if (args) {
    fullMessage = message + " (" + JSON.stringify(args) + ")";
  }
  else {
    fullMessage = message;
  }
  assertClass(callback,Function);
  assertClass(message,String);
  return function callbackWithLogging(error,result) {
    if (error) {
      //winston.error(fullMessage,error);
    }
    else {
      winston.log(level,fullMessage);//+" => "+JSON.stringify(result,null,1));
    }
    callback(error,result);
  };
};

/**
 * Returns a callback which logs errors to winston.error(...) or winston.{level}(...)
 * Calls either errorBack or successBack.
 * @param {String} level - optional... logCallback("mymessage",myCallback) is fine
 * @param {String} message - required
 * @param {Object} args - required arguments list (to be added to message)
 * @param {Function(error)} errorBack
 * @param {Function(result)} successBack
 */
var logHandler = function logHandler(level,message,args,errorBack,successBack) {
  var newArgs;
  var logHandlerCallback = function logHandlerCallback(error,result) {
    if (error) {
      errorBack(error);
    }
    else {
      successBack(result);
    }
  }

  if (!successBack) {
    successBack = errorBack;
    errorBack = args;
    args = message;
    message = level;
    level = "info";
  }
  assertClass(errorBack,Function);
  assertClass(successBack,Function);

  return logCallback(level,message,args,logHandlerCallback);
}

exports.logCallback = logCallback;
exports.logHandler = logHandler;