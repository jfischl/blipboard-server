var GlobalMercator = require('../support/GlobalMapTiles').GlobalMercator;
try {
  var args = require('argsparser').parse();
}
catch (e) {
  console.log("Do 'npm install argsparser' to enable command line args:");
}

function help() {
  console.log("node globalMapTilesExamples.js [-z zoom] [-lat latitude] [-lon longitude]");
}
if (Object.keys(args).length==1) {
  help();
}

var mercator = new GlobalMercator();
var sfLat = parseFloat(args['-lat']) || 37;
var sfLon = parseFloat(args['-lon']) || -122;
var zoom = parseFloat(args['-z']) || 17;

function describe(lat,lon,zoom) {
  console.log("lat="+lat);
  console.log("lng="+lon);
  console.log("zoom="+zoom);
  console.log("pixels/tile (fixed)="+mercator.tileSize);
  var quadTree = mercator.LatLonToQuadTree(sfLat,sfLon,zoom);
  console.log("quadTree:"+quadTree); // => 02301023203113103
  var tile = mercator.QuadTreeToTile(quadTree,zoom);
  console.log("tile:"+tile); // [ 21117, 80054 ]
  console.log("tile bounds (lat,lon):"+mercator.TileLatLonBounds(tile[0],tile[1],zoom));
  var tileBounds = mercator.TileBounds(tile[0],tile[1],zoom);
  console.log("tile size (meters):"+[tileBounds[2]-tileBounds[0],tileBounds[3]-tileBounds[1]]);
  var meters = mercator.LatLonToMeters(lat,lon);
  console.log("meters:"+meters);
  console.log("pixels:"+mercator.MetersToPixels(meters[0],meters[1],zoom));
  console.log("resolution (meters/pixel):"+mercator.Resolution(zoom));
}

describe(sfLat,sfLon,zoom);