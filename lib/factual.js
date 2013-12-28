var assert = require('assert');
var async  = require('async');
var winston = require('winston');
var Factual = require("factual-api");
//var URI = require('URIjs');

var categories = require('../data/categories');
var config = require('../config');
var channelType = require('../config').MONGO.channelType;
var factual = new Factual(config.FACTUAL.key, config.FACTUAL.token);
var js = require('../lib/javascript');
var mongo = require('../lib/mongo');
var ObjectID = require('../lib/mongo').ObjectID;

var channelToFactual = function channelToFactual(channel) 
{
  var values = { 
    name: channel.name,
    address: js.pathValue(channel, ['location', 'street']),
    locality: js.pathValue(channel, ['location', 'city']),
    region: js.pathValue(channel, ['location', 'state']),
    postcode: js.pathValue(channel, ['location', 'zip']),
    latitude: js.pathValue(channel, ['location', 'latitude']),
    longitude: js.pathValue(channel, ['location', 'longitude'])
  };

  // see http://blog.stevenlevithan.com/archives/validate-phone-number#r4-2
  var re = /^(?:\+?1[-. ]?)?\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/;
  var result = re.exec(channel.phone);
  if (result) { 
    values.tel = '(' + result[1] + ') ' + result[2] + '-' + result[3];
  }

  if (channel.website) {
    values.website = channel.website.split(' ')[0];
  }

  return values;
};

var factualToChannel = function factualToChannel(factual, crosswalk) 
{
  winston.debug("factualToChannel: " + js.pp(factual));
  assert(factual);
  assert(factual.factual_id);
  assert(factual.latitude && factual.longitude);
  assert(factual.category_ids);
  assert(factual.category_ids.length > 0);

  var tile = mongo.tile(factual.latitude, factual.longitude);
  var topic = categories.lookupFactual(factual);
  var fbid = filterId(crosswalk, "facebook");
  var channel = { 
    //_id: ObjectID(), // generate one now so that it can be returned to the api caller
    name: factual.name,
    type: channelType.place,
    website: factual.website,
    phone: factual.tel,
    defaultTopicId: topic.topicId,
    location: { 
      tileIndex:   tile.toIndex(),
      latitude:    factual.latitude,
      longitude:   factual.longitude,
      street:      factual.address, // address (not including city) as a string
      city:        factual.locality, // city name (not including state)
      state:       factual.region, // full state name
      zip:         factual.postcode, // zip code
      country:     factual.country  // normalized country name
    },
    factual: { 
      id: factual.factual_id,
      crosswalk: crosswalk
    }
  };
  if (fbid) { 
    channel.facebook = { 
      id: fbid
    };
  }
  return channel;
};

var resolve = function resolve(channel, callback) 
{ 
  var values = channelToFactual(channel);
  delete values.latitude;
  delete values.longitude;
  delete values.website;

  factual.get('/t/places/resolve', {values: values, debug: true}, function (error, res) {
    winston.info("resolve " + js.ppc(values));
    if (error) { 
      winston.info("resolve " + channel._id + " (" + channel.name + ") -> error: " + js.pp(error));
      callback(error);
    }
    else if (res && res.included_rows && res.data[0].resolved) {
      var fid = res.data[0].factual_id;
      winston.info("resolve " + channel._id + " (" + channel.name + ") -> factual_id=" + fid);
      //winston.debug(" ----> (1)" + js.pp(res.data.shift()));
      //if (res.data.size) winston.debug(" ----> (2)" + js.pp(res.data.shift()));
      resolved = res.data[0];
      callback(null, res.data[0]);
    }
    else {
      winston.info("resolve " + channel._id + " (" + channel.name + ") could not resolve");
      //winston.debug("first: " + js.pp(res.data));
      callback(null);
    }
  });
};

