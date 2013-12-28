/**
 * @fileoverview Place manager
 * @author aneil@blipboard.com
 */
var assert = require('assert');
var async = require('async');
var sprintf = require('sprintf').sprintf;
var winston = require('winston');

var assertClass = require('../lib/javascript').assertClass;
var BBError = require('../lib/error').BBError;
var ObjectID = require('../lib/mongo').ObjectID;
var Tile = require('../lib/tile').Tile;
var TileStatusEnum = require('./tileManager').Enum;
var categories = require('../data/categories');
var channelEvents = require('./channelEvents');
var channelManager = require('./channelManager');
var config = require('../config');
var events = require('../lib/events');
var facebook = require('../lib/facebook');
var graphite = require('../lib/graphite');
var js = require('../lib/javascript');
var mongo = require('../lib/mongo');
var tileManager = require('./tileManager');
var topicManager = require('./topicManager');
var v = require('./validate');

require('../lib/functional'); // for curry

function isFacebookPlaceDataRefreshing(refreshTime) { 
  if (refreshTime) {
    var now = new Date();
    var elapsedSinceRefresh = now - refreshTime;
    return elapsedSinceRefresh < 120 * 1000; 
  }
  else { // there's no last query time - therefore, assume stale
    return false;
  }
}

// return true if the lastUpdateTime is > 1 hour ago.
function isFacebookPlaceDataStale(lastUpdateTime) {
  if (lastUpdateTime) {
    var now = new Date();
    var elapsedSinceUpdate = now - lastUpdateTime;
    
    return elapsedSinceUpdate > config.FACEBOOK.placeRefreshPostsInterval*3600*1000;  // in ms
  }
  else { // there's no last query time - therefore, assume stale
    return true;
  }
}

// * @param {function(status)} callback - status is a TileStatusEnum
function tileRequiresUpdate(tileIndex, callback) { 
  tileManager.getLastFacebookUpdateTime(tileIndex, function (error, tileIndex, lastUpdateTime, refreshTime) { 
    //winston.debug("placeManager.tileRequiresUpdate " + tileIndex + " lastUpdateTime=" + lastUpdateTime + " refreshTime=" + refreshTime);
    
    // lastUpdateTime == 0 means tile never updated
    if (error || lastUpdateTime === 0) { 
      // !jcf! what should we really do with errors
      callback(TileStatusEnum.NODATA); 
    }
    else if (isFacebookPlaceDataRefreshing(refreshTime)) { // tile is refreshing
      callback(TileStatusEnum.STALE);
    }
    else if (isFacebookPlaceDataStale(lastUpdateTime)) { // tile is stale and not refreshing (or stale refresh)
      callback(TileStatusEnum.STALE);
    }
    else { // fresh
      callback(TileStatusEnum.FRESH);
    }
  });
}

// look at all of the tiles in tileIndexes and update the facebook place data for all stale (but not refreshing tiles)
// * @param {function(error,tiles)} callback - returns array of tiles requiring facebook update 
function updateStaleOrMissingTiles(location, callback) { 
  function isStaleOrMissing(tileIndex, callback) { 
    tileRequiresUpdate(tileIndex, function (tileStatus) { 
      callback(tileStatus === TileStatusEnum.STALE || tileStatus === TileStatusEnum.NODATA);
    });    
  }

  //winston.debug("placeManager.updateStaleOrMissingTiles" + JSON.stringify(location.tileIndexes));
  assert.ok (location.tileIndexes);
  async.filter(location.tileIndexes, isStaleOrMissing, function (results) {
    winston.debug("placeManager.updateStaleOrMissingTiles: updating " + results.length + " tiles");
    refreshTiles(results, callback);
  });
}

// request a facebook update for each tile specified. 
function refreshTiles(tileIndexes, callback) { 
  winston.debug("placeManager.refreshTiles: " + JSON.stringify(tileIndexes));
  async.concat(tileIndexes, refreshTile, callback);
}

/**
 * queries facebook for places, and returns a list of blipboard place channel documents
 * @param {object} location decorated with tileIndex
 * @param {function(error,bbPlaces)} callback
 */
