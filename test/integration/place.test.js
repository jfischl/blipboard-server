var assert = require('assert');
var async = require('async');
var fs = require('fs');
var should = require('should');
var sprintf = require('sprintf').sprintf;
var sinon = require('sinon');


var placeManager = require('../../managers/placeManager');
var channelManager = require('../../managers/channelManager');
var channelEvents = require('../../managers/channelEvents');
var tileManager = require('../../managers/tileManager');

var Page = require('../../lib/page').Page;
var config = require('../../config');
var js = require('../../lib/javascript');
var facebook = require('../../lib/facebook');
var mongo = require('../../lib/mongo');
var mongofix = require('./mongofix');
var f = require('../../lib/functional');
var r = require('./region');

var ObjectID = mongo.ObjectID;

// declaring shared variables
var fix,sandbox,me;
var place_a,place_b,place_c;
var fb_a, fb_b, fb_c;
var now = new Date();
var createdTime = new Date(2012,1,1,0,0,0);// 1/1/12 00:00
var expiryTime = new Date(); expiryTime.setDate(createdTime.getDate()+1); 
var tileManagerMock,channelManagerMock,channelEventsMock;

function toLatLon(input) { 
  return { latitude: input[0], longitude: input[1] };
}

function toBounds(input) { 
  return { southwest: { latitude: input[0], longitude: input[1] },
           northeast: { latitude: input[2], longitude: input[3] } };
}


function toFBPlace(bbPlace) { 
  return { 
    id: bbPlace.facebook.id,
    likes: bbPlace.facebook.likes || 0,
    talking_about_count: bbPlace.facebook.talking_about_count || 0,
    checkins: bbPlace.facebook.checkins || 0,
    name: bbPlace.name,
    description: bbPlace.description,
    location: { 
      street: bbPlace.location.street,
      city: bbPlace.location.city,
      latitude: bbPlace.location.latitude,
      longitude: bbPlace.location.longitude
    },
    categories: [ { name: 'restaurant' } ]
  };
}

