var should = require('should');
var mongo = require('../../../lib/mongo');
var handleMongoError = mongo.handleMongoError;
var Tile = require('../../../lib/tile').Tile;
var sinon = require('sinon');

describe('mongo', function ( ) {
  describe('#join',function () {
    // !am! TODO
  });
  
  describe('#mongoHandler',function () {
    var expects = function (x) { 
      var e = sinon.expectation.create().withArgs(x).once();
      return sandbox.add(e); 
    }

    var expectsNoCall = function () { return sinon.expects.create().never(); }
    // !am! TODO
    it('should call errorBack(error) on handleMongoError(errorBack,callback)(error)', function () {
      // var e = new Error();
      // handleMongoError(expects(e),expectsNoCall)(e);
    });
    it('should call callback(result) on handleMongoError(errorBack,callback)(undefined,result)', function () {
    });

  });

  describe('#logMongoHandler',function () {
    // !am! TODO
  });

  describe('#logMongoCallback',function () {
    // !am! TODO
  });

  describe('#tile',function () {
    var focus = function ( ) {
      return { lat: 37,lon: -122,zoom: mongo.tileZoomLevel };
    } ( );
    
    it ('should properly set up tiles when values are provided in order', function ( ) {
      var tile = mongo.tile(focus.lat, focus.lon, focus.zoom);
      tile.should.be.an.instanceof(Tile);
      tile.should.have.property('tileX');
      tile.should.have.property('tileY');
      tile.should.have.property('zoom', focus.zoom);
    });

    
    it ('should properly set up tiles when values are provided in order', function ( ) {
      var tile = mongo.tile(focus.lat, focus.lon, focus.zoom);
      tile.should.be.an.instanceof(Tile);
      tile.should.have.property('tileX');
      tile.should.have.property('tileY');
      tile.should.have.property('zoom', focus.zoom);
    });

    it ('should properly set up tiles when all values are packed into an array', function ( ) {
      var tile = mongo.tile([focus.lat, focus.lon, focus.zoom]);
      tile.should.be.an.instanceof(Tile);
      tile.should.have.property('tileX');
      tile.should.have.property('tileY');
      tile.should.have.property('zoom', focus.zoom);
    });

    it ('should properly set up tiles when all values are packed into an Object', function ( ) {
      var tile = mongo.tile({latitude:focus.lat, longitude:focus.lon, zoom:focus.zoom});
      tile.should.be.an.instanceof(Tile);
      tile.should.have.property('tileX');
      tile.should.have.property('tileY');
      tile.should.have.property('zoom', focus.zoom);
    });


    it ('should throw and error when an invalid zoom value is provided (regular arg style)', function ( ) {
      (function () {
        mongo.tile({latitude:focus.lat, longitude:focus.lon}, 
                   -1);
      }).should.throw;
    });

    it ('should throw and error when an invalid zoom value is provided (location arg style)', function ( ) {
      (function () {
        mongo.tile({latitude:focus.lat, longitude:focus.lon}, 
                   -1);
      }).should.throw;
    });
    
    it ('should properly set up tile with default zoom (regular arg style)', function ( ) {
      var tile = mongo.tile(focus.lat, focus.lon);
      tile.should.be.an.instanceof(Tile);
      tile.should.have.property('tileX');
      tile.should.have.property('tileY');
      tile.should.have.property('zoom', mongo.tileZoomLevel);
    });

    it ('should properly set up tile with default zoom (location arg style)', function ( ) {
      var tile = mongo.tile({latitude:focus.lat, longitude:focus.lon});
      tile.should.be.an.instanceof(Tile);
      tile.should.have.property('tileX');
      tile.should.have.property('tileY');
      tile.should.have.property('zoom', mongo.tileZoomLevel);
    });
  }); // describe('#tile...
});