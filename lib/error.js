/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview Error generator
 * @author vladimir@blipboard.com
 *
 * @created Wed, Feb 29 2012 - 12:15:07 -0800
 * @updated Thu, Apr 05 2012 - 12:00:07 -0700
 */

/** Error Codes */
var errorForms = {
  // mongo related errors
  mongoFailed:          { status: 500, message: 'MongoDB request failed', isUserError: false },
  mongoNotFound:        { status: 404, message: 'MongoDB does not contain the requested record', isUserError: false },
  mongoEmptyResult:     { status: 404, message: 'MongoDB failed to return a value', isUserError: false },

  // route related errors
  notFound:             { status: 404, message: 'Requested resource does not exist', isUserError: false },

  // middleware related errors
  badLocation:          { status: 400, message: 'Bad or missing location data', isUserError: true },
  badBounds:            { status: 400, message: 'Bad or missing bounds.  Expecting format "south,west|north,east"', isUserError:true },
  failedToAuthenticate: { status: 401, message: 'Authentication failed', isUserError: true },

  // method errors
  missingParameter:     { status: 400, message: 'Missing parameter', isUserError: true},
  badParameter:         { status: 400, message: 'Bad parameter', isUserError: true},

  // facebook error
  facebookError:        { status: 500, message: 'Facebook error', isUserError: false},
  placeDataRefreshing:  { status: 503, message: 'Facebook place data is refreshing', isUserError: false},
  
  // misc internal errors
  badTileCode:          { status: 500, message: 'Bad tile code', isUserError: false },
  idsDontExist:         { status: 404, message: 'Can\'t find ids', isUserError: false },
  validationError:      { status: 400, message: 'Invalid parameter', isUserError: false }
};

var standardHTTPErrorForms = {
  // Standard HTTP Client errors
  badRequest:                  { status: 400, message: 'The request could not be understood by the server', isUserError: true},
  unAuthorized:                { status: 401, message: 'The request requires authentication', isUserError: true },
  paymentRequired:             { status: 402, message: 'The request requires authentication', isUserError: true },
  forbidden:                   { status: 403, message: 'The user doesn\'t have permission to access this resource', isUserError: true },
  notFound:                    { status: 404, message: 'The resource could not be found', isUserError: true },
  methodNotAllowed:            { status: 405, message: 'The HTTP method is not allowed for this resource', isUserError: true },
  notAcceptable:               { status: 406, message: 'Cannot provide a response consistent with the content accept headers', isUserError: true },
  proxyAuthenticationRequired: { status: 407, message: 'Client must authorize itself with a proxy', isUserError: true },
  requestTimeout:              { status: 408, message: 'The client did not produce a request within an appropriate time', isUserError: true },
  conflict:                    { status: 409, message: 'The request could not be completed due to a conflict with the current state of the resource', isUserError: true },
  gone:                        { status: 410, message: 'Client must authorize itself with a proxy', isUserError: true },
  lengthRequired:              { status: 411, message: 'Client must provide Content-Length header', isUserError: true },
  preconditionFailed:          { status: 412, message: 'A request header precondition is false', isUserError: true },
  requestEntityTooLarge:       { status: 413, message: 'Request is too big', isUserError: true },
  requestURITooLong:           { status: 414, message: 'Request URI is too long', isUserError: true },
  unsupportedMediaType:        { status: 415, message: 'Cannot return value in the format requested', isUserError: true },
  rangeNotSatisfiable:         { status: 416, message: 'Range request header is out of bounds', isUserError: true },

  // Standard HTTP Server errors
  internalServerError:         { status: 500, message: 'Internal server error', isUserError: true },
  notImplemented:              { status: 501, message: 'Not implemented', isUserError: true },
  badGateway:                  { status: 502, message: 'Received invalid response from upstream server', isUserError: true },
  serviceUnavailable:          { status: 503, message: 'Server is undergoing maintenance or is unavailable', isUserError: true },
  gatewayTimeout:              { status: 504, message: 'Did not receive a timely response from upstream server', isUserError: true },
  httpVersionNotSupported:     { status: 505, message: 'Server doesn\'t support the requested HTTP protocol version', isUserError: true },
}



// add standard HTTP codes to errorForms
for (var type in standardHTTPErrorForms) {
  errorForms[type] = standardHTTPErrorForms[type];
}

// copy errorForm names to type field
for (var type in errorForms) {
  errorForms[type].type = type;
}

/**
 * @desc Get default property key name for a given value
 * @param {object}
 * @return {string}
 */
function defaultKeyForValue (value) {
  switch ( typeof value ) {
      case 'boolean': return 'isUserError';
      case 'number': return 'status';
      case 'string': return 'message';
      case 'object': {
        var isAnError = value instanceof BBError || value instanceof Error;
        if ( isAnError || value instanceof Array ) return 'cause';
      }
  }
  return null;
}

/**
 * @desc Blipboard specific error class
 * @param {number?} http status code
 * @param {string?}
 * @param {array?} array of something that caused this error
 * @param {boolean?} whether it is ok to display this error to the client
 * @param {object?} a dictionary of additional properties an error might have
 */
