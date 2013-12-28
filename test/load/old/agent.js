/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview Simulate a load behaviour of a population of users
 * @author vladimir@blipboard.com
 *
 * @created Mon, Jun 25 2012 - 10:07:36 -0700
 * @updated Mon, Jun 25 2012 - 10:07:36 -0700
 */

var nl = require('nodeload');
var async = require('async');

var MongoFix = require('../fixtures/mongofix').MongoFix;

MongoFix.verbose();

// USER SIMULATION
var User = function User ( behaviour, doc ) {
  if ( !(this instanceof User) ) return new User(behaviour, doc);
  
  this.behaviour = behaviour;
  this.doc = doc;
}

User.prototype.authorize = function authorize ( request ) {
  var credentials = [this.doc._id, this.doc.pswd || this.doc.name].join(':');
  var credentials64 = new Buffer(credentials, 'utf8').toString('base64');

  request.setHeader('Authorization', ['BASIC', credentials64].join(' '));
}

User.prototype.newLocation = function newLocation ( ) {
  var locations = this.behaviour.reportLocation.locations;
  var location = locations[Math.floor(locations.length * Math.random() % locations.length)];

  var latitude = location.latitude + (location.latSpan || 0) / 2 * Math.random();
  var longitude = location.longitude + (location.lonSpan || 0) / 2 * Math.random();

  return { latitude: latitude, longitude: longitude };
}

User.prototype.reportLocation = function reportLocation ( client ) {
  var request = client.request('POST', '/accounts/' + this.doc._id + '/location');
  this.authorize(request);

  var latlng = this.newLocation();
  var data = JSON.stringify({ latlng: [ latlng.latitude, latlng.longitude ].join(',') });

  request.setHeader('Content-Type', 'application/json');
  request.write(data);

  return request;
}

User.prototype.action = function action ( client ) {
  return this.reportLocation(client);
}

User.requestRate = function requestRate ( behaviour ) {
  var rate = 0;

  if ( behaviour.reportLocation ) rate += behaviour.reportLocation.times || 0;

  return rate;
}

// HELPERS
var permutations = function permutations ( properties, result ) {
  var result = result || [ { } ];

  if ( !properties || properties.length < 1 ) return result;

  var property = properties.shift();

  var length = result.length;
  for ( var i = 0; i < length; i++ ) {
    var parent = result.shift();

    for ( var j = 0; j < property.values.length; j++ ) {
      var child = { }

      for ( var key in parent ) child[key] = parent[key];

      child[property.path] = {
        label: property.label,
        value: property.values[j]
      }

      result.push(child);
    }
  }

  return permutations(properties, result);
}

var setPath = function setPath ( obj, path, value ) {
  var path = typeof path == 'string' ? path.split('.') : path;

  while ( path.length > 1 ) {
    var key = path.shift();
    if ( typeof obj[key] != 'object' ) obj[key] = { };
    obj = obj[key];
  }

  obj[path.shift()] = value;
}


// TESTING
var testLoad = function testLoad ( config, users, callback ) {
  var users = users.map(function ( doc ) { return new User(config.users.behaviour, doc); });
  var load = Math.round(config.users.quantity * User.requestRate(config.users.behaviour) / 60 / 60);

  var count = 0;
  console.time( ['\033[1m', '\033[0m'].join([config.name, 'Load Test'].join(' - ')) );
  console.log( '\033[1mSimulating ' + config.name + ' with Load: ' +  load + ' requests per second\033[0m' );
  var load = nl.run({
    name: config.name,
    host: config.host,
    port: config.port,
    stats: config.stats,
    timeLimit: config.duration,
    targetRps: load,
    numClients: 10 * load,
    numUsers: load,
    requestGenerator: function ( client ) {
      count++;
      var user = users[Math.floor(users.length * Math.random() % users.length)];
      return user.action(client);
    }
  });
  
  load.on('end', function ( ) {
    console.log( '\033[1m' + config.name + ' is Done after generating: ' + count + ' requests\033[0m' );
    console.timeEnd( ['\033[1m', '\033[0m'].join([config.name, 'Load Test'].join(' - ')) );
    callback();
  });
}

var validate = function validate ( config ) {
  if ( !config.users ) return 'Please, define "users"';
  if ( !config.places ) return 'Please, define "places"';
  if ( !config.tuneins ) return 'Please, define "tuneins"';
  if ( !config.tuneins.users ) return 'Please, define "tuneins.users"';
  if ( !config.tuneins.places ) return 'Please, define "tuneins.places"';
  if ( !config.tuneins.users.distribution ) return 'Please, define "tuneins.users.distribution"';
  if ( !config.tuneins.places.distribution ) return 'Please, define "tuneins.places.distribution"';
}

