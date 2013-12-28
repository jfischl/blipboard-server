var config = require('../../config');
var js = require('../../lib/javascript');
var mongo = require('../../lib/mongo');
var Tile = require('../../lib/tile').Tile;

function toLatLon(input) { 
  return { latitude: input[0], longitude: input[1] };
}

function toBounds(input) { 
  return { southwest: { latitude: input[0], longitude: input[1] },
           northeast: { latitude: input[2], longitude: input[3] } };
}

// layout:
//           la
//           lb   lc
//
// r1: {la}
// r2: {la,lb}
// r3: {la,lb,lc}

var lplace_a = {latitude:10, longitude:10};
var tilea = mongo.tile(lplace_a), tixa = tilea.toIndex(); centa = tilea.center();
var tileb = js.clone(tilea); tileb.tileY+=4; 

var tixb = tileb.toIndex(), centb = tileb.center(); centb = tileb.center();
var lplace_b = toLatLon(tileb.center());

var tilec = js.clone(tilea); tilec.tileX+=4; tilec.tileY+=4;
var tixc = tilec.toIndex(), centc = tilec.center();
var lplace_c = toLatLon(tilec.center());

// contains place1
var region1 = toBounds(tilea.toBounds());
var region2 = toBounds(Tile.toBoundsFromTiles([tilea,tileb]));
var region3 = toBounds(Tile.toBoundsFromTiles([tilea,tileb,tilec]));

function toTiles(bounds) { 
  var tiles = Tile.fromContainedBounds(bounds.southwest.latitude, bounds.southwest.longitude,
                                       bounds.northeast.latitude, bounds.northeast.longitude,
                                       config.MONGO.tileZoomLevel); 
  var tileIndexes = tiles.map(function (item) { 
    return item.toIndex();
  });
  //console.log(js.pp(bounds));
  return tileIndexes;
}

// console.log("a=" + js.pp(lplace_a));
// console.log("tile(a)=" + tixa);
// console.log("bounds(a)=" + js.pp(tilea.toBounds()));

// console.log("b=" + js.pp(lplace_b));
// console.log("tile(b)=" + tixb);
// console.log("bounds(b)=" + js.pp(tileb.toBounds()));

// console.log("region1 = " + js.pp(toTiles(region1)));
// console.log("region2 = " + js.pp(toTiles(region2)));

exports.region1 = region1;
exports.region2 = region2;
exports.region3 = region3;

exports.lplace_a = lplace_a;
exports.tixa = tixa;
exports.centa = centa;

exports.lplace_b = lplace_b;
exports.tixb = tixb;
exports.centb = centb;

exports.lplace_c = lplace_c;
exports.tixc = tixc;
exports.centc = centc;