/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview unit tests for password.js
 * @author aneil@blipboard.com
 */

var vows = require('vows');
var TileCode = require('../lib/tileCode').TileCode;
var assert = require('assert');

var suite = vows.describe('TileCode').addBatch({
  'when making TileCode with args being':{
    topic: function () { return {lat:37,lon:-122,zoom:18}; },
    '[lat,lon,zoom], a TileCode instance is produced': function (topic) {
      var tc = new TileCode([topic.lat,topic.lon,topic.zoom]);
      assert.ok(tc instanceof TileCode);
    },
    'lat,lon,zoom, an instance is produced': {
      topic: function (topic) {
       return new TileCode(topic.lat,topic.lon,topic.zoom);
      },
      'which is a TileCode instance': function (topic) {
        assert.ok(topic instanceof TileCode);
      },
      'and its string representation can be used to create a similar object': function (topic) {
        assert.deepEqual(topic,new TileCode(topic.toIndex()));
      },
      'and it has 8 adjacent neighbors': function (topic) {
        var neighbors = topic.neighbors(1);
        for (var tx=-1; tx++; tx<=1) {
          for (var ty=-1; ty++; ty<=1) {
            if (tx!=0 && ty!=0) {
              assert.ok(findTileCodeWithXYZoom(neighbors,topic.tileX+tx,topic.tileY+ty,zoom));
            }
          }
        }
      }
    }
  }
}).run();

function findTileCodeWithXYZoom(tileCodes,x,y,zoom) {
  for (var i=0; i<tileCodes.length; i++) {
    var tc = tileCodes[i];
    if (tc.tileX==x && tc.tileY==y && tc.zoom==zoom) {
      return tc;
    }
  }
}