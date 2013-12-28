/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview Fake information generator
 * @author vladimir@blipboard.com
 *
 * @created Fri, Jun 29 2012 - 15:44:21 -0700
 * @updated Fri, Jun 29 2012 - 15:44:21 -0700
 */
console.log( __dirname );
var fs = require('fs');

var config = require('../../config');

var GlobalMercator = require('../../support/GlobalMapTiles').GlobalMercator;

var gm = new GlobalMercator();

var first = fs.readFileSync([__dirname, 'first.csv'].join('/')).toString().split('\n');
var last = fs.readFileSync([__dirname, 'last.csv'].join('/')).toString().split('\n');

var name = exports.name = function name ( ) {
  var fnIndex = Math.floor(Math.random() * first.length % first.length);
  var lnIndex = Math.floor(Math.random() * last.length % last.length);

  return [first[fnIndex], last[lnIndex]].join(' ');
}

var location = exports.location = function location ( lat, lon, latSpan, lonSpan ) {
  var latSpan = latSpan || lat ? 0 : 180;
  var lonSpan = lonSpan || lon ? 0 : 360;

  var lat = (lat || 0) + (Math.random() - 0.5) * latSpan;
  var lon = (lon || 0) + (Math.random() - 0.5) * lonSpan;

  return {
    latitude: lat,
    longitude: lon,
    tileIndex: gm.QuadTree(lat, lon, config.MONGO.tileZoomLevel)
  }
}

var integer = exports.integer = function integer ( min, max ) {
  var min = Math.max(min || 0, 0);
  var max = Math.max(max || 0, 0);

  if ( min > max ) {
    min = min + max;
    max = min - min;
  }

  var range = max - min;

  return min + Math.floor(Math.random() * range % range);
}

var string = exports.string = function string ( length, alphabet ) {
  var alphabet = alphabet || 'abcdef ghijkl mnopqr stuvwx yz';
  var range = alphabet.length;

  var result = '';

  for ( var i = 0; i < length; i++ ) {
    result += alphabet[Math.floor(Math.random() * range % range)];
  }

  return result;
}

var facebookId = exports.facebookId = function facebookId ( ) {
  return '99999' + string(10, '0123456789');
}