function refreshTile(tileIndex, callback)
{
  assertClass(tileIndex, String);
  var tile = new Tile(tileIndex), center = tile.center();
  tileManager.refreshingFacebook(tile.toIndex());

  function toBlipboardPlace(fb) {
    if (fb.name !== undefined && fb.location !== undefined && fb.page_id !== undefined) {
      assert.ok(tileIndex);
      var tile = mongo.tile(fb.location.latitude, fb.location.longitude);
      var result = { name: fb.name,
                     description: fb.description, 
                     type: config.MONGO.channelType.place,
                     picture:  "http://graph.facebook.com/" + fb.page_id + "/picture",
                     website: fb.website,
                     phone: fb.phone,
                     facebook:  {   id:    fb.page_id.toString(),
                                    categories: fb.categories,
                                    likes: fb.likes || 0,
                                    checkins: fb.checkins || 0,
                                    talking_about_count: fb.talking_about_count || 0
                                },
                     location: {  tileIndex: tile.toIndex(),
                                  latitude:  fb.location.latitude,
                                  longitude: fb.location.longitude,
                                  street:    fb.location.street,
                                  city:      fb.location.city,
                                  state:     fb.location.state,
                                  zip:       fb.location.zip,
                                  country:   fb.location.country
                               }
                   };

      var match = categories.matchPlaceCategory(result);
      //winston.debug("match: " + match.category + " : " + match.topic + " : " + match.topicId);
      result.category = match.category;
      result.defaultTopicId = match.topicId;
      result.blacklisted = categories.isBlacklisted(result);

      return result;
    }
    else {
      return undefined;
    }
  }
  
  function doFacebookQuery(tileIndex, callback) { 
    var selector = { 'type': config.MONGO.channelType.place, 'location.tileIndex': tileIndex },
    options = { fields: [ 'facebook.id' ] };

    facebook.getPlaces(center[0], center[1], tile.enclosingRadius(), function(err, fbPlaces){ 
      if (err) { 
        callback(err); 
      }
      else {
        var fbPlacesInTile = fbPlaces.filter(function (place) { 
          if (!place.location) { 
            winston.debug("placeManager.updateTiles: bad place: " + js.pp(place));
            return false;
          }
          return tile.containsLatLon(place.location.latitude, place.location.longitude);
        });
        var bbPlaces = fbPlacesInTile.map(function(fbPlace) { return toBlipboardPlace(fbPlace); });
        winston.log('info',sprintf("facebook query at %s (r=%fm) found %d places (filtered %d)", 
                                   JSON.stringify(center), 
                                   tile.enclosingRadius(), 
                                   bbPlaces.length,
                                   (fbPlaces.length - fbPlacesInTile.length)
                                  ));
        
        //winston.debug("placeManager.refreshTile: fbPlacesInTile=" + js.pp(fbPlacesInTile));
        //winston.debug("placeManager.refreshTile: bbPlaces=" + js.pp(bbPlaces));
        updatePlaces(bbPlaces,function (error,savedPlaces) {
          // update the tile to indicate data is fresh but only after a
          // successful insert. This way if the insert fails, it will try
          // again the next time the data is requested.
          // !jcf! note: error can be set and still have results. this indicates a partial success
          if (!error) {
            // if there are no places at the tile, defer the update for 7 days. 
            if (savedPlaces.length) {
              winston.debug("placeManager.refreshTile: " + tileIndex + " last facebook update at " + Date.now());
              tileManager.updateLastFacebookUpdateTime(tileIndex);
            }
            else {
              winston.debug("placeManager.refreshTile: " + tileIndex + " empty defer updates");
              tileManager.updateLastFacebookUpdateTime(tileIndex, 
                                                       config.FACEBOOK.placeRefreshPostsIntervalForEmptyTiles*3600);
            }
            
            // !jcf! note this is quite expensive polling of the blip content for every channel. 
            // async.forEachLimit(savedPlaces, 10, function (item) { 
            //   //winston.info("placeManager.refreshTile: refresh of blips on " + item._id);
            //   channelEvents.refreshChannelBlips(item._id);
            // });
          }
          else {
            winston.debug("placeManager.refreshTile: error: " + js.pp(error));
          }
          callback(error,savedPlaces);
        });
      }
    });
  }

  //winston.debug("placeManager.refreshTile: " + tileIndex + " doing facebook query");
  doFacebookQuery(tileIndex, callback);
}

