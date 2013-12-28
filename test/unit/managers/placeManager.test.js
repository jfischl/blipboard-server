var should = require('should');
var sinon = require('sinon');
var fs = require('fs');
var sets = require('simplesets');

var js = require('../../../lib/javascript');
var placeManager = require('../../../managers/placeManager');
var tileManager = require('../../../managers/tileManager');
var channelEvents = require('../../../managers/channelEvents');
var events = require('../../../lib/events');
var emitter = events.emitter;
var channelManager = require('../../../managers/channelManager');
var facebook = require('../../../lib/facebook');
var mongo = require('../../../lib/mongo');
var mongoFaker = require('../mongoFaker');
var toArrayWithArgs = require('../mongoFaker').toArrayWithArgs;
var BBError = require('../../../lib/error').BBError;
var config = require('../../../config');
var place =  config.MONGO.channelType.place;
var Tile = require('../../../lib/tile').Tile;
var Page = require('../../../lib/page').Page;

var castro1FB = JSON.parse(fs.readFileSync(__dirname + "/" + "castro-1.fb.json", 'ascii')).data;
var castro2FB = JSON.parse(fs.readFileSync(__dirname + "/" + "castro-2.fb.json", 'ascii')).data;
var castro3FB = JSON.parse(fs.readFileSync(__dirname + "/" + "castro-3.fb.json", 'ascii')).data;
var castro4FB = JSON.parse(fs.readFileSync(__dirname + "/" + "castro-4.fb.json", 'ascii')).data;

var coordsInvalid = { latitude: 0, longitude: 0};
var coordsCastro = { latitude: 37.7603, longitude: -122.4346 };
var castroTile = new Tile(coordsCastro.latitude, coordsCastro.longitude, mongo.tileZoomLevel).center();
var coordsCastroTileCenter = { latitude: castroTile[0], longitude: castroTile[1] };

var sandbox, facebookMock, channelManagerMock, tileManagerMock, now, stale;

