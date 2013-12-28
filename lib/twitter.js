/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview Twitter related functionality
 * @author vladimir@blipboard.com
 *
 * @created Tue, Oct 30 2012 - 16:38:41 -0700
 * @updated Tue, Oct 30 2012 - 16:38:41 -0700
 */

var URL = require('url');
var HTTP = require('http');
var async = require('async');
var winston = require('winston');

var config = require('../config');
var js = require('./javascript');
var mongo = require('./mongo');
var userManager = require('../managers/userManager');
var blipManager = require('../managers/blipManager');


var twit = exports.connection = new require('ntwitter')(config.TWITTER.credentials);
var MIN_WAIT = 1000, MAX_WAIT = 60000, wait = MIN_WAIT;

var DT = 0, RT = 1, MT = 2;

var isRT = exports.isRT = function isRT ( tweet ) {
  return tweet && tweet.text && tweet.text.match(/^RT\s+@/i);
};

var isMT = exports.isMT = function isMT ( tweet ) {
  return tweet && tweet.text && tweet.text.match(/^MT\s+@/i);
};

var isDT = exports.isDT = function isDT ( tweet ) {
  return !isRT(tweet) && !isMT(tweet);
};

var getType = exports.getType = function getType ( tweet ) {
  return isRT(tweet) ? 1 : isMT(tweet) ? 2 : 0;
};

var getAuthor = exports.getAuthor = function getAuthor ( tweet, callback ) {
  var type = getType(tweet);
  var author = type ? tweet.entities.user_mentions[0].id : tweet.user.id;

  winston.info("twitter.getAuthor: " + author);
  twit.showUser(String(author), function onGotUser ( error, users ) {
    if ( error ) {
      return callback('cannot retrieve " + author + " user account from twitter ' + error);
    }
    
    var user = users[0], criterion = {
      $or: [
        {
          type: config.MONGO.channelType.user,
          'twitter.handle': '@' + user.screen_name.toLowerCase()
        },
        {
          type: config.MONGO.channelType.place,
          'factual.namespace': 'twitter',
          'factual.namespace_id': '@' + user.screen_name.toLowerCase()
        }
      ]
    }

    mongo.channels.find(criterion).toArray(function onFound ( error, users ) {
      if ( error ) return callback(error);

      switch ( users ? users.length : 0 ) {
        case 0: userManager.createTwitterUser(user, callback); break;
        case 1: callback(null, users[0]); break;
        default: callback('twitter id is assigned to multiple channels');
      }
    });
  });
};

var getPlace = exports.getPlace = function getPlace ( tweet, callback ) {
  var type = getType(tweet), queue = [ ];

  for ( var i = tweet.entities.urls.length - 1; i >= 0; i-- ) {
    queue.push({ url: tweet.entities.urls[i].expanded_url, index: i });
  }

  for ( var i = tweet.entities.user_mentions.length - 1; i >= (type ? 1 : 0); i-- ) {
    queue.push({ user: tweet.entities.user_mentions[i].screen_name, index: i });
  }

  var match = function match ( place, done ) {
    if ( place.url ) {
      winston.debug("place = " + js.pp(place.url));

      resolveURL(place.url, function onResolved ( error, url ) {
        if ( error ) {
          return done(false);
        }
        
        var criterion = {
          type: config.MONGO.channelType.place,
          'factual.url': url
        }
        
        winston.info("twitter.getPlace(URL): find " + js.pp(criterion));
        
        mongo.channels.find(criterion).toArray(function onFound ( error, places ) {
          if ( error ) return done(false);
          winston.info("twitter.getPlace(URL): matched " + places.length + " places");
          switch ( places ? places.length : 0 ) {
          case 0: done(false); break;
          case 1: { done(true); callback(null, places[0], place); } break;
          default: done(false);
          }
        });
      });
    }
    else if ( place.user ) {
      winston.debug("lookup user = " + js.pp(place.user));
      twit.showUser(String(place.user), function onGotUser ( error, users ) {
        winston.debug("showUser = " + js.pp(users));
        if ( error ) {
          return done(false);
        }

        var user = users[0];
        var criterion = {
          type: config.MONGO.channelType.place,
          'factual.namespace': 'twitter',
          'factual.namespace_id': '@' + user.screen_name.toLowerCase()
        }

        winston.info("twitter.getPlace(user): findPlace " + js.pp(criterion));
        
        mongo.channels.find(criterion).toArray(function onFound ( user, places ) {
          winston.info("twitter.getPlace(user): matched " + places.length + " places");
          if ( error ) return done(false);

          switch ( places ? places.length : 0 ) {
          case 0: done(false); break;
          case 1: { done(true); callback(null, places[0], place); } break;
          default: done(false);
          }
        });
      });
    }
    else {
      done(false);
    }
  }

  winston.info("twitter.getPlace: " + js.ppc(queue));
  async.detectSeries(queue, match, function onDetected ( result ) {
    winston.debug("twitter.detect " + result);
    if ( !result ) {
      callback('no place was found');
    }
  });
}

var resolveURL = exports.resolveURL = function resolveURL ( url, callback ) {
  var parsedURL = URL.parse(url);

  var request = { method: 'HEAD', hostname: parsedURL.host, path: parsedURL.path }

  HTTP.request(request, function onResponse ( response ) {
    if ( !response.headers.location ) return callback(null, url);

    resolveURL(response.headers.location, callback);
  }).end();
}

var getMessage = exports.getMessage = function getMessage ( tweet, callback ) {
  var type = getType(tweet);

  if ( type ) {
    var regex = new RegExp("^(?:R|M)T:?\\s*@\\w+:?\\s*(.*)(?:@" + config.TWITTER.track + ".*)?$", "i");
    var match = tweet.text.match(regex);

    if ( !match ) callback('could not parse the message');
    else callback(null, match[1]);
  }
  else {
    callback(null, tweet.text);
  }
}

var broadcast = exports.broadcast = function broadcast ( tweet, callback ) {
  var author, place, message, category, created, id;
  winston.info("twitter.broadcast: " + js.pp(tweet));
  var workers = [
    function parseAuthor ( callback ) { getAuthor(tweet, function ( error, result ) { callback(error, author = result); }); },
    function parsePlace ( callback ) { getPlace(tweet, function ( error, result ) { callback(error, place = result); }); },
    function parseMessage ( callback ) { getMessage(tweet, function ( error, result ) { callback(error, message = result); }); },
    function parseTheRest ( callback ) {
      id = tweet.id;
      if (tweet.created_at) { 
        created = new Date(tweet.created_at);
      }

      callback();
    }
  ];

  mongo.tweets.findAndModify({ id: id }, { id: 1 }, { $set: tweet }, { 'new': true, upsert: true }, function onSaved ( ) {
    async.parallel(workers, function done ( error ) {
      if (error) { 
        winston.info("twitter.broadcast error: " + error);
      }
      else {
        blipManager.broadcastTweet(author, place, id, message, category, created, function onBroadcast ( error, result ) {
          if ( !error ) {
            tweet.blip = result instanceof Array ? result[0] : result;
            
            if ( tweet.blip ) {
              tweet.blip = tweet.blip._id;
            }
            
            mongo.tweets.findAndModify({ id: id }, { id: 1 }, { $set: tweet }, { }, function ( ) { });
          }
        });
      }
      
      callback(error, { author: author, place: place, id: id, message: message, category: category, created: created });
    });
  });
}
