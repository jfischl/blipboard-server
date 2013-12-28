/**
 * @fileoverview class Tile based on mercator QuadTree
 *   The .toIndex() method produces a QuadTree representation,
 *   very useful for indexing objects for retrieval at various 
 *   zoom levels.
 *       
 * @author aneil@blipboard.com
 */

var GlobalMercator = require('../support/GlobalMapTiles').GlobalMercator;
var gm = new GlobalMercator();
var BBError = require('./error').BBError;
var classOf = require('./javascript').classOf;
var assert = require('assert');

/**
 * @example 
 *    var tc1 = new Tile(lat,lon,zoom);
 *    var tc2 = new Tile([lat,lon,zoom]);
 *    assert.equal(tc1,tc2); // ok
 *    new Tile(tc1.toIndex()); // rebuild from string representation
 */
function Tile(lat, lon, zoom) {
  // if forgot to put new
  if ( !(this instanceof Tile) ) {
    return new Tile(lat, lon, zoom);
  }

  // initialize with quadtree
    if ( lon == null && classOf(lat) === String ) {
    var tile = gm.QuadTreeToTile(lat, lat.length);
    this.tileX = tile[0];
    this.tileY = tile[1];
    this.zoom = lat.length;
    return this;
  }

  // values are packed into array
  if ( classOf(lat) === Array ) {
    return new Tile(lat[0], lat[1], lat[2]);
  }

  // all arguments exist
  if ( lat != null || lon != null || zoom != null ) {
    return new Tile (gm.LatLonToQuadTree(lat, lon, zoom));
  }

  throw new BBError("Invalid Tile ctor args");
}

/**
 * minimal set of tiles enclosing the given bounding box
 */
Tile.fromContainedBounds = function fromContainedBounds (south, west, north, east, zoom) {
  var tiles = [ ];
  var swTile = new Tile(south,west,zoom);
  var neTile = new Tile(north,east,zoom);
  var tileYInc,tileXInc;
  var tileYPred,tileXPred;
  var tileX,tileY;

  if (swTile.tileX<neTile.tileX) {
    tileXInc = 1;
    tileXPred = function () { return tileX<=neTile.tileX; };
  }
  else {
    tileXInc = -1;
    tileXPred = function () { return tileX>=neTile.tileX; };
  }

  if (swTile.tileY<neTile.tileY) {
    tileYInc = 1;
    tileYPred = function () { return tileY<=neTile.tileY; };
  }
  else {
    tileYInc = -1;
    tileYPred = function () { return tileY>=neTile.tileY; };
  }

  for (tileX = swTile.tileX; tileXPred(); tileX+=tileXInc) {
    for (tileY = swTile.tileY; tileYPred(); tileY+=tileYInc) {
      tiles.push(new Tile(gm.QuadTree(tileX,tileY,zoom)));
    }
  }
  return tiles;
};

/**
 * Given a list of tileCodes, orders them by length and returns the n shortes
 */
Tile.mostSignificantTileCodes = function mostSignificantTileCodes(n, tileCodes) {
  return tileCodes.sort(function (tc1,tc2) { return tc1.length - tc2.length; }).slice(0,n);
}

/**
 * given a list of tileCodes, returns a simplified list where "parent" tiles at lower zoom levels
 * are provided if all 4 quadrants have been specified
 */
Tile.simplifyTileCodes = function simplifyTileCodes(tileCodes) {
  function newNode() {
    return {
      children:{}, // keys are quadrants: 0,1,2,3
      complete:false // true if node contains 4 complete children
    };
  }

  function isNodeComplete(node) {
    if (node.complete) 
      return true;
    else {
      if (Object.keys(node.children).length==4) {
        for (var quadrant in node.children) {
          var child = node.children[quadrant];
          if (!child.complete) { // if any of the 4 children isn't complete
            return false; // node is not complete
          }
        }
        return true; // all children are complete
      }
      else {
        return false; // there are less than 4 children
      }
    }
  }

  function addTileCodeToTrie(tc,node) {
    var length = tc.length;
    if (length>0 && !node.complete) {
      var quadrant = tc[0];
      var childNode = node.children[quadrant];
      var remainingTileCode = tc.substring(1);
      if (!childNode) {
        childNode = newNode();
        node.children[quadrant] = childNode;
      }
      if (remainingTileCode.length==0) {
        childNode.complete = true;
      }

      addTileCodeToTrie(remainingTileCode, childNode);

      node.complete = isNodeComplete(node);
    }
  }

  function computeCompleteTileCodes(prefix, node) {
    if (node.complete) {
      return prefix;
    }
    var tileCodes = [];
    for (var quadrant in node.children) {
      var child = node.children[quadrant];
      if (child.complete) {
        tileCodes.push(prefix+quadrant);
      }
      else {
        var returnVal = computeCompleteTileCodes(prefix+quadrant,child);
   //     console.log("computeTC returns="+JSON.stringify(returnVal));
        tileCodes = tileCodes.concat(returnVal);
      }
    }
  //  console.log("computeTC("+prefix+")=>"+JSON.stringify(tileCodes));
    return tileCodes;
  }
  
  var rootNode = newNode();
  
  tileCodes.forEach(function(tc) {
    addTileCodeToTrie(tc,rootNode);
  });

  var simplified = computeCompleteTileCodes("",rootNode);
  //console.log("simplifyTileCodes("+JSON.stringify(tileCodes)+")=>"+JSON.stringify(simplified));
  return simplified;
}