function updatePlaces(bbPlaces,callback) {
  var fbIdsToBBPlaces = {};
  var fbIds = [];
  bbPlaces.forEach(function(item) {
    fbIdsToBBPlaces[item.facebook.id] = item;
    fbIds.push(item.facebook.id);
  });
  
  function process (error,existingPlaces) {
    //winston.debug("placeManager.updatePlaces: process: " + js.pp(existingPlaces));
    if (error) {
      return callback(error);
    }
    
    existingPlaces.forEach(function(place) {
      var ignore = function ignore ( ) { }

      assert(place.facebook.id);
      var updated = fbIdsToBBPlaces[place.facebook.id];
      winston.debug("placeManager.updatePlaces: updated: " + js.ppch(updated));
      mongo.channels.update({_id:place._id},
                            { 
                              $set: { 'blacklisted': updated.blacklisted,
                                      'name': updated.name,
                                      'description': updated.description,
                                      'picture': updated.picture,
                                      'website': updated.website,
                                      'phone': updated.phone,
                                      'category': updated.category,
                                      'facebook.id': updated.facebook.id,
                                      'facebook.categories': updated.facebook.categories,
                                      'facebook.likes': updated.facebook.likes,
                                      'facebook.checkins': updated.facebook.checkins,
                                      'facebook.talking_about_count': updated.facebook.talking_about_count,
                                      'location': updated.location }
                            }, ignore); // !jcf! can safely ignore if this fails? what would we do anyways.
    });
    
    var existingFBIds = existingPlaces.map(function(place) { return place.facebook.id; });
    var newPlaces = bbPlaces.filter(function (place) { 
      return (existingFBIds.indexOf(place.facebook.id) === -1); 
    });

    newPlaces = newPlaces.map(function (place) { 
      assert(place.facebook);
      place.facebook.lastRefresh = 0; 
      return place; 
    });

    winston.debug("placeManager.updatePlaces : inserted: " + js.ppch(newPlaces));
    
    // avoid the insert if nothing to do as this results in a mongo error
    if (newPlaces.length) { 
      mongo.channels.insert(newPlaces, {safe:true}, function newPlacesInserted(error,newCreatedPlaces) {
        if (error) {
          // !jcf! note: we used to return existingPlaces on error but should no longer be needed
          winston.info("placeManager.updatePlaces. error inserting new places " + js.pp(error));
          return callback(error);
        }
        graphite.set("channels.insert.place.facebook", newCreatedPlaces.length);
        //winston.info("placeManager.updatePlaces: inserted " + js.pp(newCreatedPlaces));

        callback(null,existingPlaces.concat(newPlaces));
      });
    }
    else {
      callback(null,existingPlaces); // no new ones
    }
    winston.info(sprintf("placeManager.updatePlaces: facebook search resulted in existing(%d) inserted(%d) places", 
                         existingPlaces.length,
                         newPlaces.length));

  }
  
  mongo.channels.find({"facebook.id":{$in:fbIds}}).toArray(process);
}

var retrievePlaces = function retrievePlaces ( listenerId, location, prefix, page, callback ) {
  assert(page);
  var selector = { 
    type: config.MONGO.channelType.place, 
    blacklisted: {$ne: true}, 
    ignore: {$ne: true}
  };

  if (!prefix) { 
    selector['location.tileIndex'] = Tile.simplifyTileCodesAsRegExp(location.tileIndexes);
  }
  
  if (prefix) { 
    selector.name = new RegExp(prefix, 'i');
  }

  if (location.southwest && location.northeast) { 
    selector['location.latitude'] = {$gte: location.southwest.latitude,
                                     $lte: location.northeast.latitude};
    selector['location.longitude'] = {$gte: location.southwest.longitude,
                                      $lte: location.northeast.longitude};
  } 

  //winston.debug("placeManager.retrievePlaces: " + js.pp(selector));
  var decorated = channelManager.isListeningDecoratorCallback(listenerId, callback);
  decorated = topicManager.decorateChannelsWithTopics(decorated);
  page.retrieve(mongo.channels, selector, null, decorated);
};