function BBError (status, message, cause, isUserError, properties) {
  if ( !(this instanceof BBError) ) {
    var error = new BBError();
    return error.mergeAll.apply(error, arguments);
  }

  this.properties = { stack: new Error().stack }

  this.mergeAll.apply(this, arguments);
}

// defining getters and setters for BBError
BBError.prototype.__defineGetter__('type', function ( ) {
    var value = this.properties.type || 'unspecified';
    return (value instanceof Array ? value : [ value ]).join('; ');
});

BBError.prototype.__defineGetter__('status', function ( ) {
    var value = this.properties.status || 500;
    return value instanceof Array ? value[0] : value;
});

BBError.prototype.__defineGetter__('message', function ( ) {
    var value = this.properties.message || 'Internal Server Error';
    return (value instanceof Array ? value : [ value ]).join('; ');
});

BBError.prototype.__defineGetter__('stack', function ( ) { return this.properties.stack; });

BBError.prototype.__defineGetter__('cause', function ( ) { return this.properties.cause; });

BBError.prototype.__defineGetter__('isUserError', function ( ) { return this.properties.isUserError === true; });

/**
 * @desc Set property to a given value if the value is defined
 * @param {string}
 * @param {object}
 * @return {object} current blipboard error
 */
BBError.prototype.set = function set (key, value) {
  if ( value !== undefined ) this.properties[key] = value;
  return this;
}

/**
 * @desc Get property by name
 * @param {string}
 * @return {object}
 */
BBError.prototype.get = function get (key) { return this.properties[key]; }

/**
 * @desc Merge a single value into a specified property
 * @param {string}
 * @param {object}
 * @return {object} current blipboard error
 */
BBError.prototype.merge = function merge (key, value) {
  var current = this.properties[key];

  if ( current == null ) this.properties[key] =  value;
  else {
    var merged = current instanceof Array ? current : [ current ];
    var values = value instanceof Array ? value : [ value ];
    for ( var i in values ) merged.push(values[i]);
    this.properties[key] = merged;
  }
  return this;
}

/**
 * @desc Apply set to all the retrieved keys and values from the arguments
 * @return {object} current blipboard error
 */
BBError.prototype.setAll = function setAll ( ) {
  for ( var i in arguments ) {
    var value = arguments[i];
    var key = defaultKeyForValue(value);

    if ( key == null ) {
      for ( var i in value ) this.set(i, value[i]);
    }
    else {
      this.set(key, value);
    }
  }
  return this;
}

/**
 * @desc Apply merge to all the retrieved keys and values from the arguments
 * @return {object} current blipboard error
 */
BBError.prototype.mergeAll = function mergeAll ( ) {
  for ( var i in arguments ) {
    var value = arguments[i];
    var key = defaultKeyForValue(value);

    if ( key == null ) {
      for ( var i in value ) this.merge(i, value[i]);
    }
    else {
      this.merge(key, value);
    }
  }
  return this;
}

/**
 * @desc Ensures that error is a blipboard error
 * @param {object}
 * @return {object} blipboard error object
 */
BBError.normalizeError = function normalizeError (error) {
  if (error == null || error instanceof BBError) return error;
  return new BBError({ cause: error }).set('stack', error.stack);
}



function defaultErrorResourceForStatus(status) {
  if (status>=400 && status <500) {
    return { message: "Client error", type: 'clientError' };
  }
  else if (status>=500 && status<600) {
    return { message:"Internal server error", type: 'serverError' };
  }
  else {
    return { message:"Unknown error", type: 'unknownError' };
  }
}

/**
 * attempts to find a standard error for status
 */
function standardErrorFormForStatus(status) {
  for (var type in standardHTTPErrorForms) {
    var form = standardHTTPErrorForms[type];
    if (form.status==status) {
      return form;
    }
  }
}
/**
 * Converts the BBError object into its resourceful form:
 *     { message: "the error message",
 *       type: 'errType' }
 * For non user errors (isUserError=false), this generates an approriate
 * resource representing the error to a user of the system
 * @param{boolean} showInternal if true, internal errors are displayed.
 */
BBError.prototype.asResource = function asResource(showInternal) {
  if (this.isUserError || showInternal) {
    return { message: this.message,
             type: this.type };
  }
  else {
    var standardForm = standardErrorFormForStatus(this.status);
    if (standardForm) {
      var userError = BBError[standardForm.type]();
      return { message:  userError.message,
               type: userError.type };
    }
    else {
      return defaultErrorResourceForStatus(this.status);
    }
  }
}

// Add predesigned error generators to the module and error class
for (var name in errorForms) {
  (function (base, name) {
    /**
     * Error generator for a particular error described in the config
     * @param {object} custom fields that have to me merged into the error
     * @return {BBError} customized error of a preconfigured type
     */
    var customBBError = function ( ) {
      var error = new BBError(base);
      error.mergeAll.apply(error, arguments);
      return error;
    }
    customBBError.type=name;
    exports[name] = BBError[name] = customBBError;
  })(errorForms[name], name);
}

exports.BBError = BBError;
