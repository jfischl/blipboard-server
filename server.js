/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview RESTful web service for accessing and manipulating BB data
 * @author vladimir@blipboard.com
 *
 * @created Wed, Feb 22 2012 - 17:53:47 -0800
 * @updated Thu, Feb 23 2012 - 18:22:45 -0800
 */

if (process.env.NODETIME)  {
  require('nodetime').profile({
    accountKey: process.env.NODETIME_KEY,
    appName: 'blipboard.' + appName
  });
  console.log("Using " + 'blipboard.' + appName + " as app name for nodetime");
}



var async = require('async');
var os = require('os');
var appName = process.env.BLIPBOARD_NAME || os.hostname();

var express = require('express');
var sprintf = require('sprintf').sprintf;
var winston = require('winston');

var BBError = require('./lib/error').BBError;
var categories = require('./data/categories');
var className = require('./lib/javascript').className;
var debugConfig = require('./config').DEBUG;
var events = require('./lib/events');
var facebook = require('./lib/facebook');
var mongo = require('./lib/mongo');
var mw = require('./rest/middleware');
var placeManager = require('./managers/placeManager');
var refresh = require('./managers/blipRefreshService');
var serverPort = require('./config').SERVER.port;
var serverUrl = require('./config').SERVER.url;

var isReady = false;

/**
 * @desc Generate a response and send it back
 * @param {http.Response}
 * @param {number} http status code (200/404/etc)
 * @param {object} body content
 * @param {string} data format (html/json/txt)
 */
var respond = function (response, status, body, format, headers) {
  var content = '';
  if (!headers) {
    headers = {};
  }
  switch (format) {
    case 'html':
      headers['Content-Type'] = 'text/html';
      content = '<pre>' + JSON.stringify(body, null, 4) + '</pre>';
      break;
    case 'json':
      headers['Content-Type'] = 'application/json';
      content = JSON.stringify(body);
      break;
    case 'txt':
      headers['Content-Type'] = 'text/plain';
    content = JSON.stringify(body, null, 4);
      break;
    default:
      headers['Content-Type'] = 'application/json';
      content = JSON.stringify(body);
      break;
  }

  //console.log( '---> CONTENT: ' + JSON.stringify(content, null, 2) );

  //headers['Cache-Control'] = 'public';
  response.writeHead(status, headers);
  response.write(content);
  response.write("\n");
  response.end();
}

/**
 * @desc Generate middleware for producing result for an application route
 * @param {function(object, callback)} routine for processing a single request
 * @return {function}
 */
var produceResult = function (routine) {
  return function (request, response, next) {
    var now = new Date();
    routine(request, function (error, data) {
      if (error) {
        next(error); // handled by middleware handleError handler
      }
      else {
        data = decorateScalar(data);
        respond(response, 200, data, request.param('format', 'json'));
      }
    }, response, next);
  }
}

/**
 * Ensures scalar values are returned as { result: value }
 */
function decorateScalar(value) {
  var cls = className(value)
  if (value===undefined) {
    return "";
  }
  if (['Number','String','Boolean'].indexOf(cls)!=-1) {
    return { result: value };
  }
  else {
    return value;
  }
}
/**
 * @desc Add route to the web server
 * @param {express.Server}
 * @param {string} base path that is prepended to the relative path specified in the resource
 * @param {object} resource module that contains a map of triples: method - get/post/put/delete, path, action
 */
var route = function (app, path, resource) {
  var stack = [ ];
  for (var i in resource.map) {
    var res = resource.map[i];
    res.stack.push(mw.checkClientVersion); // all requests should check version

    var fullPath = (path + res.path) || '/';
    //winston.log('info','ADDED ROUTE: ' + fullPath + ' -> ' + res.method);
    app[res.method](
      fullPath + '.:format?',
      res.stack || [ ],
      produceResult(res.action)
    );
  }
}

var getUrl = function getUrl ( request, response, next ) {
  placeManager.findPlaceByURLId(request.param('id'), function ( error, url ) {
    if ( error ) next(error);
    else response.send(url);
  });
}

var redirect = function redirect ( request, response, next ) {
  placeManager.findPlaceByURLId(request.param('id'), function ( error, url ) {
    if ( error ) next(error);
    else response.redirect(url);
  });
}

var app = express.createServer();

app.configure(function handleRequest ( ) {
  // enable web server logging; pipe those log messages through winston
  var winstonStream = {
    write: function(message, encoding){
      winston.info(message);
    }
  };
  this.use(express.logger({stream:winstonStream}));

  //this.use(express.logger('short'));
  this.use(express.bodyParser());
  this.use(app.router);

  this.use(express.static(__dirname + '/public'));

  /**
   * @desc Pass not found error if the request cannot be routed
   * @param {http.Request}
   * @param {http.Response}
   * @param {function(error)}
   */
  this.use(function defaultRoute (request, response, next) {
    if (!request.params) {
      request.params = { };
    }
    if (!request.params.format) {
      request.params.format = request.url.split('?').shift().split('.').pop();
    }
    next(BBError.notFound());
  });

  /**
   * @desc Handle thrown or passed error
   * @param {object}
   * @param {http.Request}
   * @param {http.Response}
   * @param {function(error)}
   */
  this.use(function handleError (error, request, response, next) {
    error = BBError.normalizeError(error);
    if (debugConfig.logUserErrors || !error.isUserError) {
      winston.log('info',sprintf("Error detected: %s; cause=%s", error.message, error.cause));
    }
    if (debugConfig.logErrorStack && !error.isUserError) {
      winston.log('info',"Error stack: " + error.stack); // !am! this should be written to a separate file, and captured in the log
    }
    var errorBody = { error: error.asResource(debugConfig.returnInternalErrors) };
    respond(
      response,
      error.status || 500,
      errorBody,
      request.param('format', 'json'),
      error.properties.headers
    );
  });
});


async.series({ mongo: mongo.initialize,
               topics: categories.loadTopicIds,
               facebook: facebook.loadDeveloperAccessToken
             },
             function (error) { 
               if (error) {
                 winston.log('info', "MongoDB initialization failed: " + error );
               }
               else { 
                 // Actually routing requests to the appropriate resources
                 route(app, '/blips',  require('./rest/blipController'));
                 route(app, '/dev', require('./rest/developerController'));
                 route(app, '/channels', require('./rest/channelController'));
                 route(app, '/accounts', require('./rest/accountController'));
                 route(app, '/topics', require('./rest/topicController'));
                 
                 // Route for still alive check
                 app.get('/still-alive', function isAlive ( request, response ) { response.send('Still Alive!'); });
                 
                 // Get place url
                 app.get('/places/:id/url', getUrl);
                 
                 // Redirect to place
                 app.get('/places/:id', redirect);
                 
                 // a shortcut for /channels/:id/... urls, as defined in api.md
                 route(app, '', require('./rest/channelController'));
                 
                 /**
                  * @desc Do some maintanance when the server is ready
                  */
                 function onReady ( ) {
                   winston.log('info','=====> Listening on ' + serverPort + ' <=====');
                   isReady = true;
                   refresh.initialize();
                   events.serverReady();
                 }
                 
                 app.listen(serverPort, onReady);
               }
             });

exports.isReady = function ( ) { return isReady === true; }

//process.on('uncaughtException', function ( error ) { winston.error(error); } );
//setInterval(function ( ) { console.log( 'throwing' ); assert(false); }, 1000);