describe('placeManager integration tests (with mongodb)', function ( ) {
  before(function ( done ) {
    mongo.initialize(function () {
      sandbox = sinon.sandbox.create();
      fix = mongofix.MongoFix(
        { key: 'me',      make: 'user',  name: 'me' },
        { key: 'place_a', make: 'place', facebookId: 1000, location: r.lplace_a, score: 20, name: 'place_a' },
        { key: 'place_b', make: 'place', facebookId: 1001, location: r.lplace_b, score: 10, name: 'place_b' },
        { key: 'place_c', make: 'place', facebookId: 1002, location: r.lplace_c, score: 30, name: 'place_c' }
      );
      done();
    });
  });

  after(function(done) {
    mongofix.cleanup(done);
  });
  
  beforeEach(function(done) {
    async.series({
      cleanupFixture: function (callback){ 
        mongofix.cleanup(callback); 
      },
      resetFixture: function (callback) { 
        fix.reset(callback); 
      },
      setupFixture: function (callback) { 
        place_a = fix.get('place_a'); fb_a = toFBPlace(place_a);
        place_b = fix.get('place_b'); fb_b = toFBPlace(place_b);
        place_c = fix.get('place_c'); fb_c = toFBPlace(place_c);
        callback();
      }
    }, done);
  });

  afterEach(function(done) {
    sandbox.verify(); 
    sandbox.restore();
    done();
  });

  describe("placeManager.search", function() {
    describe("with fresh data in the tile", function() { 
      it("should return place_a at location=place_a", function(done) {
        var params = { location : r.lplace_a, page: new Page() };
        
        sandbox.stub(tileManager, "getLastFacebookUpdateTime").withArgs(r.tixa).yields(null, r.tixa, now, 0);
        //sandbox.mock(channelRankManager).expects('sortedPage').once().yields(null, { data: [place_a._id], paging: { next: null, prev: null } });

        placeManager.search(null, params, function (error, result) { 
          //console.log("result=" + js.pp(result));
          should.not.exist(error);
          result.should.have.property('data');
          //for ( var i in result.data.should.be.an ) console.log( i );
          result.data.should.be.an.instanceof(Array).with.lengthOf(1);
          
          assert.ok(result.data[0]._id.equals(place_a._id));
          done();
        });
      });

      it("should return place_a,place_b,place_c at location=region3", function(done) {
        var index = [{name: 'score', order: -1, type: function (value) { return value; } }];
        var params = { bounds : r.region3, page: new Page(null, index) };

        sandbox.stub(tileManager, "getLastFacebookUpdateTime", function(tileIndex, callback) { 
          callback(null, tileIndex, now, 0);
        });
        //sandbox.mock(channelRankManager).expects('sortedPage').yields(null, { data: [place_c._id,place_a._id,place_b._id], 
        //paging: { next: null, prev: null } });
        
        placeManager.search(null, params, function (error, result) { 
          //console.log("result.data=" + js.pp(result.data));
          should.not.exist(error);
          result.should.have.property('data');
          result.data.should.be.an.instanceof(Array).with.lengthOf(3);
          assert.ok(result.data[0]._id.equals(place_c._id));
          assert.ok(result.data[1]._id.equals(place_a._id));
          assert.ok(result.data[2]._id.equals(place_b._id));
          done();
        });
      });
    });

    describe("with no data in the tile", function() { 
      function cleanup(channels, callback) { 
        var fbids = channels.map(function (item) { return item.id; });
        //console.log("cleanup Facebook IDs=" + js.ppc(fbids));
        mongo.channels.remove({'facebook.id': {$in: fbids}}, callback);
      }
      
      // must clean up before to remove the fixture which is not desired for these test cases
      beforeEach(function (done) { 
        cleanup([fb_a,fb_b,fb_c], done);
      });

      afterEach(function (done) { 
        cleanup([fb_a,fb_b,fb_c], done);
      });

      function verifyFindPlacesInFacebook(fbData, tileReturns, expectedCount, callback) {
        var index = [{name: 'score', order: -1, type: function (value) { return value; } }];
        var params = { prefix: '', bounds : r.region3, page : new Page(null, index) };
        sandbox.stub(tileManager, "getLastFacebookUpdateTime", function(tileIndex, callback) { 
          callback(tileReturns.err, tileIndex, tileReturns.updated, tileReturns.refreshed);
        });
        sandbox.stub(tileManager, "updateLastFacebookUpdateTime", function(tileIndex, offsetInSecs) { 
          //console.log("updateLastFacebookUpdateTime: " + tileIndex + " offset=" + offsetInSecs);
        });

        sandbox.stub(facebook, "getPlaces", function(fbids, latitude, longitude, distance, callback) { 
          if (latitude === r.centa[0] && longitude === r.centa[1]) { 
            //console.log("stub getPlaces=" + js.pp(fbData));
            callback(null, fbData);
          }
          else if (latitude === r.centb[0] && longitude === r.centb[1]) { 
            //console.log("stub getPlaces=" + js.pp(fbData));
            callback(null, fbData);
          }
          else if (latitude === r.centc[0] && longitude === r.centc[1]) { 
            //console.log("stub getPlaces=" + js.pp(fbData));
            callback(null, fbData);
          }
          else { 
            callback(null, []);
          }
        });

        sandbox.mock(channelEvents).expects("refreshChannelBlips").exactly(fbData.length);
        
        placeManager.search(null, params, function (error, result) { 
          //console.log("result=" + js.pp(result));
          should.not.exist(error);
          result.data.length.should.equal(expectedCount);
          result.data.forEach(function (item, i) { 
            item.should.have.property('_id');
            item.should.have.property('name', fbData[i].name);
            item.should.have.property('facebook');
            item.facebook.should.have.property('id', fbData[i].id);
          });
          //channelEvents.onTileChannelsUpdated(function() {});
          process.nextTick(callback);
        });
      }
      
      // !JCF! note: these tests no longer are required since the spider populates the tiles

      // it('should return 0 result from facebook - tile with no lastFBTime', function(done) { 
      //   verifyFindPlacesInFacebook([], {err:null, updated:0, refreshed:0}, 0, done);
      // });

      // it('should return 1 result from facebook - tile with no lastFBTime', function(done) { 
      //   verifyFindPlacesInFacebook([fb_a], {err:null, updated:0, refreshed:0}, 1, done);
      // });
      
      // it('should return 3 results from facebook - tile with no lastFBTime', function(done) { 
      //   verifyFindPlacesInFacebook([fb_b,fb_a,fb_c], {err:null, updated:0, refreshed:0}, 3, done);
      // });
    });
  });
});
  
// Notes: 
// add placeManager.search(listenerId) test when tuned-in. 
  