var resolve2 = function resolve2(channel, callback) 
{ 
  var values = channelToFactual(channel);
  //factual.get('/places/resolve', {values: values, debug: true}, function (error, res) {
  //winston.info("resolve " + js.pp(values));
  var resolved = null;
  function lookup(query, callback) {
    factual.get('/t/places', {q: query, 
                                 filters:{"$and":[{"region":   values.region},
                                                  {"locality": values.locality},
                                                  //{"address":  values.address},
                                                  {"postcode": values.postcode}]},
                                 geo:{"$circle": {"$center":[values.latitude, values.longitude], "$meters": 250}}
                                },
                function (error, res) {
                  //winston.info("resolve " + query);
                  if (error) { 
                    //winston.info("resolve " + query + "(" + channel.name + ") -> error: " + js.pp(error));
                    callback(false);
                  }
                  else if (res && res.included_rows) {// && res.data[0].resolved) {
                    var fid = res.data[0].factual_id;
                    //winston.info("resolve " + query + "(" + channel.name + ") -> factual_id=" + fid);
                    //winston.debug(" ----> (1)" + js.pp(res.data.shift()));
                    //if (res.data.size) winston.debug(" ----> (2)" + js.pp(res.data.shift()));
                    resolved = res.data[0];
                    callback(true);
                  }
                  else {
                    //winston.info("resolve " + query + "(" + channel.name + ") could not resolve");
                    //winston.debug("first: " + js.pp(res.data));
                    callback(false);
                  }
                });
  }
  
  var queries = [];
  if (values.website) queries.push(values.website);
  if (values.tel) queries.push(values.tel);
  queries.push(values.name);
  async.detectSeries(queries, lookup, function(result) {
    if (result) { 
      //winston.info("resolve " + result + "(" + channel.name + ") -> factual_id=" + resolved.factual_id);
      //winston.debug(" ----> (1)" + js.pp(resolved));
    }
    else {
      winston.info("resolve " + channel.name + "(" + channel.facebook.id + ") could not resolve");
    }
    callback(resolved);
  });
};

var lookupFactualId = function lookupFactualId(factualId, callback) 
{
  //http://api.v3.factual.com/t/places/03c26917-5d66-4de9-96bc-b13066173c65
  factual.get('/t/places/' + factualId,  function (error, res) {
    if (error) { 
      winston.info("resolve " + factualId + " -> error: " + js.pp(error));
      callback(error);
    }
    else if (res && res.included_rows) {
      var record = res.data[0];
      var fid = record.factual_id;
      assert(fid === factualId);

      //winston.info("resolve " + factualId + " -> " + js.pp(record));
      callback(null, record);
    }
    else {
      winston.info("resolve " + factualId + " -> could not resolve: " + js.pp(res));
      callback("no results");
    }
  });
};

var search = function search(term, location, callback) 
{
  factual.get('/t/places/',  {q: term, 
                              geo:{"$circle": {"$center": [location.latitude, location.longitude], "$meters": 100000}}}, 
              function (error, res) {
                if (error) { 
                  winston.info("search " + term + " -> error: " + js.pp(error));
                  callback(error);
                }
                else if (res && res.included_rows) {
                  winston.debug(js.pp(res.data));
                  var results = res.data.filter(function(item) { 
                    return item.category_ids && item.category_ids.length;
                  });
                  var channels = results.map(factualToChannel);
                  callback(null, channels);
                }
                else {
                  winston.info("resolve " + factualId + " -> could not resolve: " + js.pp(res));
                  callback(null, []);
                }
              });
};

var lookupUrl = function lookupUrl(url, callback) 
{
  var request = '/t/crosswalk?filters={"url":"' + url + '"}';
  winston.info("LookupUrl: " + request);
  factual.get(request, function (error, res) {  
    if (error) { 
      winston.info("Lookup " + url + " -> error: " + error);
      callback(error);
    }
    else if (res && res.included_rows === 1 && res.data.length === 1) {
      var fid = res.data[0].factual_id;
      winston.info("Lookup " + url + " -> factual_id=" + fid);
      callback(null, fid);
    }
    else {
      winston.info("Lookup " + url + " -> found no results");
      callback("no results");
    }
  });
};

var lookupId = function lookupId(namespace, namespaceId, callback) 
{
  var request = '/t/crosswalk?filters={"namespace":"' + namespace + '","namespace_id":"' + namespaceId + '"}';
  winston.info("LookupId: " + request);
  factual.get(request, function (error, res) {  
    if (error) { 
      winston.info("Lookup " + namespace + " : " + namespaceId + " -> error: " + js.pp(error));
      callback(error);
    }
    else if (res && res.included_rows === 1 && res.data.length === 1) {
      var fid = res.data[0].factual_id;
      //winston.info("Lookup " + namespace + " : " + namespaceId + " -> factual_id=" + fid);
      callback(null, fid);
    }
    else {
      //winston.info("Lookup " + namespace + " : " + namespaceId + " -> found no results");
      //winston.info("res=" + js.pp(res));
      callback(null);
    }
  });
};


