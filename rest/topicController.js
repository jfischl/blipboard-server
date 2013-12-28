/**
 * @fileoverview Resource enabling APIs for managing topics
 * @author jason@blipboard.com
 */

var fs = require('fs');
var winston = require('winston');

var js = require('../lib/javascript');
var logCallback = require('../lib/logutil').logCallback;
var mongo = require('../lib/mongo');
var mw = require('./middleware');
var resource = require('./resource');
var topicManager = require('../managers/topicManager');


var api = {
  getTopics: function ( request, callback ) {
    topicManager.getTopics(request.page, 
                           function (error, result) {
                             if (error) { 
                               callback(error);
                             }
                             else {
                               result.data = result.data.map(resource.topicToResource.curry(request));
                               callback(null, { topics: result });
                             }
                           });
  }
};

exports.api = api;
exports.map = [
  { method: 'get', path: '/', action: api.getTopics, 
    stack: [mw.stats("topics.get"), 
            mw.requirePage([{name: 'name', order: 1, type: function (value) { return value; } }]) ]
  }
];