describe('placeManager.search()', function() {
  var places = [mongo.ObjectID('111111111111111111111111'),
                mongo.ObjectID('222222222222222222222222'),
                mongo.ObjectID('333333333333333333333333'),
                mongo.ObjectID('444444444444444444444444'),
                mongo.ObjectID('555555555555555555555555'),
                mongo.ObjectID('666666666666666666666666')];
  
  function toBBChannel(fbChannel) {
    var tile = new Tile(fbChannel.location.latitude, fbChannel.location.longitude, config.MONGO.tileZoomLevel),
    result = { name: fbChannel.name,
               description: fbChannel.description,
               location: fbChannel.location,
               type: "place",
               picture: "http://graph.facebook.com/" + fbChannel.id + "/picture",
               facebook: { id: fbChannel.id, 
                           likes: fbChannel.likes, 
                           checkins: fbChannel.checkins,
                           talking_about_count: fbChannel.talking_about_count,
                           categories: fbChannel.category
                         },
               website: fbChannel.website,
               phone: fbChannel.phone,
               fakeId: fbChannel.fakeId
             };
    result.location.tileIndex = tile.toIndex();
    result.blacklisted = false;
    return result;
  }

  function toBBChannelWithoutID(fbChannel) {
    var result = toBBChannel(fbChannel);
    delete result.fakeId;
    return result;
  }

  function toBBChannelWithID(fbChannel) {
    var result = toBBChannel(fbChannel);
    result._id = new mongo.ObjectID(result.fakeId);
    delete result.fakeId;
    return result;
  }
  
  beforeEach(function() {
    now = new Date();
    stale = new Date();
    stale.setDate(stale.getDate()-2); // make stale 2 days ago

    sandbox = sinon.sandbox.create();
    sandbox.add(mongoFaker.fake());
    channelManagerMock = sandbox.mock(channelManager);
    facebookMock = sandbox.mock(facebook);
    tileManagerMock = sandbox.mock(tileManager);
  });

  afterEach(function() {
    sandbox.restore();
  });

  //var params = { location : coordsCastro, type : place };

  describe('#search validation', function() {
    it('should fail with no location', function(done) {
      var params = { type : place, page: new Page() };
      placeManager.search(null, params, function (error, result) {
        error.should.be.an.instanceof(BBError);
        error.type.should.equal(BBError.validationError.type);
        sandbox.verify();
        done();
      });
    });
  });

  describe('#search (findPlacesInMongo - errors)', function() {
    it('fails request on mongo err for channels.find', function(done) {
      sandbox.stub(mongo.tileInfos, 'findOne').yields(null, { lastFacebookPlaceUpdateTime: now });

      var params = { type : place, location : coordsCastro, page: new Page() };        
      var terr = new Error();
      sandbox.mock(params.page).expects("retrieve").yields(terr, null);
      facebookMock.expects('getPlaces').never();
      
      placeManager.search(null, params, function (error, result) { 
        console.log("placeManager.search: "  + js.pp(error) + " : " + js.pp(result));
        error.type.should.equal(BBError.mongoFailed.type);
        should.not.exist(result);
        sandbox.verify();
        done();
      });
    });
  });

  // describe('#search (findPlacesInFacebook - stale)', function() {

  //   function combine(data) { 
  //     var result;
  //     result = data.staleFBData.concat(data.insertedFBData);

  //     data.updatedFBData.forEach(function (upd) { 
  //       result.forEach(function (item,i) {
  //         if (upd.id === item.id) {
  //           result[i] = upd;
  //         }
  //       });
  //     });

  //     data.deletedFBData.forEach(function (del) { 
  //       result.forEach(function (item, i) {
  //         if (del.id === item.id) {
  //           result.splice(i,i);
  //         }
  //       });
  //     });
      
  //     return result;
  //   }
    
  //   function verifyStaleUpdate(data, done) {
  //     var params = { type : place, location : coordsCastro, page: new Page() };        

  //     //console.log( 'VERIFY STALE UPDATE' + JSON.stringify(data, null, 2) );
  //     // stale facebook data
  //     sandbox.stub(mongo.tileInfos, 'findOne').yields(null, { lastFacebookPlaceUpdateTime: stale });

  //     // sorted channelIds
  //     var staleBBDataNoIds = data.staleFBData.map(toBBChannelWithoutID);
  //     var staleBBData = data.staleFBData.map(toBBChannelWithID);
  //     var sortedStaleChannels = [];

  //     // create the channels in sorted order
  //     data.sortedStaleChannelIds.forEach(function (id) { 
  //       staleBBData.forEach(function(channel) { 
  //         if ( channel._id.equals(id)){
  //           sortedStaleChannels.push(channel);
  //         }
  //       });
  //     });

  //     console.log("sorted channels=" + js.pp(sortedStaleChannels));
  //     sandbox.mock(params.page).expects("retrieve")
  //       .yields(null, {data: sortedStaleChannels, paging: { next: null, prev: null } });

  //     sandbox.mock(mongo.channels).expects('find').twice().returns(toArrayWithArgs(null,staleBBData));

  //     // refresh facebook places with combined input data
  //     var combinedBBData = combine(data);
  //     var fbids = [ ];
  //     for ( var i = 0; i < data.staleFBData.length; i++ ) {
  //       fbids.push(data.staleFBData[i].id);
  //     }
  //     facebookMock.expects('getPlaces')
  //       .withArgs(fbids, coordsCastroTileCenter.latitude, coordsCastroTileCenter.longitude)
  //       .once().yields(null, combinedBBData);
      
  //     // insert any new channels 
  //     var insertedBBData = data.insertedFBData.map(toBBChannelWithID);
  //     var insertedBBDataNoIds = data.insertedFBData.map(toBBChannelWithoutID);

  //     if (insertedBBDataNoIds.length) {
  //       sandbox.mock(mongo.channels).expects('insert').once().yields(null, insertedBBData);
  //       //sandbox.mock(mongo.channels).expects('insert').once().withArgs(insertedBBDataNoIds).yields(null, insertedBBData);
  //     }
  //     else {
  //       sandbox.mock(mongo.channels).expects('insert').never();
  //     }

  //     // any existing, updated channels.
  //     // !jcf! specify args
  //     sandbox.mock(mongo.channels).expects('update').exactly(data.updatedFBData.length);

  //     // channel Rank updates
  //     //channelRankManagerMock.expects('update').exactly(data.updatedFBData.length + data.insertedFBData.length).yields(null);

  //     // update the tileManager with lastFacebookUpdate time
  //     //sandbox.mock(mongo.tileInfos).expects('update').once();
  //     sandbox.stub(mongo.tileInfos, 'update');
      
  //     //var listenerSpy = sandbox.spy(channelEvents, 'listenersCountChange');
  //     placeManager.search(null, params, function (error, result) { 
  //       console.log("result=" + js.pp(result));
  //       should.not.exist(error);
  //       result.data.should.be.an.instanceof(Array);
  //       result.data.length.should.equal(data.staleFBData.length);

  //       result.data.forEach(function (item, i) { 
  //         item.should.have.property('_id', data.staleFBData[i]._id);
  //         item.should.have.property('name', data.staleFBData[i].name);
  //         item.should.have.property('facebook');
  //         item.facebook.should.have.property('id', data.staleFBData[i].id);
  //       });
        
  //       sandbox.verify();
  //       done();
  //     });
  //   }
    
  //   it('should have no side effects if nothing changed in facebook', function(done) {
  //     var data = { sortedStaleChannelIds : [places[0], places[1], places[2]],
  //                  staleFBData : castro1FB, 
  //                  insertedFBData: [],
  //                  updatedFBData: [],
  //                  deletedFBData: [] };
  //     verifyStaleUpdate(data, done);
  //   });

  //   it('should add 2 new places to the tile', function(done) { 
  //     var data = { staleFBData : castro1FB, 
  //                  sortedStaleChannelIds : [places[0], places[1], places[2]],
  //                  insertedFBData: castro4FB,
  //                  updatedFBData: [],
  //                  deletedFBData: [] };
  //     verifyStaleUpdate(data, done);
  //   });

  //   it('should update the rank when the number of likes changes on an existing place', function(done) {
  //     var updated = js.clone(castro1FB[0]);
  //     updated.likes = 1000;
      
  //     var data = { staleFBData : castro1FB, 
  //                  sortedStaleChannelIds : [places[0], places[1], places[2]],
  //                  insertedFBData: [],
  //                  updatedFBData: [updated],
  //                  deletedFBData: [] };
  //     verifyStaleUpdate(data, done);      
  //   });
    
  //   it('should return same stale channels when facebook deletes items', function(done) {
  //     var removed = js.clone(castro1FB[0]);
      
  //     var data = { staleFBData : castro1FB, 
  //                  sortedStaleChannelIds : [places[0], places[1], places[2]],
  //                  insertedFBData: [],
  //                  updatedFBData: [],
  //                  deletedFBData: [removed] };
  //     verifyStaleUpdate(data, done);      
  //   });

  //   // it('should update the description at 1 updated place in the tile', function(done) {
  //   //   var updated = js.clone(castro1FB[0]);
  //   //   updated.description = "updated_description";
      
  //   //   var data = { staleFBData : castro1FB, 
  //   //                sortedStaleChannelIds : [places[0], places[1], places[2]],
  //   //                insertedFBData: [],
  //   //                updatedFBData: [updated],
  //   //                deletedFBData: [] };
  //   //   verifyStaleUpdate(data, done);
  //   // });

  //   // it('should have no effect if facebook returns less channels the second time', function() {
  //   // });
  // });

  // describe('#prepopulate', function() { 
  //   function verifyPrepopulate(fbData, tileReturns, expectedCount, done) {
  //     var bbDataNoIds = fbData.map(toBBChannelWithoutID), bbData = fbData.map(toBBChannelWithID);

  //     //sandbox.mock(mongo.tileInfos).expects('findOne').once().yields(tileReturns.err, tileReturns.result);
  //     sandbox.stub(mongo.tileInfos, 'findOne').yields(tileReturns.err, tileReturns.result);
      
  //     facebookMock.expects('getPlaces')
  //       .withArgs(coordsCastroTileCenter.latitude, coordsCastroTileCenter.longitude)
  //       .once().yields(null, fbData);
      
  //     sandbox.mock(mongo.channels).expects('find').once().returns(toArrayWithArgs(null,[]));
  //     sandbox.mock(mongo.channels).expects('insert').once().withArgs(bbDataNoIds).yields(null, bbData);
      
  //     var lccSpy = sandbox.spy(channelEvents, 'listenersCountChange');

  //     channelRankManagerMock = sandbox.mock(channelRankManager);
  //     channelRankManagerMock.expects('update').exactly(expectedCount).yields(null);
  //     channelRankManagerMock.expects('sortedPage').never();

  //     //sandbox.mock(mongo.tileInfos).expects('update').once();
  //     sandbox.stub(mongo.tileInfos, 'update');
      
  //     placeManager.prepopulate(coordsCastro, function(error) { 
  //       // wait 1ms to allow the async operations to complete
  //       setTimeout(function() { 
  //         lccSpy.callCount.should.equal(expectedCount);
  //         sandbox.verify();
  //         done(); 
  //       }, 1);  
  //     });
  //   }

  //   it('should prepopulate 3 places from facebook', function(done) { 
  //     verifyPrepopulate(castro1FB, {err:null, result:{}}, 3, done);
  //   });

  //   it('should prepopulate 2 results (1 not in tile) for castro from facebook', function(done) { 
  //     var castro2FBInTile = js.clone(castro2FB);
  //     castro2FBInTile.pop();
  //     verifyPrepopulate(castro2FBInTile, {err:null, result:null}, 2, done);
  //   });
  // });
});