/**
 * checks if the tile is FRESH and if it is runs fetchCurrentResults. if STALE, runs fetchCurrentResults, then
 * updatesStaleorMissingTiles, if NODATA, runs updateStaleOrMissingTiles, then fetchCurrentResults. If REFRESHING,
 * returns 503 with Retry-After 10 secs.  
 * 
 * Note that fetchCurrentResults should be a curried function with the appropriate arguments already bound.
 */
var updateTileIfNecessary = function updateTileIfNecessary(location, fetchCurrentResults, callback) { 
  tileRequiresUpdate(location.tileIndex, function(tileStatus) { 
      switch (tileStatus) { 
      case TileStatusEnum.FRESH:
        winston.debug("placeManager.updateTileIfNecessary(FRESH): data is FRESH in mongo " + location.tileIndex);
        fetchCurrentResults();
        updateStaleOrMissingTiles(location, function (error, results) { 
          winston.debug("placeManager.search(FRESH): reloaded tile(s) from facebook: found " + results.length + " places"); 
          channelEvents.tileChannelsUpdated(location);
        });
        break;

      case TileStatusEnum.NODATA:
        winston.debug("placeManager.updateTileIfNecessary(NODATA): update missing tile from facebook " + location.tileIndex);
        updateStaleOrMissingTiles(location, function (error, results) { 
          winston.debug("placeManager.updateTileIfNecessary(NODATA): loaded tile(s) from facebook: found " + results.length + " places"); 
          channelEvents.tileChannelsUpdated(location);
          fetchCurrentResults();
        });
        break;

      case TileStatusEnum.STALE:
        winston.debug("placeManager.updateTileIfNecessary(STALE): update stale tile from facebook " + location.tileIndex);
        fetchCurrentResults();
        updateStaleOrMissingTiles(location, function (error, results) { 
          winston.debug("placeManager.updateTileIfNecessary(STALE): reloaded tile(s) from facebook: found " + results.length + " places"); 
          channelEvents.tileChannelsUpdated(location);
        });
        break;

      case TileStatusEnum.REFRESHING:
        callback(BBError.placeDataRefreshing({headers: {'Retry-After': 10.0}}));
        break;
      }
    });
};

/**
 * @param {object} params { q:optional location:mandatory, type:place }
 */
var search = function search(listenerId, params, callback) {
  params.prefix = params.prefix || '';

  function onFailure(error) {
    callback(error);
  }

  function onSuccess(prepared) {
    //winston.debug("placeManager.search: validated: " + js.pp(prepared.location));
    retrievePlaces(listenerId, prepared.location, params.prefix, params.page, callback);
    //var fetchCurrentResults = retrievePlaces.curry(listenerId, prepared.location, params.prefix, params.page, callback);
    //updateTileIfNecessary(prepared.location, fetchCurrentResults, callback);
  }

  // Note that these two cases will both populate prepared.location but in the case of a bounding box being passed in
  // instead of a point, the location will also have a tileIndexes property that contains an array of tileIndexes. 
  if (params.bounds) {
    v.validate({ location : [params.bounds, v.isBounds, v.addBoundsTileIndexes] }, onFailure, onSuccess);
  }
  else {
    v.validate({ location : [params.location, v.isLocation, v.addLocationTileIndex] }, onFailure, onSuccess);
  }
};

var prepopulate = function prepopulate(location, callback) {
  winston.log('info', "placeManager.prepopulate " + JSON.stringify(location));
  v.validate( { location : [location, v.isLocation, v.addLocationTileIndex] }, 
                     function onFailure(error) {
                       winston.log ('info', "placeManager: prepopulate: failed to validate location");
                       if (callback) {
                         callback(error);
                       }
                     },
                     function onSuccess(prepared) { 
                       var tiles = Tile.fromCenterAndDistanceSpan(location.latitude,
                                                                  location.longitude, 
                                                                  800, 800,
                                                                  config.MONGO.tileZoomLevel);
                       prepared.location.tileIndexes = tiles.map(function (item) { 
                         return item.toIndex();
                       });

                       winston.debug("placeManager.prepopulate: tiles=" + js.ppc(prepared.location.tileIndexes));
                       updateStaleOrMissingTiles(prepared.location, function (error, results) { 
                         //winston.debug("placeManger.prepopulate: updated tiles: " + js.pp(results));
                         if (callback) {
                           callback(error, results);
                         }
                       });
                     });
};

