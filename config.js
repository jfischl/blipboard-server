/**
 * Copyright (c) 2012 Blipboard. All rights reserved.  
 * 
 * @fileoverview Global configuration file 
 * 
 * @created Wed, Feb 22 2012 - 17:48:53 -0800 
 * @updated Wed, Feb 22 2012 - 18:17:15 -0800 
 */ 

var winston = require('winston');
var wloggly = require('winston-loggly');
var URI = require('URIjs');

var js = require('./lib/javascript');
var Bounds = require('./lib/bounds').Bounds;

function safeParse(x) {
  try {
    return JSON.parse(x);
  }
  catch (e) {
    return ;
  }
}

/** Web Server Configuration */
exports.SERVER = {
  url: process.env.BLIPBOARD_URL ? URI(process.env.BLIPBOARD_URL) : URI("http://localhost:3000"),
  port: process.env.PORT || "3000",

  web: process.env.BLIPBOARD_WEB_URL ? URI(process.env.BLIPBOARD_WEB_URL) : null
};

/** Paging Configuration */
exports.PAGING = {
  limit: 50,
  maxLimit: 1000
};

exports.CAPABILITIES = { 
  disableSharingBelowClientBuildNumber: 1225,
  //disableSharing: process.env.BLIPBOARD_DISABLE_SHARING ? true : false,
  disableStartupNotifications: process.env.BLIPBOARD_DISABLE_STARTUP_NOTIFICATIONS ? true : false
};

winston.info("capabilities: " + js.ppc(exports.CAPABILITIES));

exports.REGION = { 
  maxRegionSpan: safeParse(process.env.BLIPBOARD_MAX_REGION_SPAN) || 10000  // specified in meters
};

exports.SPECIAL_EVENTS = { 
  // used to trigger special behavior in the specified bounding box sw.lat,sw.lon|ne.lat,ne.lon
  region: new Bounds(process.env.BLIPBOARD_SPECIALEVENT_BOUNDS),
  maxNotifications: safeParse(process.env.BLIPBOARD_SPECIALEVENT_MAX_NOTIFICATIONS) || 5,
  timeInterval: safeParse(process.env.BLIPBOARD_SPECIALEVENT_INTERVAL) || 15
};

exports.POPULAR = {
  limit: 25,
  timePeriod: safeParse(process.env.BLIPBOARD_POPULARITY_TIME_PERIOD) || 60*60*24*1000, // in ms
  likeMultiplier: safeParse(process.env.BLIPBOARD_POPULARITY_LIKE_MULTIPLIER) || 1,
  peopleBlipBoost: safeParse(process.env.BLIPBOARD_POPULARITY_PERSON_ADJUSTMENT) || 90, // in days
  effectiveBlipBoost: safeParse(process.env.BLIPBOARD_POPULARITY_EFFECTIVE_ADJUSTMENT) || 90 // in days
};

exports.EXPIRY = {
  user: 365 * 24 * 60 * 60 * 1000,
  place: 2 * 7 * 24 * 60 * 60 * 1000
};

exports.HIGHLIGHT = { period: 3 /* period in days */ }

exports.TUNE_IN_DISTRIBUTION = {
    placeBlipLimit:1,
    userBlipLimit:500
};

/** Debug Behavior */
exports.DEBUG = {
  logErrorStack: safeParse(process.env.BLIPBOARD_ERROR_LOG_STACK) || false,
  returnInternalErrors: safeParse(process.env.BLIPBOARD_API_RESPONSE_RETURN_INTERNAL_ERRORS) || false,
  logUserErrors: safeParse(process.env.BLIPBOARD_LOG_USER_ERRORS) || false
};

exports.TWITTER = {
  credentials: {
    consumer_key: process.env.TWITTER_CONSUMER_KEY,
    consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
    access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
    access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET
  },
  track: process.env.TWITTER_TRACK,
  follow: process.env.TWITTER_FOLLOW
};

/** Facebook Configuration */
exports.FACEBOOK = {
  developer: {
    id: process.env.FACEBOOK_BLIPBOARD_ID,
    secret: process.env.FACEBOOK_BLIPBOARD_SECRET
  },
  placeQueryLimit: 50,
  placeQueryRadius: 1000,
  placeRefreshPostsInterval: 4, // how often to poll facebook posts in hours
  placeRefreshPostsIntervalForEmptyTiles: 7*24 // how often to poll when no places in tile
};

exports.URBANAIRSHIP = {
  // if this env variable is set, do not send push notifications to UA
  no_pushnot: process.env.URBANAIRSHIP_DISABLE || false,

  // prefix alias with this to avoid collisions between staging and production
  namespace: process.env.URBANAIRSHIP_NAMESPACE || "",

  api_key: process.env.URBANAIRSHIP_API_KEY 
  master_key: process.env.URBANAIRSHIP_MASTER_KEY,
  secret_key: process.env.URBANAIRSHIP_SECRET_KEY,
  concurrency: 1000
};

exports.FACTUAL = {
  key: process.env.FACTUAL_KEY,
  token: process.env.FACTUAL_TOKEN
};

exports.GOOGLE = { 
  api_key: process.env.GOOGLE_API_KEY
};

exports.HOSTEDGRAPHITE = { 
  api_key: process.env.HOSTEDGRAPHITE_APIKEY
};

exports.INTERCOM = { 
  app_id: process.env.INTERCOM_APPID,
  app_key: process.env.INTERCOM_KEY
};

// see for how to access S3
// https://github.com/superjoe30/node-s3-client
// https://github.com/learnboost/knox or 

exports.S3 = {
  key: process.env.AWS_S3_KEY,
  secret: process.env.AWS_S3_SECRET,
  imageBucket: "images.blipboard.com",
  imagesBaseUrl: "http://s3.amazonaws.com/images.blipboard.com/"
};


