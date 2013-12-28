/**
 * @fileoverview API for user manipulation
 * @author jason@blipboard.com
 */
var assert = require('assert');
var winston = require('winston');

var BBError = require('../lib/error').BBError;
var className = require('../lib/javascript').className;
var js = require('../lib/javascript');
var logCallback = require('../lib/logutil').logCallback;
var logHandler = require('../lib/logutil').logHandler;
var mongo = require('../lib/mongo');
var mw = require('./middleware');
var notificationManager = require('../managers/notificationManager');
var resource = require('./resource');
var userManager = require('../managers/userManager');
var serverUrl = require('../config').SERVER.url;

var convertResultToNotifications = function convertResultToNotifications(request, result) { 
  var acknowledge = serverUrl.clone(), operations = {};
  acknowledge.path("/accounts/me/notifications/acknowledge");
  
  if (result.data.length > 0) { 
      operations = {
        acknowledge: {method: 'POST',
                      uri: acknowledge.toString(),
                      params: { id: result.data[0]._id.toString() } } 
      };
  }

  var notifications = {
    data: result.data.map(resource.notificationToResource.curry(request)),
    paging: result.paging,
    operations: operations
  };
  
  var toBlipResource = resource.blipToResource.curry(request);
  assert(result.blips);
  resource.arrayToDictionary(notifications, 'blips', result.blips.map(toBlipResource));
  assert(result.channels);
  resource.arrayToDictionary(notifications, 'channels', result.channels.map(resource.channelToResource.curry(request)));
  
  return notifications;
};

var api = {
  getAccount: function getAccount(request, callback) {
    callback(null, { account: resource.userDocumentToAccount(request, request.user) });
  },

  createAccount: function createAccount (request, callback) {
    function doneCreateAccountChannel(error, account) {
      if (error) {
        callback(error);
      }
      else {
        callback(null, { account : resource.userDocumentToAccount(request, account) } );
      }
    }

    var password = request.param('password');
    var fbToken = request.param('fbtoken');

    if (fbToken) {
      userManager.createFacebookUser(fbToken, password, 
                                     logCallback("accountManager.createFacebookAccount",
                                                 {fbToken:fbToken}, 
                                                 doneCreateAccountChannel));
    }
    else {
      userManager.createAnonymousUser(password, 
                                     logCallback("accountManager.createAnonymousAccount",
                                                 {fbToken:fbToken}, 
                                                 doneCreateAccountChannel));
    }
  },

  updateAccount: function updateAccount(request, callback) { 
    userManager.updateEditableUser(request.user, request.body, logCallback("acountManager.updateAccount", {body: request.body}, done));
    
    function done(error, account) { 
      if (error) { 
        callback(error);
      }
      else {
        callback(null, { account: resource.userDocumentToAccount(request, account) });
      }
    }
  },

  updateFacebookToken: function updateFacebookToken (request, callback) {
    function doneCreateAccountChannel(error, account) {
      if (error) {
        if (js.pathValue(error, ['cause', 'error', 'code']) === 190) { // OAUTH problem
          userManager.invalidateUserAccessToken(fbToken, function() { 
            var authError = BBError.failedToAuthenticate({message: error.message, cause: error.cause});
            callback(authError);
          });
        }
        else {
          callback(error);
        }
      }
      else {
        callback(null, { account : resource.userDocumentToAccount(request, account) } );
      }
    }

    var fbToken = request.param('fbtoken');
    if (!fbToken) {
      return callback(BBError.missingParameter("Must specify access_token parameter"));
    }

    userManager.updateFacebookUser(request.user, fbToken, doneCreateAccountChannel);
  },

  reportLocation: function reportLocation (request, callback) {
    function onReportedLocation(error, location) {
      if (error) {
        callback(error);
      }
      else {
        var tile = mongo.tile(location.latitude, location.longitude);
        var center = tile.center();
        callback(null, { region: { latitude: center[0], 
                                   longitude: center[1],
                                   radius: tile.enclosingRadius() } });
      }
    }

    var details = {
      reason: request.param('reason'),
      age: request.param('age'),
      accuracy: request.param('accuracy'),
      speed: request.param('speed')
    };
    userManager.reportLocation(request.user, request.location, details, onReportedLocation);
  },

  getNotifications: function getNotifications (request, callback) {
    assert(request.user);

    notificationManager.getNotifications(
      request.user, 
      request.page,
      logHandler("notificationManager.getNotifications", request.user._id, 
                 callback, // error
                 function (result) { 
                   callback(null, { notifications: convertResultToNotifications(request, result)});
                 }));
  },
  
  acknowledgeNotifications: function acknowledgeNotifications (request, callback) { 
    assert(request.user);
    notificationManager.acknowledgeNotifications(
      request.user,
      request.id, // notificationId
      request.page,
      logHandler("notificationManager.acknowledgeNotifications", request.user._id, 
                 callback, // error
                 function (result) { 
                   callback(null, { notifications: convertResultToNotifications(request, result)});
                 }));
  }
};

exports.api = api;
exports.map = [
  { method: 'post',path: '', 
    action: api.createAccount,
    stack:[mw.stats("account.create")] },

  { method: 'get', path: '/:id', action: api.getAccount, 
    stack:[mw.stats("account.get"), 
           mw.authenticate, 
           mw.impression, 
           mw.requireObjectID('id'), 
           mw.checkUserIdMatchesParam('id')] },

  { method: 'put', path: '/:id', action: api.updateAccount, 
    stack:[mw.stats("account.update"), 
           mw.authenticate, 
           mw.impression, 
           mw.requireObjectID('id'), 
           mw.checkUserIdMatchesParam('id')] },

  { method: 'put', path: '/:id/access_token', action: api.updateFacebookToken, 
    stack: [mw.stats("account.access_token"), 
            mw.authenticate,
            mw.requireObjectID('id'), 
            mw.checkUserIdMatchesParam('id')]},

  { method: 'post', path: '/:id/location', action: api.reportLocation, 
    stack: [mw.stats("account.location"), 
            mw.authenticate, 
            mw.requireObjectID('id'), 
            mw.checkUserIdMatchesParam('id'), 
            mw.requireLocation ] },
  
  { method: 'get', path: '/:id/notifications', 
    action: api.getNotifications, 
    stack:[mw.stats("account.getNotifications"), 
           mw.authenticate, 
           mw.impression, 
           mw.requireObjectID('id'), 
           mw.checkUserIdMatchesParam('id'),
           mw.requirePage([{name: '_id', order: -1, type: 'objectID'}] )
          ]},
  { method: 'post', path: '/:uid/notifications/acknowledge', 
    action: api.acknowledgeNotifications, 
    stack: [mw.stats("account.acknowledgeNotifications"), 
            mw.authenticate,
            mw.requireObjectID('uid'), 
            mw.checkUserIdMatchesParam('uid'),
            mw.requireObjectID('id'),
            mw.requirePage([{name: '_id', order: -1, type: 'objectID'}])
           ]}
];
