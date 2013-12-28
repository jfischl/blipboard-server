/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview Middleware executed for every request to the web server
 * @author vladimir@blipboard.com
 *
 * @created Wed, Feb 22 2012 - 18:17:33 -0800
 * @updated Wed, Apr 04 2012 - 11:40:01 -0700
 */
var winston = require('winston');
var auth = require('http-auth');
var sprintf = require('sprintf').sprintf;

var config = require('../config');
var graphite = require('../lib/graphite');
var intercom = require('../lib/intercom');
var js = require('../lib/javascript');
var password = require('../lib/password');
var BBError = require('../lib/error').BBError;
var ObjectID = require('../lib/mongo').ObjectID;
var Page = require('../lib/page').Page;
var userManager = require('../managers/userManager');

var adminAuth = auth({authRealm : "Private Area", authList : ['admin:life=ski']});
var authenticateAdministrator = function authenticateAdministrator(request, response, next) 
{
  adminAuth.apply(request, response, function (user) { 
    next();
  });
};

/**
 * @desc User authentication and user information retrieval
 * @param {http.Request}
 * @param {http.Response}
 * @param {function(error)}
 */
function authenticate (request, response, next) {
  function onAuthenticateUser (error, user) {
    if (error) return next(error);
    if (!user) return next(BBError.failedToAuthenticate({message: "Can't find user"}));
    //winston.info(user._id + "(" + user._id + ") authenticated ");
    
    request.user = user;
    request.user.isLoggedIn = true;
    next();
  }

  var header = request.header('Authorization');
  if (!header) {
    var error = BBError.failedToAuthenticate({
      message: 'Cannot find authorization header'
    });
    return next(error);
  }

  var auth = header.split(' ');
  var method = auth[0].toUpperCase();
  switch (method) {
  case 'BASIC':
    var credentials64 = auth[1];
    if (!credentials64) {
      var error = BBError.failedToAuthenticate({
        message: 'Credentials are missing'
      });
      return next(error);
    }

    var credentials = password.base64Decode(credentials64).split(':');
    var name = credentials[0];
    var pswd = credentials[1];
    if (!name) {
      var error = BBError.failedToAuthenticate({
        message: 'No username found'
      });
      return next(error);
    }
    if (!pswd) {
      var error = BBError.failedToAuthenticate({
        message: 'No password found'
      });
      return next(error);
    }

    userManager.authenticateUserBasic (name, pswd, onAuthenticateUser);
    break;
    
  case 'OAUTH2':
    var accessToken = auth[1];
    userManager.authenticateUserAccessToken(name, accessToken, onAuthenticateUser);
    break;
    
  default:
    var error = BBError.failedToAuthenticate({message: 'Unknown authorization method: ' + method});
    return next(error);
  }
}

/**
 * if authorization header is present, attempts to authorize, otherwise,
 * provides a request.user object with a isLoggedIn property = false;
 */
function maybeAuthenticate (request, response, next) {
  if (!request.header('Authorization')) {
    request.user = { id: undefined,
                     isLoggedIn: false };
    next();
  }
  else {
    authenticate(request,response,next);
  }
}

/**
 * @desc Parse an address from the request
 * @param {http.Request}
 * @param {http.Response}
 * @param {function(error)}
 */
function getAddress(request,response,next) {
  request.location = {
    address: request.param('address'),
    city: request.param('city'),
    state: request.param('state'),
    country: request.param('country'),
    zip: request.param('zip')
  }
  getLocation(request,response,next);
}

/**
 * @desc Ensures that a param is the same as that of the current authenticated user, or
 *       returns a forbidden error
 * @param {http.Request}
 * @param {http.Response}
 * @param {function(error)}
 * Note: this must appear after the authenticate middleware
 */
function checkUserIdMatchesParam(param) {
  return function checkUserIdMatchesTest (request,response,next) {
    if (!request.user) {
      return next(BBError.unAuthorized());
    }
    var idString = request.param(param);
    if (idString) {
      idString = idString.toLowerCase();
    }
    var userId = request.user._id ? request.user._id.toString() : undefined;
    if (!userId || (userId !== idString && idString!=="me")){
      next(BBError.forbidden(sprintf('Expected userId (%s) to match parameter %s (%s)', 
                                     userId, param, idString)));
   }
    else {
      next();
    }
  };
}

/**
 * @desc Decorate request with .location, if info exists
 * @param {http.Request}
 * @param {http.Response}
 * @param {function(error)}
 */
function getLocation (request, response, next) {
  var latlng = request.param('latlng');
  var lat,lng;

  if (latlng) {
    var splitLatLng = latlng.split(",");
    lat = splitLatLng[0];
    lng = splitLatLng[1];
  }

  if (lat && lng) {
    var fLat = parseFloat(lat);
    var fLng = parseFloat(lng);

    if (isNaN(fLng) || isNaN(fLat)) {
      return next(BBError.badLocation("invalid values"));
    }

    if ( !request.location ) {
      request.location = { };
    }

    request.location = { latitude: fLat, longitude: fLng  };
  }

  next();
}