Tile.simplifyTileCodesAsRegExp = function simplifyTileCodesAsRegExp(tiles) 
{
  var prefixes = Tile.simplifyTileCodes(tiles).map(function(prefix) { 
    return "^" + prefix;
  });
  return new RegExp(prefixes.join("|"));
}

/**
 * Returns the tile which contains the given tiles
 * @param {Array} tiles
 * @returns {Tile} a tile containing tiles
 */
Tile.parentTile = function parentTile(tiles) {
  if (tiles.length === 1) { 
    return tiles[0];
  }
  var indexes = tiles.map(function(tile){return tile.toIndex();});
  var tileCount = indexes.length;
  var index0 = indexes[0];
  var index0Length = index0.length;
  for (var elt=0; elt<index0Length; elt++) {
    for (var i=1; i<tileCount; i++) {
      if (index0[elt]!=indexes[i][elt]) {
        var parentTileIndex = index0.slice(0,elt);
        if (parentTileIndex) {
          return new Tile(parentTileIndex);
        }
      }
    }
  }
  return null;
}

/**
 * Returns the bounding box which contains the given tiles
 * @param {Array} tiles
 * @return {list} [minLat,minLon,maxLat,maxLon]
 */
Tile.toBoundsFromTiles = function toBoundsFromTiles(tiles) {
  assert(tiles.length);
  var n=tiles[0].tileY,s=tiles[0].tileY,e=tiles[0].tileX,w=tiles[0].tileX;
  tiles.forEach(function (tile, ix) { 
    s = Math.min(s,tile.tileY);
    w = Math.min(w,tile.tileX);
    n = Math.max(n,tile.tileY);
    e = Math.max(e,tile.tileX);
  });
  
  var zoom = tiles[0].zoom;
  var sw = gm.TileLatLonBounds(w, s, zoom);
  var ne = gm.TileLatLonBounds(e, n, zoom);
  return [sw[0],sw[1],ne[2],ne[3]];
};


/**
 * Returns the bounding box which covers the region specified by a center point
 * and span in meters
 * @returns {Array} tiles
*/

Tile.toBoundsFromCenterAndDistanceSpan = function toBoundsFromCenterAndDistanceSpan(lat,lon,latMetersSpan,lonMetersSpan) { 
  var center = gm.LatLonToMeters(lat,lon);
  var mx = center[0], my = center[1];
  var latHalfSpan = latMetersSpan/2;
  var lonHalfSpan = lonMetersSpan/2;
  var southM = my - latHalfSpan;
  var northM = my + latHalfSpan;
  var westM = mx - lonHalfSpan;
  var eastM = mx + lonHalfSpan;
  var swPoint = gm.MetersToLatLon(westM,southM);
  var nePoint = gm.MetersToLatLon(eastM,northM);
  return [swPoint[0],swPoint[1],nePoint[0],nePoint[1]];
}

/**
 * Returns the tiles which cover the region specified by a center point
 * and span in meters. 
 * @returns {Array} tiles
*/
Tile.fromCenterAndDistanceSpan = function fromCenterAndDistanceSpan(lat,lon,latMetersSpan,lonMetersSpan, zoom) {
  var bounds = Tile.toBoundsFromCenterAndDistanceSpan(lat,lon,latMetersSpan,lonMetersSpan);
  return Tile.fromContainedBounds(bounds[0],bounds[1],bounds[2],bounds[3],zoom);
}

/** 
 * Provide a bounding box specified by 2 lat/long coordinates and a maxSpanInMeters and return a new bounding box
 * limited by the maxSpan 
 * @return {list} [swLat,swLong,neLat,neLong]
 */
Tile.limitBoundsToSpan = function limitboundsToSpan(swLatitude, swLongitude, neLatitude, neLongitude, maxSpanInMeters) {
  var sw = gm.LatLonToMeters(swLatitude,swLongitude);
  var ne = gm.LatLonToMeters(neLatitude,neLongitude);

  var cx = (sw[0] + ne[0])/2;
  var cy = (sw[1] + ne[1])/2;

  var dx = Math.min(Math.abs(ne[0] - sw[0]), maxSpanInMeters);
  var dy = Math.min(Math.abs(ne[1] - sw[1]), maxSpanInMeters);
  
  var swResult = gm.MetersToLatLon(cx - dx/2, cy - dy/2);
  var neResult = gm.MetersToLatLon(cx + dx/2, cy + dy/2);

  return [swResult[0], swResult[1], neResult[0], neResult[1]];
}

Tile.prototype.toIndex = function toIndex() {
  return gm.QuadTree(this.tileX, this.tileY, this.zoom);
};

