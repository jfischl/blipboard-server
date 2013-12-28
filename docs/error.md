Errors
======

This document explains how errors are handled.

Basic usage
-----------

    var BBError = require('./lib/error').BBError;

    // create your own error:
    new BBError({message:'My new error demonstrates Errors', // descriptive text
                 type:'myError',         // helpful constant
                 status:555,             // http status code
                 cause:thePreviousError, // optional - any js object is fine
                 isUserError:false});    // isUserError is false by default
           
    // use a provided error:
    BBError.notImplemented({message:'Wish I had more time'}); 
        // note: message will be appended to the standard message
        
    // equivalent to previous:
    BBError.notImplemented("Wish I had more time!");
        
Environment Variables
---------------------
    
    BLIPBOARD_ERROR_LOG_STACK 

If set, stack trace will be visible in the server log

    BLIPBOARD_LOG_USER_ERRORS

If set, user errors will be logged (e.g., calling APIs with wrong params)

    BLIPBOARD_API_RESPONSE_RETURN_STACK
 
If set, stack trace will be visible in the HTTP result returned by the API

    BLIPBOARD_API_RESPONSE_RETURN_INTERNAL_ERRORS
    
If set, expose internal errors in the HTTP result returned by the API

Partial List of Provided Errors
--------------------------------     

Look in lib/error.js at the errorForms for the full list.

     // mongo related errors
      mongoFailed:      { status: 500, message: 'MongoDB request failed' },
      mongoNotFound:    { status: 404, message: 'MongoDB does not contain the requested record' },
      mongoEmptyResult: { status: 404, message: 'MongoDB failed to return a value' },

      // route related errors
      notFound:         { status: 404, message: 'Requested resource does not exist' },

      // middleware related errors
      badLocation:  { status: 400, message: 'Bad or missing location data' },
      failedToAuthenticate: { status: 401, message: 'Authentication failed' },

     // Standard HTTP Client errors
      badRequest:       { status: 400, message: 'The request could not be understood by the server.'},
      unAuthorized:     { status: 401, message: 'The request requires authentication' },
      paymentRequired:  { status: 402, message: 'The request requires authentication' },
      forbidden:        { status: 403, message: 'The user doesn\'t have permission to access this resource' },
      notFound:         { status: 404, message: 'The resource could not be found' },
      methodNotAllowed: { status: 405, message: 'The HTTP method is not allowed for this resource' },
      notAcceptable:    { status: 406, message: 'Cannot provide a response consistent with the content accept headers' },
      proxyAuthenticationRequired: { status: 407, message: 'Client must authorize itself with a proxy' },
      requestTimeout:   { status: 408, message: 'The client did not produce a request within an appropriate time' },
      conflict:         { status: 409, message: 'The request could not be completed due to a conflict with the current state of the resource' },
      gone:             { status: 410, message: 'Client must authorize itself with a proxy' },
      lengthRequired:   { status: 411, message: 'Client must provide Content-Length header' },
      preconditionFailed: { status: 412, message: 'A request header precondition is false' },
      requestEntityTooLarge: { status: 413, message: 'Request is too big' },
      requestURITooLong:  { status:414, message: 'Request URI is too long' },
      unsupportedMediaType:  { status:415, message: 'Cannot return value in the format requested' },
      rangeNotSatisfiable:   { status:416, message: 'Range request header is out of bounds' },

      // Standard HTTP Server errors
      internalServerError:   { status: 500, message: 'Internal server error' },
      notImplemented:        { status: 501, message: 'Not implemented' },
      badGateway:            { status: 502, message: 'Received invalid response from upstream server' },
      serviceUnavailable:    { status: 503, message: 'Server is undergoing maintenance or is unavailable' },
      gatewayTimeout:        { status: 504, message: 'Did not receive a timely response from upstream server' },
      httpVersionNotSupported: { status: 505, message: 'Server doesn\'t support the requested HTTP protocol version' },
    