/**
 * @desc Parse location or fail if the request doesn't contain it
 * @param {http.Request}
 * @param {http.Response}
 * @param {function(error)}
 */
function requireLocation (request, response, next) {
  getLocation(request, response, function (error) {
    if (error) {
      next(error);
    }
    else if (!request.location) {
      next(BBError.badLocation());
    }
    else {
      next();
    }
  });
}

/**
 * @desc Decorate request with .bounds, if info exists
 * @param {http.Request}
 * @param {http.Response}
 * @param {function(error)}
 */
function getBounds (request, response, next) {
  var bounds = request.param('bounds');
  var north,south,east,west;
  var southwest,northeast;

  if (bounds) {
    try {
      var splitBounds = bounds.split("|");
      southwest = splitBounds[0].split(',');
      northeast = splitBounds[1].split(',');
      south = southwest[0];
      west = southwest[1];
      north = northeast[0];
      east = northeast[1];
    }
    catch (e) {
      return next(BBError.badBounds());
    }
  }

  if (north && south && east && west) {
    var fNorth = parseFloat(north);
    var fEast = parseFloat(east);
    var fSouth = parseFloat(south);
    var fWest = parseFloat(west);

    if (isNaN(fNorth) || isNaN(fSouth) || isNaN(fEast) || isNaN(fWest)) {
      return next(BBError.badBounds());
    }

    if ( !request.bounds ) {
      request.bounds = {};
    }

    request.bounds = { southwest:
                       {
                         latitude: fSouth,
                         longitude: fWest
                       },
                       northeast:
                       {
                         latitude: fNorth,
                         longitude: fEast
                       }
                     };
  }
  next();
}

/**
 * @desc Parse bounds or fail if the request doesn't contain it
 * @param {http.Request}
 * @param {http.Response}
 * @param {function(error)}
 */
function requireBoundsOrLocation (request, response, next) {
  if (request.param('bounds')) {
    getBounds(request, response, function (error) {
      if (error) {
        next(error);
      }
      else if (!request.bounds) {
        next(BBError.badBounds());
      }
      else {
        next();
      }
    });
  }
  else {
    getLocation(request, response, function (error) {
      if (error) {
        next(error);
      }
      else if (!request.location) {
        next(BBError.badLocation());
      }
      else {
        next();
      }
    });
  }
}

/**
 * @desc Convert the param to a mongo ObjectID, and save it in request.param
 *       If param value is "me", it uses the ObjectID of the currently logged in user
 * @param {string} name of the param
 */
function requireObjectID (param) {
  /**
   * @desc Convert param to MongoDB ObjectID
   * @param {http.Request}
   * @param {http.Response}
   * @param {function(error)}
   */
  return function requireObjectID2(request, response, next) {
    var idString = request.param(param) || '';
    if ( idString==='me' ) {
      if ( !request.user.isLoggedIn ) {
        return next(BBError.badParameter("No login credentials, but 'me' parameter provided"));
      }
      request[param] = request.user._id;
    }
    else if ( idString.length !== 24 || !idString.match(/^[0123456789abcdef]*$/) ) {
      var message = sprintf('Invalid id \'%s=%s\'', param, idString);
      return next(BBError.badParameter(message));
    }
    else {
      request[param] = ObjectID(idString);
    }
    next();
  };
}

/**
 * @desc Convert the param to an array of mongo ObjectIDs, and save it in request.param
 * @param {string} name of the param
 */
function requireObjectIDs (param) {
  /**
   * @desc Convert param to MongoDB ObjectID
   * @param {http.Request}
   * @param {http.Response}
   * @param {function(error)}
   */
  return function requireObjectIDs2(request, response, next) {
    try {
      var idStrings = JSON.parse(request.param(param));
    }
    catch (e) { 
      var message = sprintf('Invalid ids \'%s=%s\'', param, idStrings);
      return next(BBError.badParameter(message));
    }
    
    request[param] = [];
    for (var i=0; i<idStrings.length; i++) {
      var idString = idStrings[i];
      if ( idString.length !== 24 || !idString.match(/^[0123456789abcdef]*$/) ) {
        var message = sprintf('Invalid id \'%s=%s\'', param, idString);
        return next(BBError.badParameter(message));
      }
      request[param].push(ObjectID(idString));
    }
    next();
  };
}

/**
 * @desc Ensure the param exists, and save it in request.param
 * @param {string} name of the param
 */
function requireParam (param) {
  /**
   * @desc Ensure param exists (is not empty string)
   * @param {http.Request}
   * @param {http.Response}
   * @param {function(error)}
   */
  return function requireParam2(request, response, next) {
    var paramValue = request.param(param);
    if ( paramValue === undefined ) {
      return next(BBError.missingParameter(param));
    }
    else {
      request[param] = paramValue;
    }
    next();
  };
}

/**
 * @desc Apply requireObjectID when parameter value is defined
 * @param {string} name of the param
 */
