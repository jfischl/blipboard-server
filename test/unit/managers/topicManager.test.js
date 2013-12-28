/**
 * Copyright (c) 2013 Blipboard. All rights reserved.
 * @author jason@blipboard.com
 */

var assert = require('assert');
var moment = require('moment');
var should = require('should');
var sinon = require('sinon');
var config = require('../../../config');
var channelType = require('../../../config').MONGO.channelType;
var BBError = require('../../../lib/error').BBError;
var topicManager = require('../../../managers/topicManager');
var js = require('../../../lib/javascript');
var mongo = require('../../../lib/mongo');
var mongoFaker = require('../mongoFaker');
var toArrayWithArgs = require('../mongoFaker').toArrayWithArgs;
var validate = require('../../../managers/validate');


var matchEquals = function (x) {
  return sinon.match(function(y) {
    return y==x || y.equals(x);
  }, "should equal "+x.toString());
};

describe("topicManager",function () {
  var sandbox;
  var invalidId = "foo";
  var authorId = mongo.ObjectID("000000000000000000000000");
  var placeId  = mongo.ObjectID("111111111111111111111111");
  var blipId  = mongo.ObjectID("222222222222222222222222");
  var place = { location: {latitude: 0.0, longitude: 0.0 }};
  var topics = [];
  var message = "blip";
  var createdTime = new Date(2012,1,1,0,0,0);// 1/1/12 00:00
  var expiryTime = new Date(2012,1,1);

  beforeEach(function () {
    sandbox = sinon.sandbox.create();
    sandbox.add(mongoFaker.fake());
  });

  afterEach(function () {
    sandbox.verify();
    sandbox.restore();
  });


  describe("#decorateBlipsWithTopics",function() {
    var channelId = mongo.ObjectID("000000000000000000000000");
    var listenerId = mongo.ObjectID("111111111111111111111111"),
    blipId1 = mongo.ObjectID("222222222222222222222222"),
    blipId2 = mongo.ObjectID("333333333333333333333333"),
    blipId3 = mongo.ObjectID("444444444444444444444444"),
    place = { _id:mongo.ObjectID("555555555555555555555555"),
              type:config.MONGO.channelType.place,
              location:{tileIndex:"123123123123",latitude:123,longitude:30}},
    
    topica = { _id: mongo.ObjectID("FAAAAAAAAAAAAAAAAAAAAAAA"),
               parentId: null, 
               identifier: "topica",
               name: "Topic A",
               description: "Topic A description",
               picture: "http://localhost/topica.png",
               picture2x: "http://localhost/topica@2x.png" },
    topicb = { _id: mongo.ObjectID("FBBBBBBBBBBBBBBBBBBBBBBB"),
               parentId: null, 
               identifier: "topicb",
               name: "Topic B",
               description: "Topic B description",
               picture: "http://localhost/topicb.png",
               picture2x: "http://localhost/topicb@2x.png" },
    
    blip1 = { _id: mongo.ObjectID("B22222222222222222222222"),
              type:channelType.place,
              message: "blip1",
              createdTime: new Date(), 
              expiryTime: null },
    blip2 = { _id: mongo.ObjectID("B22222222222222222222222"),
              type:channelType.place,
              topicIds: [topica._id],
              message: "blip1",
              createdTime: new Date(), 
              expiryTime: null },
    blip3 = { _id: mongo.ObjectID("B22222222222222222222222"),
              type:channelType.place,
              topicIds: [topica._id,topicb._id],
              message: "blip1",
              createdTime: new Date(), 
              expiryTime: null };
    
    it("should handle case where no topicIds passed in with single blip", function (done) {
      function getBlips(callback) { 
        callback = topicManager.decorateBlipsWithTopics(callback);
        callback(null, blip1);
      }
      
      sandbox.mock(mongo.topics).expects('findItems').yields(null, []);
      getBlips(function (error, blip) { 
        should.not.exist(error);
        should.exist(blip);
        blip.should.not.have.property('topics');
        done();
      });
    });

    it("should handle case where no topicIds passed in with array of blips", function (done) {
      function getBlips(callback) { 
        callback = topicManager.decorateBlipsWithTopics(callback);
        callback(null, [blip1]);
      }
      
      sandbox.mock(mongo.topics).expects('findItems').yields(null, [topica]);
      getBlips(function (error, blips) { 
        should.not.exist(error);
        should.exist(blips);
        blips.should.be.an.instanceOf(Array);
        blips[0].should.not.have.property('topics');
        done();
      });
    });


    it("should handle case where 1 topicId passed in with array of blips", function (done) {
      function getBlips(callback) { 
        callback = topicManager.decorateBlipsWithTopics(callback);
        callback(null, [blip2]);
      }
      
      sandbox.mock(mongo.topics).expects('findItems').yields(null, [topica]);
      getBlips(function (error, blips) { 
        should.not.exist(error);
        should.exist(blips);
        blips.should.be.an.instanceOf(Array);
        blips.should.have.lengthOf(1);
        blips[0].should.have.property('topics');
        blips[0].topics.should.have.lengthOf(1);
        blips[0].topics[0].should.have.property("_id");
        blips[0].topics[0].should.have.property("identifier", "topica");
        done();
      });
    });

    it("should handle case where 2 topicId passed in with array of blips", function (done) {
      function getBlips(callback) { 
        callback = topicManager.decorateBlipsWithTopics(callback);
        callback(null, [blip3]);
      }
      
      sandbox.mock(mongo.topics).expects('findItems').yields(null, [topica,topicb]);
      getBlips(function (error, blips) { 
        should.not.exist(error);
        should.exist(blips);
        blips.should.be.an.instanceOf(Array);
        blips.should.have.lengthOf(1);
        blips[0].should.have.property('topics');
        blips[0].topics.should.have.lengthOf(2);
        blips[0].topics[0].should.have.property("_id");
        blips[0].topics[0].should.have.property("identifier", "topica");
        blips[0].topics[1].should.have.property("_id");
        blips[0].topics[1].should.have.property("identifier", "topicb");
        done();
      });
    });


  });
});
  