var findPlaceByURLId = function findPlaceByURLId ( id, callback ) {
  var regex = new RegExp(id + '$');

  var criterion = {
    'factual.url': regex,
    'type': config.MONGO.channelType.place
  }

  var onFound = function onFound ( error, places ) {
    if ( error ) return callback(error);

    switch ( places ? places.length : 0 ) {
      case 0: callback('no places'); break;
      case 1: {
        for ( var i = 0; i < places[0].factual.length; i++ ) {
          var url = places[0].factual[i].url;

          if ( url && url.match(regex) ) return callback(null, url);
        }

        callback('something went wrong');
      } break;
      default: callback('more than one place');
    }
  }
  mongo.channels.find(criterion).toArray(onFound);
}

/**
 * @desc Upgrade criterion to filter unwanted blips
 * @property {object}
 * @return {object}
 */
var filterBlacklisted = function filterBlacklisted ( criterion ) {
  return { $and: [ criterion, { blacklisted: { $ne: true } } ] };
};

/** 
    @desc search channels for a partial match across these fields: 
    indexed: _id, crosswalk-url, crosswalk-namespace-id, facebook-id
    unindexed: name, website
*/
var find = function find( query, callback ) 
{ 
  function match(criterion, callback) {
    function onFound(error, places) { 
      if (error) { 
        callback(error);
      }
      else {
        //winston.debug("placeManager.find " + js.pp(criterion) + js.ppch(places));
        callback(null, places);
      }
    }
    
    mongo.channels.find(criterion).toArray(onFound);
  }

  var prefixRegex = new RegExp('^' + query, 'i');
  var substringRegex = new RegExp(query, 'i');
  
  var exactMatch = {'type': config.MONGO.channelType.place,
                    'blacklisted': { $ne: true },  
                    $or:[{'_id': query}, 
                         {'factual.namespace_id': query},
                         {'factual.url': query},
                         {'facebook.id': query}]};
  

  var partialMatch = {'type': config.MONGO.channelType.place,
                      'blacklisted': { $ne: true },  
                      $or:[{'factual.namespace_id': prefixRegex},
                           {'factual.url': prefixRegex},
                           {'facebook.id': prefixRegex}]};
  var partialNameOrWeb = {'type': config.MONGO.channelType.place, 
                          'blacklisted': { $ne: true },  
                          $or:[{'name': substringRegex},
                               {'website': substringRegex}]};

  async.concatSeries([exactMatch, partialMatch, partialNameOrWeb], match, function done(error, channels) { 
    if (!error) { 
      //winston.debug("placeManager.find " + js.pp(query) + " -> " + js.ppch(channels));
      callback(null, channels);
    }
    else {
      callback(null);
    }
  });
};

// this function will update the channel document by matching channel._id. 
// it replaces the entire, existing channel document with the passed in value. 
// the _id must exist or the function will callback with an error. 
var update = function update(channel, callback) 
{ 
  function onSuccess(prepared) { 
    mongo.channels.update({_id: prepared.channelId},
                          channel, 
                          {upsert: false, multi: false, safe: true}, 
                          callback);
  }
  
  v.validate({ channelId : [channel._id, v.isClass(ObjectID),v.idsExist(mongo.channels)] }, callback, onSuccess);
};

var ignorePlace = function ignorePlace(id, callback) 
{
  v.validate({ id: [id, v.idsExist(mongo.channels)] }, callback, function(prepared) { 
    winston.info("placeManager.ignorePlace: ignoring " + id);
    mongo.channels.update({_id: id, type: config.MONGO.channelType.place}, {$set: {ignore: true}}, callback);
  });
};

exports.tileRequiresUpdate = tileRequiresUpdate;
exports.updateStaleOrMissingTiles = updateStaleOrMissingTiles;
exports.updateTileIfNecessary = updateTileIfNecessary;
exports.search = search;
exports.prepopulate = prepopulate;
exports.refreshTile = refreshTile;
exports.findPlaceByURLId = findPlaceByURLId;
exports.find = find;
exports.update = update;
exports.ignorePlace = ignorePlace;
