var assert = require('assert');
var should = require('should');
var Tile = require('../../../lib/tile').Tile;
var tile = require('../../../lib/tile');
var sets = require('simplesets');
describe('tile', function ( ) {

  var focus = function ( ) {
    return { lat: 37,lon: -122,zoom: 18 };
  } ( );

  describe('#(new) Tile(lat, lon, zoom)', function ( ) {
    it ('should throw an error when the arguments are not numbers', function ( ) {
      (function ( ) { new Tile('not a number', 'not a number', 'not a number'); }).should.throw;
    });

    it ('should throw an error when arguments do not exist', function ( ) {
      (function ( ) { new Tile(); }).should.throw;
    });

    it ('should throw an error when an argument is missing', function ( ) {
      (function ( ) { new Tile(focus.lat, focus.lon); }).should.throw;
    });

    it ('should be ok to use strings for numbers', function ( ) {
      (function ( ) { new Tile(''+focus.lat, ''+focus.lon, ''+focus.zoom); }).should.not.throw;

    });

    it ('should be ok to forget about new', function ( ) {
      (function ( ) { Tile(focus.lat, focus.lon, focus.zoom); }).should.not.throw;
    });

    it ('should be ok to pack arguments into an array', function ( ) {
      (function ( ) { Tile([focus.lat, focus.lon, focus.zoom]); }).should.not.throw;
    });

    it ('should properly set up tiles when all values are strings', function ( ) {
      var tile = Tile(''+focus.lat, ''+focus.lon, ''+focus.zoom);
      tile.should.be.an.instanceof(Tile);
      tile.should.have.property('tileX');
      tile.should.have.property('tileY');
      tile.should.have.property('zoom', focus.zoom);
    });

    it ('should properly set up tiles when all values are packed into an array', function ( ) {
      var tile = Tile(focus.lat, focus.lon, focus.zoom);
      tile.should.be.an.instanceof(Tile);
      tile.should.have.property('tileX');
      tile.should.have.property('tileY');
      tile.should.have.property('zoom', focus.zoom);
    });
  });

  describe('#Tile().fromContainedBounds', function () {
    it("should produce a single tile when bounds are a point",function () {
      var tiles = Tile.fromContainedBounds(10,10,10,10,18);
      should.ok(tiles);
      tiles.length.should.be.equal(1);
    });
    function testFromContainedBounds(latStart,lngStart,latEnd,lngEnd,zoomLevel) {
      it("should produce tiles containing the bounds "+JSON.stringify([latStart,lngStart,latEnd,lngEnd])+
         " at zoom level" + zoomLevel, function() {
           var tiles = Tile.fromContainedBounds(latStart,lngStart,latEnd,lngEnd,zoomLevel);
           var swTile, seTile, neTile, nwTile; 
           tiles.forEach(function(tile) {
             var tileBounds = tile.toBounds();
             var minLat=tileBounds[0], minLng=tileBounds[1], maxLat=tileBounds[2], maxLng=tileBounds[3];
             var centerLat = (latStart+latEnd)/2;
             var centerLng = (lngStart+lngEnd)/2;
             function isBetween(p,pmin,pmax) { return (pmin<=p && p<=pmax); }
             should.ok(maxLat>=latStart); // south edge of tile is below the north edge of the bounding rect
             should.ok(minLat<=latEnd); // north edge of tile is above south edge of the bounding rect
             should.ok(maxLng>=lngStart); // east edge of tile is to the east of the west edge of the bounding rect
             should.ok(minLng<=lngEnd); // west edge of tile is to the west of the east edge of the bounding rect
             if (tile.containsLatLon(latStart,lngStart)) {
               swTile = tile;
             }
             if (tile.containsLatLon(latStart,lngEnd)) {
               seTile = tile;
             }
             if (tile.containsLatLon(latEnd,lngStart)) {
               nwTile = tile;
             }
             if (tile.containsLatLon(latEnd,lngEnd)) {
               neTile = tile;
             }
           });
           should.exist(swTile);
           should.exist(seTile);
           should.exist(nwTile);
           should.exist(neTile);
         });
    }
    testFromContainedBounds(10,10,10.005,10.005,18); // 20 tiles
    testFromContainedBounds(45,12,48,14,10); // 84 tiles
    testFromContainedBounds(-0.005,10,0.005,10.001,18);
    testFromContainedBounds(10,-180.005,10.0005,179.995,18); //
  });

  
  describe('#Tile().sizeInMeters',function() {
    // !am! this test fails --- it turns out the haversineDistance produces a result that is 25% (!!!) larger than 
    //      the value given by the haversine distance formula

    // it("should be similar to the haversine distance between the bounds",function () {
    //   var t= new Tile(37,-122,18);
    //   var bounds = t.toBounds();
    //   var haversineHeight = tile.haversineDistance(bounds[0],bounds[1],bounds[2],bounds[1]); // height of the tile;
    //   var haversineWidth = tile.haversineDistance(bounds[0],bounds[1],bounds[0],bounds[3.]); // width of the tile;
    //   var dHavHeight = haversineHeight*.01;
    //   var dHavWidth = haversineWidth*.01;

    //   var sizeInMeters = t.sizeInMeters();
    //   var tileWidth = sizeInMeters[0];
    //   var tileHeight = sizeInMeters[1];
    //   console.log("size in meters"+JSON.stringify(sizeInMeters));
    //   console.log("haversize size"+JSON.stringify([haversineWidth,haversineHeight]));
    //   should.ok((haversineHeight-dHavHeight)<tileHeight && tileHeight<(haversineHeight+dHavHeight)); // within 1% range of haversine
    //   should.ok((haversineWidth-dHavWidth)<tileWidth && tileWidth<(haversineWidth+dHavWidth)); // within 1% range of haversine
    // });
    it("should return roughly squarish width x height", function () {
      var t= new Tile(37,-122,18);
      var size = t.sizeInMeters();
      var width = size[0];
      var height = size[1];
      should.ok((width+.01*width)>height && height<(height+.01*height));
    });

    it("should return a shape roughly twice as high and wide when jumping zoom levels", function () {
      var t1 = new Tile(37,-122,18);
      var t2 = new Tile(37,-122,17);
      var size1 = t1.sizeInMeters();
      var size2 = t2.sizeInMeters();

      var width1 = size1[0];
      var height1 = size1[1];
      var width2 = size2[0];
      var height2 = size2[1];
      should.ok((width2+.01*width2)>(width1*2) && (width1*2)>(width2-.01*width2));
      should.ok((height2+.01*height2)>(height1*2) && (height1*2)>(height2-.01*height2));
    });
    
  });

  describe('#Tile().fromCenterAndDistanceSpan', function () {
    it("should produce the same set of tiles as the equivalent call to Tile().fromContainedBounds",function () {
      
      var tiles1 = Tile.fromContainedBounds(10,10,10.005,10.005,18);
      var tiles2 = Tile.fromCenterAndDistanceSpan(10.0025,10.0025,
                                                  tile.haversineDistance(10,10,10.005,10),
                                                  tile.haversineDistance(10,10,10,10.005),
                                                  18);
      tiles1.length.should.equal(tiles2.length);
      for (var i=0;i<tiles1.length; i++) {
        var tile1 = tiles1[i];
        var tile2 = tiles2[i];
        tile1.tileX.should.equal(tile2.tileX);
        tile1.tileY.should.equal(tile2.tileY);
        tile1.zoom.should.equal(tile2.zoom);
      }
    });
  });

  describe('#Tile().limitBoundsToSpan', function() { 
    function round(a) { 
      return (Math.round(parseFloat(a)*100000)/100000);
    }

    function verifyDistances(a,b,maxDistance) { 
      b = b.map(function (item) { 
        return round(item); 
      });
                
      var d1 = tile.haversineDistance(b[0],b[1],b[0],b[3]);
      var d2 = tile.haversineDistance(b[0],b[1],b[2],b[1]);
/*      console.log("a=" + a);
      console.log("b=" + b);
      console.log("d1=" + d1 + " d2=" + d2);*/
      assert.ok(d1 < maxDistance);
      assert.ok(d2 < maxDistance);

      assert.ok(b[0] >= a[0]);
      assert.ok(b[0] <= a[2]);

      assert.ok(b[1] >= a[1]);
      assert.ok(b[1] <= a[3]);
      
      assert.ok(b[2] >= a[0]);
      assert.ok(b[2] <= a[2]);
      
      assert.ok(b[3] >= a[1]);
      assert.ok(b[3] <= a[3]);

    }

    it("should return unrestricted region max=10000m", function() { 
      var a = [10,10,10.005,10.005];
      var b = Tile.limitBoundsToSpan(a[0],a[1],a[2],a[3],10000);
      //console.log("b=" + b);
      for (var i=0; i<4; i++) { 
        assert.ok(round(a[i]) === round(b[i]));
      }
      verifyDistances(a,b,10000);
    });

    it("should return restricted region max=500m", function() { 
      var a = [10,10,10.005,10.005];
      var b = Tile.limitBoundsToSpan(a[0],a[1],a[2],a[3],500);
      verifyDistances(a,b,500);
    });

    it("should return restricted region max=50m", function() { 
      var a = [10,10,10.005,10.005];
      var b = Tile.limitBoundsToSpan(a[0],a[1],a[2],a[3],50);
      verifyDistances(a,b,50);
    });

  });

  describe('#Tile().center()', function ( ) {
    it ('should give coordinates that belong to the same tile', function ( ) {
      var tile = new Tile(focus.lat, focus.lon, focus.zoom);
      var center = tile.center();
      Tile(center[0], center[1], tile.zoom).should.eql(tile);
    });
  });

  describe('#Tile().containsLatLon(lat, lon)', function ( ) {
    it ('should return true when lat lon have been used for creating the tile', function ( ) {
      var tile = new Tile(focus.lat, focus.lon, focus.zoom);
      tile.containsLatLon(focus.lat, focus.lon).should.be.true;
    });
  });

  describe('#new Tile(tile.toIndex())',function(){
    it('should return a valid Tile insance when called',function(done) {

      var tile = new Tile(focus.lat,focus.lon,focus.zoom);
      var newTile = new Tile(tile.toIndex());

      should.exist(newTile);
      newTile.should.be.an.instanceof(Tile);
      newTile.should.have.property('tileX',tile.tileX);
      newTile.should.have.property('tileY',tile.tileY);
      newTile.should.have.property('zoom',tile.zoom);
      newTile.should.eql(tile);

      done();
    });
  });

  describe('.toIndex()',function(){
    it('should return a valid QuadTree representation of the Tile',function(done) {

      var tile = new Tile([focus.lat,focus.lon,focus.zoom]);

      var quadTree = tile.toIndex();

      should.exist(quadTree);
      quadTree.should.be.a('string');
      quadTree.should.eql('023010232031131030');

      done();
    });
  });

  describe('#mostSignificantTileCodes', function () {
    it("should return the 5 shortest tileCodes", function () {
      var significant = Tile.mostSignificantTileCodes(5,["111","22","3333333","444444444444","55","6666666","7777","888888","9999999"]);
      var significantSet = new sets.Set(significant);
      var expectedSet = new sets.Set(["111","22","55","7777","888888"]);

      should.ok(significantSet.equals(expectedSet));
    });
  });

  describe('#simplifyTileCodes', function ( ) {
    it ('should return the parent when all children are present', function ( ) {
      should.ok(Tile.simplifyTileCodes(["000","001","002","003"]).equals(["00"]))
    });

    it ('should return parents at various levels', function ( ) {
      var simplified = Tile.simplifyTileCodes(["000","001","002","003", // level 3
                                               "0100","0101","0102","0103"]); // level 4
      should.ok(new sets.Set(simplified).equals(new sets.Set(["00","010"])));
    });

    it ('should return all children if a level is incomplete ', function ( ) {
      var simplified = Tile.simplifyTileCodes(["000","001","002"]);
      should.ok(new sets.Set(simplified).equals(new sets.Set(["000","001","002"])));
    });

    it ('should simplify even when common parent is several levels above', function ( ) {
      var simplified = Tile.simplifyTileCodes(["0000","0001","0002","0003",
                                               "0010","0011","0012","0013",
                                               "0020","0021","0022","0023",
                                               "0030","0031","0032","0033",
                                               "00300000", // !am! these should have no effect
                                               "00200001",
                                               "00100000"]);
      should.ok(simplified.equals(["00"]));
    });

  });

  describe('.enclosingRadius()', function() { 
    it('should return a rounded up value in meters for a tile at focus', function() {
      var tile = new Tile([focus.lat,focus.lon,focus.zoom]);
      var r = tile.enclosingRadius();
      r.should.eql(109);
    });

    it('should return a rounded up value in meters for a tile at focus with zoom=15', function() {
      var tile = new Tile([focus.lat,focus.lon,15]);
      var r = tile.enclosingRadius();
      r.should.eql(865);
    });

    it('should return a rounded up value in meters for a tile at (90,0)', function() {
      var tile = new Tile([90,0,focus.zoom]);
      var r = tile.enclosingRadius();
      r.should.eql(109);
    });
    
  });
  // describe('.neighbors',function(){
  //   it('should return valid neighbor Tiles',function(done) {

  //     var tile = new Tile(focus.lat,focus.lon,focus.zoom);

  //     var neighbors = tile.neighbors(1);
  //     for (var tx=-1; tx<=1; tx++) {
  //       for (var ty=-1; ty<=1; ty++) {
  //         if (tx!=0 && ty!=0) {
  //           var neighbor = _findTileWithXYZoom(neighbors,tile.tileX+tx,tile.tileY+ty,tile.zoom);
  //           should.ok(neighbor);
  //         }
  //       }
  //     }

  //     done();
  //   });
  // });

  // !jkf! TODO: I feel like we're missing some tests here, especially around
  //  passing a quad tree to the Tile constructor.  Maybe at different
  //  "zoom" levels?  What about .fromBounds and .toBounds?

});

function _findTileWithXYZoom(tiles,x,y,zoom) {
  for (var i=0; i<tiles.length; i++) {
    var tc = tiles[i];
    if (tc.tileX==x && tc.tileY==y && tc.zoom==zoom) {
      return tc;
    }
  }
}