/** 
 * @return {list} [minLat,minLon,maxLat,maxLon]
 */
Tile.prototype.toBounds = function toBounds() {
  return gm.TileLatLonBounds(this.tileX, this.tileY, this.zoom);
};

/**
 * @return {list} [lat,lon] representing the center of the tile
 */
Tile.prototype.center = function center() {
  var args = this.toBounds();
  var lat1 = args[0]*Math.PI/180;
  var lon1 = args[1]*Math.PI/180;
  var lat2 = args[2]*Math.PI/180;
  var lon2 = args[3]*Math.PI/180;
  var dLon = lon2-lon1;

  // center of great circle calculation:
  // http://www.movable-type.co.uk/scripts/latlong.html
  var Bx = Math.cos(lat2) * Math.cos(dLon);
  var By = Math.cos(lat2) * Math.sin(dLon);
  var centerLat = Math.atan2(Math.sin(lat1)+Math.sin(lat2),
                             Math.sqrt( (Math.cos(lat1)+Bx)*(Math.cos(lat1)+Bx) + By*By) ); 
  var centerLon = lon1 + Math.atan2(By, Math.cos(lat1) + Bx);
  
  return [centerLat*180/Math.PI,
          centerLon*180/Math.PI];
};

var lon2Degree = function lon2Degree(x) {
  return (x<0) ? x+360 : x;
}

var degree2Lon = function degree2Lon(x) {
  return (x>180) ? x-360 : x;
}

/**
 * @return {list} [latSize,lonSize] 
 */ 
Tile.prototype.latLonSize = function latLonSize() {
  var bounds = this.toBounds();
  return [bounds[2]-bounds[0],
          degree2Lon(lon2Degree(bounds[3])-lon2Degree(bounds[1]))];
}

var haversineDistance = function haversineDistance(lat1,lon1,lat2,lon2) {
  var R = 6371000; // meters
  var dLat = (lat2-lat1)*Math.PI/180;
  var dLon = (lon2-lon1)*Math.PI/180;
  var lat1 = lat1*Math.PI/180;
  var lat2 = lat2*Math.PI/180;

  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2); 
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  var d = R * c;
  return d;
}

/**
 * @returns {Array} [width,height] of the tile in meters
 */
Tile.prototype.sizeInMeters = function sizeInMeters() {
  var bounds = this.toBounds();
  var swXY = gm.LatLonToMeters(bounds[0],bounds[1]);
  var neXY = gm.LatLonToMeters(bounds[2],bounds[3]);
  var height = Math.ceil(Math.abs(neXY[1]-swXY[1]));
  var width = Math.ceil(Math.abs(neXY[0]-swXY[0]));
  return [width,height];
}


Tile.prototype.enclosingRadius = function enclosingRadius() {
  var sizeInMeters = this.sizeInMeters();
  return Math.ceil(Math.sqrt(Math.pow(sizeInMeters[0],2) + Math.pow(sizeInMeters[1],2))/2);
}

Tile.prototype.containsLatLon = function containsLatLon(lat, lon) {
  return Tile(lat, lon, this.zoom).toIndex() == this.toIndex();
}

/**
 * @returns {String} the url params for displaying the tile on a google static map
 */
Tile.prototype.googleStaticMapParams = function googleStaticMapParams(options) {
  options = options || {};
  var edgeColor = options.edgeColor || "0xff0000ff";
  var edgeWeight = options.edgeWeight || 5;
  var centerColor = options.centerColor || "blue";
  var centerLabel = options.centerLabel || "t";

  var bounds = this.toBounds();
  var south = bounds[0];
  var west = bounds[1];
  var north = bounds[2];
  var east = bounds[3];
  var polygon = [[south,west],[north,west],[north,east],[south,east],[south,west]];
  var boundsString = polygon.map(function(point) { return point.join(','); }).join('|');
  var centerString = this.center().join(',');

  return "path=color:"+edgeColor+"|weight:"+edgeWeight+"|"+boundsString+"&markers=color:"+centerColor+"|label:"+centerLabel+"|"+centerString;
}

Tile.googleStaticMapFromTiles = function googleStaticMapFromTiles(tiles,size,zoom) {
  var tileParams = tiles.map(function (tile) { return tile.googleStaticMapParams(); }).join('&');
  assert(tiles);
  assert(size,"size argument not provided");
  assert(zoom,"zoom argument not provided");
  return "http://maps.google.com/maps/api/staticmap?size="+size+"&zoom="+zoom+
    "&"+tileParams+"&sensor=false";  
}

Tile.prototype.googleStaticMap = function googleStaticMap(options) {
  options = options || {};
  var size = options.size || "400x400";
  var zoom = options.zoom || this.zoom;
  var params = this.googleStaticMapParams();

  return "http://maps.google.com/maps/api/staticmap?size="+size+"&zoom="+zoom+
    "&"+params+"&sensor=false";
}

exports.Tile = Tile;
exports.haversineDistance = haversineDistance;
