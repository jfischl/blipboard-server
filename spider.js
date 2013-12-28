var assert = require('assert');
var async = require('async');
var limitfn = require('function-rate-limit');
var winston = require('winston');
var moment = require('moment');
var sprintf = require('sprintf').sprintf;

var assertClass = require('./lib/javascript').assertClass;
var Tile = require('./lib/tile').Tile;
var blipRefreshService = require('./managers/blipRefreshService');
var categories = require('./data/categories');
var config = require('./config');
var facebook = require('./lib/facebook');
var js = require('./lib/javascript');
var mongo = require('./lib/mongo');
var placeManager = require('./managers/placeManager');


var DelayAfterFinished = moment.duration(10, 'minutes');
var createTileInfos = function createTileInfos(name, callback) 
{
  var bounds = config.REGIONS[name],
  tiles = Tile.fromContainedBounds(bounds.southwest.latitude, 
                                   bounds.southwest.longitude, 
                                   bounds.northeast.latitude, 
                                   bounds.northeast.longitude,
                                   config.MONGO.zoomLevel.cityBlock),
  tileInfos = tiles.map(function(tile) { 
    return { tileIndex: tile.toIndex(), 
             lastFacebookPlaceUpdateTime:moment(0).toDate() }; 
  });

  mongo.tileInfos.insert(tileInfos, {upsert: true}, function(error, inserted) { 
    if (inserted) {
      winston.info("Created " + inserted.length + " tiles at zoom level " + config.MONGO.zoomLevel.cityBlock);
    }
    callback();
  });
};


var spiderRegionForPlaces = function spiderRegionForPlaces(name) 
{
  var tiles = [], started=new moment();
  
  var refreshTile = function refreshTile(tileIndex, callback) { 
    assertClass(tileIndex, String);
    placeManager.refreshTile(tileIndex, function(error) {
      // !jf! ignore any errors for now. may want to pause here. 
      callback();
    });
  };
  
  var limitedRefreshTile = limitfn(10, 1000,  refreshTile);
  
  var cargo = async.cargo(function (tileIndexes, callback) {
    winston.debug(sprintf("spider: refresh [remaining: %d total: %d started %s] tiles: %s", cargo.length(), tiles.length, started.fromNow(), js.ppc(tileIndexes)));
    async.each(tileIndexes, refreshTile, callback);
  }, 5);
  
  var loadTiles = function loadTiles() {
    started = new moment();

    var bounds = config.REGIONS[name], query;
    tiles = Tile.fromContainedBounds(bounds.southwest.latitude, 
                                     bounds.southwest.longitude, 
                                     bounds.northeast.latitude, 
                                     bounds.northeast.longitude,
                                     config.MONGO.zoomLevel.cityBlock);
    tiles = tiles.map(function(tile) { return tile.toIndex(); });
    var latest = moment().subtract('hours', 1).toDate();
    query = mongo.tileInfos.find({ tileIndex: Tile.simplifyTileCodesAsRegExp(tiles),
                                   lastFacebookPlaceUpdateTime: {$lte: moment().subtract('hours', 1).toDate()}});
    query.sort({lastFacebookPlaceUpdateTime: 1});
    query.toArray(function(error, tileInfos) { 
      if (error) { 
        winston.info("spider: error retrieving TileInfos " + js.pp(error));
        tiles = [];
      }
      else if (tileInfos.length) {
        winston.info("spider: queueing up " + tileInfos.length + " tiles");
        tiles = tileInfos.map(function(tileInfo) { return tileInfo.tileIndex; });
        cargo.push(tiles, function(error) { 
          if (error) { 
            winston.info("spider: failed to process a tile " + js.pp(error));
          }
        });
      }
      else { 
        assert(cargo.length() === 0);
        assert(tileInfos.length === 0);
        winston.info("spider: delay tile refresh for " + DelayAfterFinished.humanize());
        setTimeout(loadTiles, DelayAfterFinished.asMilliseconds());
      }
    });
  };
  
  cargo.drain = loadTiles;
  loadTiles(); // first time
};

var spiderFacebookPosts = function spiderFacebookPosts(name) 
{
  var started=new moment();
  var cargo = async.cargo(function (channels, callback) {
    assert(channels.length === 1);
    var channel = channels[0];
    blipRefreshService.loadBlips(channel._id, function(error, posts) {
      var count = posts ? posts : 0;
      winston.debug(sprintf("spider: load-blips %s (%s) (%d) [remaining: %d started: %s]", channel.name, channel._id, count, cargo.length(), started.fromNow()));
      // !jf! ignore any errors for now. may want to pause here. 
      callback();
    });
  }, 1);
  
  var loadChannels = function loadChannels() {
    started = new moment();
    var bounds = config.REGIONS[name], query;

    tiles = Tile.fromContainedBounds(bounds.southwest.latitude, 
                                     bounds.southwest.longitude, 
                                     bounds.northeast.latitude, 
                                     bounds.northeast.longitude,
                                     config.MONGO.tileZoomLevel);
    tiles = tiles.map(function(tile) { return tile.toIndex(); });

    var criterion = { type: config.MONGO.channelType.place,
                      blacklisted: {$ne: true},
                      ignore: {$ne: true}, 
                      'location.tileIndex': Tile.simplifyTileCodesAsRegExp(tiles),
                      $or: [{'facebook.lastRefresh': {$lte: moment().subtract('hours', 1).toDate()}},
                            {'facebook.lastRefresh': {$exists: false}},
                            {'facebook.lastRefresh': 0}] };
    query = mongo.channels.find(criterion, {_id: 1, name: 1}).sort({'facebook.lastRefresh': 1});
    query.toArray(function(error, channels) { 
      winston.info("spider: updating " + channels.length + " place channels");
      if (channels.length && !error) { 
        channels.forEach(function(channel) { 
          cargo.push(channel);
        });
      }
      else {
        winston.info("spider: delay refresh facebook posts for " + DelayAfterFinished.humanize());
        setTimeout(loadChannels, DelayAfterFinished.asMilliseconds());
      }
    });
  };
  
  cargo.drain = loadChannels;
  loadChannels(); // first time
};

var updateChannelLastRefresh = function updateChannelLastRefresh(callback) 
{
  mongo.channels.update({type: config.MONGO.channelType.place, 'facebook.lastRefresh': {$exists: false}},
                        {$set: { 'facebook.lastRefresh': 0}},
                        {upsert: false, multi:true},
                        callback);
};


async.series( { mongo: mongo.initialize, 
                topics: categories.loadTopicIds,
                facebook: facebook.loadDeveloperAccessToken,
                ensureTiles: createTileInfos.curry("San Francisco"),
                ensureLastRefresh: updateChannelLastRefresh
              },
              function(error) { 
                blipRefreshService.initialize();
                winston.info("spider initialized");
                if (error) { 
                  winston.info("spider: initialization error: " + js.pp(error));
                }
                else {
                  //spiderRegionForPlaces("San Francisco");       
                  spiderFacebookPosts("San Francisco");
                }
              });