var lookupCrosswalk = function lookupCrosswalk(factualId, callback) 
{
  var request = '/t/crosswalk?filters={"factual_id":"' + factualId + '"}';
  winston.info("LookupCrosswalk: " + request);
  factual.get(request, function (error, res) {
    callback(error, res ? res.data : null);
  });
};

var filterCrosswalkEntries = function filterCrosswalkEntries(entries, namespaces, callback) 
{ 
  function filterEntry(entry, callback) { 
    callback(namespaces.indexOf(entry.namespace) !== -1);
  }
  async.filter(entries, filterEntry, callback);
};

var filterUrl = function filterUrl(entries, namespace) 
{
  var matchedEntry;
  if (entries instanceof Array) { 
    async.detectSeries(entries, 
                       function matches(entry, callback) { 
                         if (entry.namespace === namespace) { 
                           //winston.debug(namespace + " (url) -> " + entry.url);
                           callback(true);
                         }
                         else {
                           callback(false);
                         }
                       }, 
                       function (result) { 
                         if (result) {
                           matchedEntry = result.url;
                         }
                       });
  }
  return matchedEntry;
};

var filterId = function filterId(entries, namespace) 
{
  var id;
  if (entries) { 
    assert(entries instanceof Array);
    var filtered = entries.filter(function detectNamespace(entry) { 
      return entry.namespace === namespace;
    });
    if (filtered.length > 0) { 
      id = filtered[0].namespace_id;
    }
  }
  return id;
};

var resolveUrlToChannel = function resolveUrlToChannel(url, callback) { 
  async.waterfall([
    function (callback) { 
      lookupUrl(url, callback);
    },
    function (fid, callback) { 
      lookupFactualId(fid, callback);
    },
    function (frecord, callback) {
      lookupCrosswalk(frecord.factual_id, function(error, crosswalk) { 
        callback(error, frecord, crosswalk);
      });
    },
    function (frecord, crosswalk, callback) { 
      var channel = factualToChannel(frecord, crosswalk);
      callback(null, channel);
    }], function done(error, channel) { 
      if (!error) { 
        //winston.debug("result=" + js.pp(channel));
      }
      callback(error, channel);
    });
};

var defaultCrosswalkFilter = ['facebook', 'yelp', 'twitter', 'foursquare'];

exports.resolve = resolve;
exports.resolve2 = resolve2;
exports.search = search;
exports.lookupUrl = lookupUrl;
exports.lookupFactualId = lookupFactualId;
exports.lookupId = lookupId;
exports.lookupCrosswalk = lookupCrosswalk;
exports.filterCrosswalkEntries = filterCrosswalkEntries;
exports.filterUrl = filterUrl;
exports.filterId = filterId;
exports.defaultCrosswalkFilter = defaultCrosswalkFilter;
exports.resolveUrlToChannel = resolveUrlToChannel;
//lookupUrl("http://www.yelp.com/biz/paragon-restaurant-and-bar-san-francisco", console.log);
//lookupId("facebook", "116387451821124", console.log);
//lookupCrosswalk("ca6d225e-4e30-4c97-864e-22cb4ab322da", function (error, results) { 
//console.log("results=" + js.pp(results));
//filterCrosswalkEntries(results, defaultCrosswalkFilter, console.log);
//});

// filters={"namespace":"facebook", "namespace_id": "116387451821124"}

// var mongo = require('./mongo');

// var quince = "4292f447-7cdc-4233-8c62-093f918cf59f";
// var flour = "0af934bd-e50d-46ed-a48b-f217d4d2ad4a";
// mongo.initialize(function() { 
//   categories.loadTopicIds(function() { 
//     resolveUrlToChannel("http://www.yelp.com/biz/flour2-water-san-francisco", function(error, channel) {
//     });
//   });
// });
