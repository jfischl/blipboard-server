/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview Blacklisted content manager
 * @author vladimir@blipboard.com
 *
 * @created Wed, Jun 13 2012 - 11:03:56 -0700
 * @updated Wed, Jun 13 2012 - 11:03:56 -0700
 */

var async = require('async');
var mongo = require('../lib/mongo');
var ObjectID = require('../lib/mongo').ObjectID;

/**
 * @desc Retrieve all blacklisted places from the database
 * @property {function}
 */
var getPlaces = exports.getPlaces = function getPlaces ( callback ) {
  var finalCallback = function finalCallback ( error, result ) {
    if ( typeof callback == 'function' ) {
      callback(error, result);
    }
  };

  var criterion = { blacklisted: true, type: 'place' }
  mongo.channels.find(criterion).toArray(finalCallback);
};

/**
 * @desc Retrieve all blacklisted channel ranks from the database
 * @property {function}
 */
var getChannelRanks = exports.getChannelRanks = function getChannelRanks ( callback ) {
  var finalCallback = function finalCallback ( error, result ) {
    if ( typeof callback === 'function' ) {
      callback(error, result);
    }
  };

  var criterion = { blacklisted: true };
  mongo.channelRanks.find(criterion).toArray(finalCallback);
};

/**
 * @desc Retrieve all blacklisted blips from the database
 * @property {function}
 */
var getBlips = exports.getBlips = function getBlips ( callback ) {
  var finalCallback = function finalCallback ( error, result ) {
    if ( typeof callback == 'function' ) {
      callback(error, result);
    }
  };

  var criterion = { $or: [
    { blacklisted: true },
    { 'author.blacklisted': true },
    { 'place.blacklisted': true }
  ]};
  mongo.blips.find(criterion).toArray(finalCallback);
};

/**
 * @desc Retrieve all blacklisted received blips from the database
 * @property {function}
 */
var getReceivedBlips = exports.getReceivedBlips = function getReceivedBlips ( callback ) {
  var finalCallback = function finalCallback ( error, result ) {
    if ( typeof callback == 'function' ) {
      callback(error, result);
    }
  };

  var criterion = { blacklisted: true }
  mongo.receivedBlips.find(criterion).toArray(finalCallback);
};

var addPlaces = exports.addPlaces = function addPlaces ( ) {
  var fbIds = parseIds(arguments);
  var callback = parseCallback(arguments);

  var channels = { place: { 'facebook.id': { regex: [ ], values: { } } } }
  for ( var i = 0; i < fbIds.length; i++ ) {
    channels.place['facebook.id'].values[fbIds[i]] = fbIds[i];
  }

  add(channels, callback);
}

var removePlaces = exports.removePlaces = function removePlaces ( ) {
  var fbIds = parseIds(arguments);
  var callback = parseCallback(arguments);

  var channels = { place: { 'facebook.id': { regex: [ ], values: { } } } }
  for ( var i = 0; i < fbIds.length; i++ ) {
    channels.place['facebook.id'].values[fbIds[i]] = fbIds[i];
  }

  remove(channels, callback);
}

var add = exports.add = function add ( channels, callback ) {
  identifyChannels(channels, function onIdentified ( error, ids ) {
    if ( error ) return callback(error);

    markChannels(true, ids, callback);
  });
}

var remove = exports.remove = function remove ( channels, callback ) {
  identifyChannels(channels, function onIdentified ( error, ids ) {
    if ( error ) return callback(error);

    markChannels(false, ids, callback);
  });
}

/**
 * @desc Get ids for the channels specified in the description
 */
var identifyChannels = function identifyChannels ( description, callback ) {
  var criterion = { $or: [ ] }

  for ( var type in description ) {
    for ( var path in description[type] ) {
      var value = description[type][path];
      var values = [ ];

      if ( typeof value.values == 'object' ) {
        for ( var i in value.values ) values.push(value.values[i]);
      }

      if ( value.regex instanceof Array ) {
        for ( var i in value.regex ) values.push(value.regex[i]);
      }

      current = { type: type }
      current[path] = { $in: values }

      criterion.$or.push(current);
    }
  }

  var fields = [ '_id' ];
  mongo.channels.find(criterion, fields).toArray(function onFound ( error, channels ) {
    if ( error ) {
      return callback(error);
    }

    var channelToId = function channelToId ( channel ) { 
      return channel._id; 
    }

    callback(null, channels.map(channelToId));
  });
}