/** MongoDB Configuration */
exports.MONGO = {
  blipboardURL: process.env.MONGO_URL, 

  collections: [
    { 
      name: 'channels',
      mongoName: 'Channel', 
      indexes: [ 
        [{ 'location.tileIndex': 1}],  // by tileIndex
        [{ 'type': 1},{'stats.score':-1}],
        [{ 'facebook.id': 1 },{ unique:1, dropDups:1,sparse:true }], // facebook ids are unique
        [{ 'factual.id': 1}, {unique:1, dropDups:1,sparse:true}], // factual ids are unique
        [{ 'facebook.accessToken': 1 },{ unique:1, dropDups:1,sparse:true }], // facebook access_tokens are unique
        [{ 'facebook.lastRefresh': 1 }],
        [{ 'factual.url': 1}],
        [{ 'factual.namespace':1,  'factual.namespace_id':1}]
      ]
    },
    {
      name: 'blips',
      mongoName: 'Blip',
      indexes: [ 
        [ { 'author._id':1,createdTime:-1} ], // ordered broadcast history, recent first
        [ { 'place.location.tileIndex':1, popularity:-1 } ], // popular blips by topic by tile
        [ { expiryTime:1 } ], // ordered in terms by earliest expiration date
        [ {'facebook.postid':1}, {unique:1,sparse:true,dropDups:1} ],
        [ { 'place._id': 1} ] // for updating the listenersCount
        //[ { 'message': 'text', 'author.name': 'text', 'place.name': 'text', 'comment.text': 'text' } ]
      ]
    },
    {
      name: 'channelListensTos',
      mongoName: 'ChannelListensTo',
      indexes: [ 
        [{ channel:1, listensTo:1 }, { unique:1, dropDups:1 }] // main index
      ]
    },
    {
      name: 'channelListeners',
      mongoName: 'ChannelListener',
      indexes: [
        [{ channel:1, listener:1 }, { unique:1, dropDups:1 }]
      ]
    },
    {
      name: 'tileInfos',
      mongoName: 'TileInfo',
      indexes: [
        [ { tileIndex:1 }, { unique:1, dropDups:1} ],
        [ { lastFacebookPlaceUpdateTime: 1} ]
      ]
    },
    {
      name: 'receivedBlips',
      mongoName: 'ReceivedBlip',
      indexes: [
        [ { user:1, tileIndex:1, authorType:1, topicIds:1, isRead:1, createdTime:-1 } ],
        [ { blip:1, user:1 }, { unique:1, dropDups:1 } ],
        [ { user:1, author:1 } ],
        [ { user:1, placeId:1 } ]
      ]
    },
    {
      name: 'reportedLocationHistory',
      mongoName: 'ReportedLocationHistory',
      indexes: []
    },
    {
      name: 'notifications',
      mongoName: 'Notification',
      indexes: [ 
        [ {user:1, _id:-1} ] 
      ]
    },
    {
      name: 'tweets',
      mongoName: 'Tweet',
      indexes: [
        [ { id: 1 } ],
        [ { 'user.id': 1 } ]
      ]
    },
    {
      name: 'topics',
      mongoName: 'Topic',
      indexes: [ 
        [ {identifier: 1} ]
      ]
    }
  ],
  
  channelType: {
    user: 'user',
    place: 'place',
    topic: 'topic'
  },

  regionType: {
    city: 'city',
    tile: 'tc',
    global: 'global'
  },

  notificationType: { 
    comment: 'comment',
    like: 'like',
    tunein: 'tunein',     // deprecated
    blip: 'blip',
    channel: 'channel',
    topusers: 'top-users',
    web: 'web',
    createblip: 'create-blip',
    noaction: 'no-action',
    profile: 'profile-editor'
  }, 

  zoomLevel: {
    'city':12, // ~10km x 10km
    'neighborhood':15, // ~1km x 1km
    'nearby':16, // ~600m x 600m
    'fewBlocks':17, // ~300m x 300m
    'cityBlock':18, // ~150m x 150m
    'global':0 // the whole earth
  },
  
  tileZoomLevel: 16,

  writeConcurrency: 50, // max number of concurrent operations
  readConcurrency: 50   // 
};

if (!exports.MONGO.blipboardURL) {
  console.log("Environment variable MONGO_URL not set.");
  process.exit(-1);
}

exports.BLACKLIST = require('./data/blacklist.json');

for ( var path in exports.BLACKLIST.place ) {
  var values = { }
  var regex = [ ];

  for ( var i in exports.BLACKLIST.place[path] ) {
    var value = exports.BLACKLIST.place[path][i];

    if ( typeof value == 'string' ) {
      var match = value.match(/^\/(.*)\/((i?g?)|(g?i?))$/);

      if ( match ) regex.push(new RegExp(match[1], match[2]));
      else values['' + value] = value;
    }
  }

  exports.BLACKLIST.place[path] = { regex: regex, values: values }
}

exports.REGIONS = require('./data/regions.json');

////////////////////////////////////////
// Console Logging Configuration 
////////////////////////////////////////
winston.remove(winston.transports.Console);
winston.add(winston.transports.Console, 
            { colorize: false, 
              timestamp: true, 
              filename: "bb.log",
              json: false,
              //handleExceptions:true
            });

////////////////////////////////////////
// Loggly Logging Options 
////////////////////////////////////////
var logglyOptions = { 
  subdomain: process.env.LOGGLY_SUBDOMAIN, // set to blipboard to use loggly
  inputToken: process.env.LOGGLY_TOKEN
};

if (logglyOptions.subdomain && logglyOptions.inputToken) { 
  winston.add(winston.transports.Loggly, logglyOptions);
  winston.info("using loggly");
}