var requireObjectIDIfExists = function requireObjectIDIfExists ( param ) {
  return function requireObjectIDIfExists2 ( request, response, next ) {
    if ( request.param(param) ) return requireObjectID(param)(request, response, next);
    next();requireString
  }
}

/**
 * @desc Create middleware that uses request to create page object corresponding to a given index
 * @param {object}
 * @param {function}
 */
var requirePage = function requirePage ( index ) {
  var getPage = function getPage (request, response, next) {
    var since = request.param('since');
    var until = request.param('until');
    var limit = request.param('limit');
    var hasNext = request.param('next');
    var hasPrev = request.param('prev');

    var uri = request.path;
    var params = [ ];
    for (var i in request.query) {
      if ( !i.match(/^(since|until|limit|next|prev)$/) ) params.push([i, request.query[i]].join('='));
    }
    if ( params.length > 0 ) uri = [uri, params.join('&')].join('?');

    limit = parseFloat(limit);
    limit = isNaN(limit) ? null : limit;

    request.page = new Page(uri, index, since, until, limit, hasNext, hasPrev);

    next();
  }
  return getPage;
}

/**
 * @desc Intersect requested region bounds with the bounds specified in the config
 * @param {http.Request}
 * @param {http.Response}
 * @param {function(error)}
 */
var restrictBounds = function restrictBounds ( request, response, next ) {
  var point = {
    southwest: { latitude: 0, longitude: 0 },
    northeast: { latitude: 0, longitude: 0 },
    area: 0
  }

  if ( !request.bounds ) {
    request.bounds = point;
    return next();
  }

  var reqSWLat = request.bounds.southwest.latitude;
  var reqSWLon = request.bounds.southwest.longitude;
  var reqNELat = request.bounds.northeast.latitude;
  var reqNELon = request.bounds.northeast.longitude;

  for ( var city in config.REGIONS ) {
    var region = config.REGIONS[city];

    var regSWLat = region.southwest.latitude;
    var regSWLon = region.southwest.longitude;
    var regNELat = region.northeast.latitude;
    var regNELon = region.northeast.longitude;
    
    var bounds = {
      southwest: {
        latitude: Math.max(Math.min(reqSWLat, regNELat), regSWLat),
        longitude: Math.min(Math.max(reqSWLon, regSWLon), regNELon)
      },
      northeast: {
        latitude: Math.min(Math.max(reqNELat, regSWLat), regNELat),
        longitude: Math.max(Math.min(reqNELon, regNELon), regSWLon)
      }
    }

    var lat = bounds.southwest.latitude - bounds.northeast.latitude;
    var lon = bounds.southwest.longitude - bounds.northeast.longitude;

    bounds.area = lat * lon;

    if ( bounds.area != 0 ) {
      request.bounds = bounds;
      return next();
    }
  }

  request.bounds = point;
  next();
}

var stats = function stats(name)
{
  return function(req, res, next){
    var writeHead = res.writeHead;
    var start = new Date;
    
    if (res._responseTime) return next();
    res._responseTime = true;

    // proxy writeHead to calculate duration
    res.writeHead = function(status, headers){
      var duration = new Date - start;
      res.setHeader('X-Response-Time', duration + 'ms');
      res.writeHead = writeHead;
      res.writeHead(status, headers);

      graphite.set("api.concurrent_requests", -1);
      graphite.set("api." + name + ".ms", duration);
      graphite.set("api." + name + ".status." + status, 1);
    };

    graphite.set("api.concurrent_requests", 1);
    next();
  };
};

var impression = function impression(req, res, next)
{
  // moved to ios client after 1.0.2
  var version = req.clientVersion;
  if (version === "1.0.1" || version === "1.0.2" || version === undefined) { 
    if (req.user && req.user._id) {
      intercom.recordImpression(req.user._id, req.connection.remoteAddress, function noop() {});
    }
  }
  next();
};

var checkClientVersion = function checkClientVersion(req, res, next) 
{
  req.clientVersion = req.header('BlipboardClientVersion') ;
  var clientBuild = req.header('BlipboardClientBuild');
  req.clientBuild = clientBuild ? parseInt(clientBuild) : 0;
  next();
};

// Public Interface
exports.authenticateAdministrator = authenticateAdministrator;
exports.authenticate = authenticate;
exports.maybeAuthenticate = maybeAuthenticate;
exports.getAddress = getAddress;
exports.checkUserIdMatchesParam = checkUserIdMatchesParam;
exports.getLocation = getLocation;
exports.requireLocation = requireLocation;
exports.getBounds = getBounds;
exports.requireBoundsOrLocation = requireBoundsOrLocation;
exports.requireObjectID = requireObjectID;
exports.requireObjectIDs = requireObjectIDs;
exports.requirePage = requirePage;
exports.restrictBounds = restrictBounds;
exports.requireParam = requireParam;
exports.stats = stats;
exports.impression = impression;
exports.checkClientVersion = checkClientVersion;