/**
 * @desc Extract callback function from the argument list
 */
var parseCallback = function parseCallback ( args ) {
  var callback = args[args.length - 1];
  return typeof callback == 'function' ? callback : function ( ) { };
}

/**
 * @desc Extract ids from the argument list
 */
var parseIds = function parseIds ( args ) {
  var ids = [ ];

  for ( var i in args ) {
    var arg = args[i];

    if ( arg instanceof Array ) {
      ids = ids.concat(parseIds(arg));
    }
    else {
      if ( typeof arg != 'function' ) ids.push(arg);
    }
  };

  return ids;
}


/**
 * @desc Mark specified channels as black or white -listed
 * @property {boolean}
 * @property {array}
 * @property {string}
 * @property {function}
 */
var markChannels = exports.markChannels = function markChannels ( blacklisted, ids, callback ) {
  var workers = ids.map(function ( id ) {
    var id = ObjectID(id);
    
    return function markWorker ( callback ) {
      async.parallel(
        [
          function markChannels ( callback ) {
            var criterion = { _id: id }
            var actions = { $set: { blacklisted: blacklisted } }
            var options = { safe: true, multi: true }
            mongo.channels.update(criterion, actions, options, callback);
          },
          function markChannelRanks ( callback ) {
            var criterion = { channel: id }
            var actions = { $set: { blacklisted: blacklisted } }
            var options = { safe: true, multi: true }
            mongo.channelRanks.update(criterion, actions, options, callback);
          },
          function markBlipAuthors ( callback ) {
            var criterion = { 'author._id': id }
            var actions = { $set: { 'author.blacklisted': blacklisted } }
            var options = { safe: true, multi: true }
            mongo.blips.update(criterion, actions, options, callback);
          },
          function markBlipPlaces ( callback ) {
            var criterion = { 'place._id': id }
            var actions = { $set: { 'place.blacklisted': blacklisted } }
            var options = { safe: true, multi: true }
            mongo.blips.update(criterion, actions, options, callback); 
          }
        ],
        function onMarkedChannelsAndBlips ( error, result ) {
          var criterion = { $or: [ { 'author._id': id }, { 'place._id': id } ]}
          mongo.blips.find(criterion, [ '_id' ]).toArray(function ( error, result ) {
            if ( error ) callback(error);

            var criterion = { blip: { $in: result.map(function (blip) { return blip._id; }) } }
            var actions = { $set: { blacklisted: blacklisted } }
            var options = { safe: true, multi: true }

            mongo.receivedBlips.update(criterion, actions, options, callback);
          });
        }
      )
    }
  });

  var finalCallback = function finalCallback ( error, result ) {
    callback(error, result);
  }

  async.parallel(workers, finalCallback);
}

/**
 * @desc Remove blacklisted content
 * @property {function}
 */
var cleanup = exports.cleanup = function cleanup ( callback ) {
  var finalCallback = function finalCallback ( error, result ) {
    if ( typeof callback == 'function' ) {
      callback(error, result);
    }
  }

  async.parallel(
    [
      function removeChannelRanks ( callback ) {
        var criterion = { blacklisted: true }
        var options = { safe: true, multi: true }
        mongo.channelRanks.remove(criterion, options, callback);
      },
      function removeBlips ( callback ) {
        var criterion = { $or: [
          { blacklisted: true },
          { 'author.blacklisted': true },
          { 'place.blacklisted': true }
        ]}
        var options = { safe: true, multi: true }
        mongo.blips.remove(criterion, options, callback);
      },

      function removeReceived ( callback ) {
        var criterion = { blacklisted: true }
        var options = { safe: true, multi: true }
        mongo.receivedBlips.remove(criterion, options, callback);
      }
    ],
    finalCallback
  );
}
