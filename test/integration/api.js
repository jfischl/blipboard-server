/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview A way of making http calls to blipboard api
 * I love magic! It helps me with reading and writing code.
 * Don't like it? Don't use it! :)
 * @author vladimir@blipboard.com
 *
 * @created Fri, Mar 09 2012 - 22:13:07 -0800
 * @updated Sat, Mar 10 2012 - 01:37:34 -0800
 */

var http = require('http');
var config = require('../../config').SERVER;

var client = http.createClient(config.uri.port());

/**
 * @desc Create request, send it, and wait for response
 * @param {string}
 * @param {string}
 * @param {object} key - value pairs determining query parameters
 * @param {object} json object representing request body
 * @param {object} credentials used for authorization header
 * @param {function(error, data)}
 */
function request (method, url, query, body, auth, callback) {
  // setting things up for the request
  var params = [ ];
  for ( var key in query ) params.push([key, query[key]].join('='));
  var query = params.join('&');
  var body = body != null ? JSON.stringify(body) : '';

  var url = url + (query ? '?' + query : '');
  var request = client.request(method, url);

  // creating, sending, and responding
  request.setHeader('Content-Type', 'application/json');
  request.setHeader('Authorization', 'basic ' + auth.username + ':' + auth.password);

  request.write(body);

  request.end();

  request.on('response', function onResponse (response) {
    // the headers are received
    var failed = response.status != 200;
    response.setEncoding('utf-8');
    response.on('data', function onData (data) {
      // the body is received
      var data = JSON.parse(data) || { };
      if (failed) callback(data); else callback (null, data);
    });
  });
}

/**
 * @desc Magical api function generator
 * @param {string} url used by api
 * @param {object} authorization credentials
 */
function generate (url, auth) {
  /**
   * @desc Magical api representation
   * @param {string} next token for the url
   */
  function api ( token ) { return generate(url + (token == null ? '' : '/' + token), auth); }

  /**
   * @desc Set up credentials used for api call authentication
   * @param {string}
   * @param {string}
   */
  api.auth = function auth (username, password) {
    return generate(url, { username: username, password: password });
  }

  /**
   * @desc Show current url used for making http requests
   */
  api.show = function ( ) { console.log( url ); }

  /**
   * @desc Shortcuts for sending requests to the api url
   * @param {object}
   * @param {function(error, data)}
   */
  api.post = function ( body, callback ) { request('post', url, null, body, auth, callback); }
  api.get = function ( body, callback ) { request('get', url, body, null, auth, callback); }
  api.put = function ( body, callback ) { request('put', url, null, body, auth, callback); }
  api.delete = function ( callback ) { request('delete', url, null, null, auth, callback); }

  return api;
}

exports.api = generate('http://localhost:' + config.port);