var execute = function execute ( config, callback ) {
  var error = validate(config);
  if ( error ) return callback(error);

  console.time( ['\033[1m', '\033[0m'].join([config.name, 'Setup    '].join(' - ')) );

  var users = [ ];
  var fix = new MongoFix(config.name, config.mongo);

  var fresh = { }

  var fixLoad = function fixLoad ( callback ) { fix.load(callback); }

  var fixSetup = function fixSetup ( callback ) {
    // setup users
    var userSetup = fix.script['users'];
    var isUserSetup = userSetup && userSetup.args.make == 'users';
    var hasEnoughUsers = isUserSetup && userSetup.args.quantity >= config.users.quantity;

    if ( hasEnoughUsers && config.users.areFresh ) fresh.users = true;
    else {
      var users = { make: 'users', quantity: config.users.quantity }
      fix.set('users', users);
    }

    // setup places
    var placeSetup = fix.script['places'];
    var isPlaceSetup = placeSetup && placeSetup.args.make == 'places';
    var hasEnoughPlaces = isPlaceSetup && placeSetup.args.quantity >= config.places.quantity;

    if ( hasEnoughPlaces && config.places.areFresh ) fresh.places = true;
    else {
      var places = { make: 'places', quantity: config.places.quantity }
      fix.set('places', places);
    }

    // setup blips
    var blipSetup = fix.script['blips'];
    var isBlipSetup = blipSetup && blipSetup.args.make == 'blipsAtPlaces';
    var hasEnoughBlips = isBlipSetup && blipSetup.args.quantity >= config.places.broadcastedBlips;
    if ( hasEnoughBlips && fresh.places ) fresh.blips = true;
    else {
      var blips = {
        make: 'blipsAtPlaces',
        places: 'places',
        quantity: config.places.broadcastedBlips * config.places.quantity
      }

      fix.set('blips', blips);
    }

    // setup received
    var received = {
      make: 'receivedBlips',
      blips: 'blips',
      users: 'users',
      quantity: config.users.receivedBlips * config.users.quantity
    }

    fix.set('received', received);

    // setup place tuneins
    var placeTuneinSetup = fix.script['placeTuneins'];
    var isPlaceTuneinSetup = placeTuneinSetup && placeTuneinSetup.args.make == 'tuneins';
    var hasEnoughPlaceTuneins = isPlaceTuneinSetup && placeTuneinSetup.args.quantity >= config.tuneins.places.quantity;
    var hasSamePlaceDistribution = isPlaceTuneinSetup && placeTuneinSetup.args.distribution.isNormal == config.tuneins.places.distribution.isNormal;
    if ( hasEnoughPlaceTuneins && hasSamePlaceDistribution && fresh.users && fresh.places && config.tuneins.areFresh ) fresh.placeTuneins = true;
    else {
      var tuneins = {
        make: 'tuneins',
        users: 'users',
        channels: 'places',
        quantity: config.tuneins.places.quantity * config.places.quantity,
        distribution: config.tuneins.places.distribution
      }

      fix.set('placeTuneins', tuneins);
    }

    // setup user tuneins
    var userTuneinSetup = fix.script['userTuneins'];
    var isUserTuneinSetup = userTuneinSetup && userTuneinSetup.args.make == 'tuneins';
    var hasEnoughUserTuneins = isUserTuneinSetup && userTuneinSetup.args.quantity >= config.tuneins.users.quantity;
    var hasSameUserDistribution = isUserTuneinSetup && userTuneinSetup.args.distribution.isNormal == config.tuneins.users.distribution.isNormal;
    if ( hasEnoughUserTuneins && hasSameUserDistribution && fresh.users && config.tuneins.areFresh ) fresh.userTuneins = true;
    else {
      var tuneins = {
        make: 'tuneins',
        users: 'users',
        channels: 'users',
        quantity: config.tuneins.users.quantity * config.users.quantity,
        distribution: config.tuneins.users.distribution
      }

      fix.set('userTuneins', tuneins);
    }

    callback();
  }

  var fixRefresh = function fixRefresh ( callback ) { fix.refresh(fresh, callback); }

  var extractUsers = function extractUsers ( callback ) {
    for ( var i = 0; i < config.users.quantity; i++ ) {
      users.push(fix.get('users', i));
    }
    callback();
  }

  var test = function test ( callback ) {
    console.timeEnd( ['\033[1m', '\033[0m'].join([config.name, 'Setup    '].join(' - ')) );
    testLoad(config, users, callback );
  }

  var workflow = [ fixLoad, fixSetup, fixRefresh, extractUsers, test ];

  async.series(workflow, callback);
}

var run = exports.run = function run ( config, callback ) {
  var name = config.name;
  
  var stack = permutations(config.permute);

  var worker = function worker ( permutation, callback ) {
    var tags = [ ];

    for ( var path in permutation ) {
      setPath(config, path, permutation[path].value);
      tags.push(permutation[path].label + permutation[path].value);
    }

    config.name = name + '(' + tags.join(' - ') + ')';

    execute(config, callback);
  }

  console.log( 'STACK: ' + stack );
  async.forEachSeries(stack, worker, callback);
}

// TEST CODE /////
//var configs = [
//  require('./configs/places-3x')
//];
//
//var worker = function worker ( config, callback ) { run(config, callback); }
//
//var finalCallback = function finalCallback ( error ) {
//  if ( error ) console.log( error );
//  process.exit(0);
//}
//
//async.forEach(configs, worker, finalCallback);

var config = require('./configs/report-location');
var finalCallback = function finalCallback ( error ) {
  if ( error ) console.log( error );
  process.exit(0);
}
run(config, finalCallback);
