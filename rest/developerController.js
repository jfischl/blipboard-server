/**
 * @fileoverview Resource enabling APIs for development and debugging purposes
 * @author vladimir@blipboard.com
 */

var fs = require('fs');
var winston = require('winston');

var mw = require('./middleware');
var mongo = require('../lib/mongo');
var placeManager = require('../managers/placeManager');

var api = {
  dumpHeader: function ( request, callback ) {
    if (!request.param('header')) return callback('please, specify header name as a "header" query parameter');
    var result = { }, name = request.param('header'); result[name] = request.header(name);
    callback(undefined, result); 
  },

  placeSearchPage: function placeSearchPage ( request, callback, response, next ) {
    response.send(fs.readFileSync([__dirname, 'search.html'].join('/')).toString());
  },

  placeSearch: function placeSearch ( request, callback ) {
    placeManager.find(request.param('q'), function onFound ( error, places ) {
      callback(null, error || places);
    });
  },
  placeUpdate: function placeUpdate ( request, callback ) {
    //winston.info(JSON.stringify(request.param('place'), null, 2));
    var place = request.param('place');

    if ( !place ) callback('no place was specified');
    else place._id = mongo.ObjectID(place._id);

    placeManager.update(place, callback);
  }, 
  deleteChannel: function deleteChannel(request, callback) { 
    var exec = require('child_process').exec, del;
    var account = request.param('dev');
    winston.debug("delete dev account: " + account);
    if (account === "joe") { 
      exec('./scripts/blip-delete-channel --email joe.blipper@gmail.com', callback);
    }
    else if (account === "apple") { 
      exec('./scripts/blip-delete-channel --email apple@blipboard.com', callback);
    }
    else {
      callback("fail");
    }
  }
};

exports.api = api,
exports.map = [
  { method: 'get', path: '/dump-header', action: api.dumpHeader, stack: [ ] },
  { method: 'get', path: '/places', action: api.placeSearchPage, stack: [ mw.authenticateAdministrator ] },
  { method: 'get', path: '/places/search', action: api.placeSearch, stack: [ mw.authenticateAdministrator ]} ,
  { method: 'get', path: '/:dev/delete', action:api.deleteChannel, stack: [ ] },
  { method: 'post', path: '/places', action: api.placeUpdate, stack: [ mw.authenticateAdministrator ]}
]
