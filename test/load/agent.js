/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview Simulate a load behaviour of a population of users
 * @author vladimir@blipboard.com
 *
 * @created Mon, Jun 25 2012 - 10:07:36 -0700
 * @updated Mon, Jun 25 2012 - 10:07:36 -0700
 */

var async = require('async');
var mongo = require('mongoskin');
var express = require('express');
var restler = require('restler');

var Report = require('./report').Report;

var config = require('./config');
var password = require('../../lib/password');


// SERVER SETUP /////

var db = mongo.db(config.mongo);
var updated = new Date().getTime();

var fix = { name: null, users: [ ] } 

var report = new Report([ config.name, 'Report' ].join(' '));


var server = express.createServer();

server.get('/statistics', function currentStats ( request, response ) {
  response.send(report.toJSON());
});

server.all('*', function currentReport ( request, response ) {
  response.send(report.toHTML());
});

var listening = function listening ( ) {
  console.log( '\033[1m====> listening on port: ' + config.uri.port() + ' <====\033[0m' );
}

server.listen(config.uri.port(), listening);


process.on('uncaughtException', function ( error ) {
    console.log(error);
});


// REQUESTS ///// 

var sent = 0;
var received = 0;

var reportLocation = function reportLocation ( user ) {
  var latlng = newLocation(), latency = new Date().getTime();

  var data = JSON.stringify({ latlng: [ latlng.latitude, latlng.longitude ].join(',') });
  var headers = { 'Content-Type': 'application/json' }

  var url = [ config.target, 'accounts', user._id, 'location' ].join('/');

  var options = { data: data, username: user._id, password: user.name, headers: headers }

  var done = function done ( data, response ) {
    latency = new Date().getTime() - latency;
    report.stats(reportLocation, user, latency, data, response);
  }

  var request = restler.post(url, options).on('complete', done);
}


// HELPFUL FUNCTIONS ///// 

var newLocation = function newLocation ( ) {
  var corner = config.region.northeast;

  var latSpan = config.region.southwest.latitude - corner.latitude;
  var lonSpan = config.region.southwest.longitude - corner.longitude;

  return {
    latitude: corner.latitude + latSpan * Math.random(),
    longitude: corner.longitude + lonSpan * Math.random()
  }
}


// TESTING STAGES /////

// retrieve existing state of the load tester
var load = function load ( callback ) {
  var done = function done ( error, users ) {
    fix.users = users || [ ];

    callback(error);
  }

  if ( fix.name != config.name ) {
    fix.name = config.name;

    db.collection('Channel').find({ 'fake.name': config.name }).toArray(done);
  }
  else callback();
}

// update current state according to the environment configuration
var maintain = function maintain ( callback ) {
  var users = [ ], quantity = config.users - fix.users.length;

  if ( quantity > 0 ) console.log( 'generating ' + quantity + ' users' );

  var createUser = function createUser ( user, callback ) {
    var done = function done ( error, user ) {
      if ( user && user[0] ) {
        fix.users[user[0].fake.id] = user;
      }

      callback(error);
    }

    db.collection('Channel').insert(user, { safe: true }, done);
  }

  for ( var i = 0; i < quantity; i++ ) {
    var fake = { name: config.name, id: fix.users.length + i }
    var name = [ 'User', fake.id ].join(' ');
    var pswd = password.makeSaltedHash(name);

    users.push({ fake: fake, name: name, type: 'user', password: pswd });
  }

  async.forEach(users, createUser, callback);
}

// send out generated requests
var execute = function execute ( ) {
  var requests = [ reportLocation ];

  var users = Math.min(config.users, fix.users.length);

  for ( var i = 0; i < requests.length; i++ ) {
    var amount = config[requests[i].name] * users;

    amount = Math[amount % 1 > Math.random() ? 'ceil' : 'floor'](amount);

    for ( var j = 0; j < amount; j++ ) {
      requests[i](fix.users[Math.floor(users * Math.random()) % users]);
    }
  }

  setTimeout(test, (updated += 1000) - new Date().getTime());
}


// TESTING /////

var test = function test ( ) {
  async.series([ load, maintain ], execute);
}


console.log( [ 'Running', config.name ].join(' ') );

test();
