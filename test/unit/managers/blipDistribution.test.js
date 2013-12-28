/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview unit tests for the blipDistributionService
 *           
 * @author aneil@blipboard.com
 */
var sinon = require('sinon');
var should = require('should');
var sets = require('simplesets');


var BBError = require('../../../lib/error').BBError;
var blipManager = require('../../../managers/blipManager');
var blipNotificationService = require('../../../managers/blipNotificationService');
var channelManager = require('../../../managers/channelManager');
var topicManager = require('../../../managers/topicManager');
var classOf = require('../../../lib/javascript').classOf;
var listenNetworkManager = require('../../../managers/listenNetworkManager');
var mongo = require('../../../lib/mongo');
var ObjectID = mongo.ObjectID;
var mongoFaker = require('../mongoFaker');
var toArrayWithArgs = require('../mongoFaker').toArrayWithArgs;
var userManager = require('../../../managers/userManager');
var validate = require('../../../managers/validate');
var js = require('../../../lib/javascript');

describe("blipManager (distribution)",function () {
  var sandbox;
  var receivedBlipsMock;
  var userManagerMock;
  var blipNotificationServiceMock;

  var callbackExpects = function callbackExpects(done,expectedError,expectedValue) {
    var expectation = sandbox.add(sinon.expectation.create('callback'));
    if (expectedValue) {
      expectation.withArgs(expectedError,expectedValue);
    }
    else {
      expectation.withArgs(expectedError);
    }
    expectation.once();
    return function callback(error,value) {
      //console.log("callbackExpects: " + expectedError + " : " + js.pp(expectedValue));
      //console.log("callbackGot: " + error + " : " + js.pp(value));
      expectation(error,value);
      var doneTimeOut = function () {
        sandbox.verify();
        done();
      };
      setTimeout(doneTimeOut, 10);
    }
  }

  var callbackExpectsErrorType = function callbackExpectsErrorType(done,errorType) {
    return callbackExpects(done,errorTypeMatcher(errorType));
  }

  var errorTypeMatcher = function errorTypeMatcher(errorType) {
    return sinon.match(function (value) {
      return value.type===errorType;
    },"error.type expected to be "+errorType);
  }

  beforeEach(function () {
    sandbox = sinon.sandbox.create();
    sandbox.add(mongoFaker.fake());
    receivedBlipsMock = sandbox.mock(mongo.receivedBlips);
    userManagerMock = sandbox.mock(userManager);
    blipNotificationServiceMock = sandbox.mock(blipNotificationService);
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe("#distributeBlipToListeners()", function () {
    var invalidId = "foo";
    var authorId = mongo.ObjectID("000000000000000000000000");
    var placeId  = mongo.ObjectID("111111111111111111111111");
    var blipId  = mongo.ObjectID("222222222222222222222222");
    var rblipId  = mongo.ObjectID("333333333333333333333333");

    var latitude = 37.7;
    var longitude = 124.3;
    var tileIndex = mongo.tile(latitude,longitude).toIndex();
    var topics = [];
    var message = "I blip therefore I am.";
    var expiryTime = new Date(2012,1,1);
    var blip = { _id: blipId,
                 author: { _id: authorId, name: "Arthur Naim", type:mongo.channelType.user},
                 place: { _id: placeId, 
                          location: { tileIndex: tileIndex, 
                                      address:"123 main",
                                      city: "SF",
                                      state: "CA",
                                      latitude:latitude,
                                      longitude:longitude
                                    }
                        },
                 topics: topics,
                 message:message,
                 expiryTime:expiryTime,
               };

    var listenerId1 = mongo.ObjectID("444444444444444444444444");
    var listenerId2 = mongo.ObjectID("555555555555555555555555");

    var listenNetworkManagerFindListeners = function listenNetworkManagerFindListeners(listeners) {
      sandbox.mock(listenNetworkManager).expects('findListeners')
        .yields(null,listeners);
    };

    var listenNetworkManagerFindListenersNever = function listenNetworkManagerFindListeners(listeners) {
      sandbox.mock(listenNetworkManager).expects('findListeners').never();
    };

    var listenNetworkManagerFindListenersError = function listenNetworkManagerFindListenersError(listeners) {
      sandbox.mock(listenNetworkManager).expects('findListeners')
        .yields(BBError.mongoFailed(),undefined);
    };

    var blipFoundNever = function blipFoundNever() {
      sandbox.mock(mongo.blips).expects('findOne').never();
    };

    var blipFound = function blipFound(blip) {
      sandbox.mock(mongo.blips).expects('findOne')
        .yields(null,blip);
    };

    var blipFoundError = function blipFoundError() {
      sandbox.mock(mongo.blips).expects('findOne')
        .yields(new Error("Some mongo error"));
    };

    var receivedBlipsInsert = function receivedBlipsInsert(userId,tileIndex,blipId,error,result) {
      receivedBlipsMock.expects('insert')
        .withArgs(mongoFaker.criterionMatcher({user:userId,
                                               tileIndex:tileIndex,
                                               blip:blipId}))
        .yields(error,result); 
    };

    var receivedBlipsInsertNever = function receivedBlipsInsertNever() {
      receivedBlipsMock.expects('insert').never();
    };

    var receivedBlipsCount = function receivedBlipsCount(userId,tileIndex,error,count) {
      receivedBlipsMock.expects('count')
        .withArgs(mongoFaker.criterionMatcher({user:userId,
                                               tileIndex:tileIndex,
                                               blip:blipId}))
        .yields(error,count);
    };

    var receivedBlipsCountNever = function receivedBlipsCountNever() {
      receivedBlipsMock.expects('count').never();
    };

    var receivedBlipsMarkRead = function receivedBlipsMarkRead(userId,tileIndex,blipId,error,result) {
      receivedBlipsMock.expects('update')
        .withArgs(mongoFaker.criterionMatcher({user:userId,
                                               tileIndex:tileIndex,
                                               blip:blipId}))
        .yields(error,result);
    };

    var receivedBlipsMarkReadNever = function receivedBlipsMarkReadNever() {
      receivedBlipsMock.expects('update').never();
    };


    var pushNotifyUsersNearBlip = function pushNotifyUsersNearBlip(listenerIds,tileIndex) {
      blipNotificationServiceMock.expects('pushNotifyUsersNearBlip')
        .withArgs(listenerIds,tileIndex);
    };

    var pushNotifyUsersNearBlipNever = function pushNotifyUsersNearBlipNever() {
      blipNotificationServiceMock.expects('pushNotifyUsersNearBlip').never();
    }

    function resultsMatch(expectedResults) {
      if (classOf(expectedResults)==Array) {
        var expectedArray = expectedResults;
        expectedResults = {}
        expectedArray.forEach(function (result) {
          expectedResults[result[0].toString()]=result[1];
        });
      }
      return sinon.match(function (results) {
        for (var key in expectedResults) {
          if (expectedResults[key]!==results[key]) {
            return false;
          }
        }
        var expectedKeys = new sets.Set(Object.keys(expectedResults));
        var actualKeys = new sets.Set(Object.keys(results));
        return expectedKeys.equals(actualKeys);
      }, "distributeBlips result should match expected value " + JSON.stringify(expectedResults));
    }

    it("should fail if blipId is not a valid ObjectID", function (done) {
      blipFoundNever();
      listenNetworkManagerFindListenersNever();
      receivedBlipsInsertNever();
      pushNotifyUsersNearBlipNever();
      blipManager.distributeBlipToListeners(
        "invalidObjectId",
        true,
        callbackExpectsErrorType(done,BBError.validationError.type));      
    });

    it("should fail if blip cannot be loaded", function (done) {
      sandbox.mock(mongo.blips).expects('findOne')
        .yields(BBError.mongoFailed());

      receivedBlipsInsertNever();
      listenNetworkManagerFindListenersNever();
      pushNotifyUsersNearBlipNever();

      blipManager.distributeBlipToListeners(
        blipId,
        true,
        callbackExpectsErrorType(done,BBError.mongoFailed.type));
    });

    it("should not insert or update incomingBlips when there are no listeners",function (done) {
      blipFound(blip);

      listenNetworkManagerFindListeners([]);
      receivedBlipsInsertNever();
      receivedBlipsMarkReadNever();
      pushNotifyUsersNearBlipNever();

      blipManager.distributeBlipToListeners(
        blipId,
        true,
        callbackExpects(done,undefined,resultsMatch({})));
    });
    
    it("should upsert unread receivedBlips at the blip's tile",function (done) {
      blipFound(blip);

      listenNetworkManagerFindListeners([listenerId1,listenerId2]);
      
      // we expect upserts on listenerId1 and listenerId2
      receivedBlipsInsert(listenerId1,blip.place.location.tileIndex,blip._id,undefined,[{_id:rblipId}]);
      receivedBlipsInsert(listenerId2,blip.place.location.tileIndex,blip._id,undefined,[{_id:rblipId}]);
      
      pushNotifyUsersNearBlip([listenerId1,listenerId2],blip);
      
      blipManager.distributeBlipToListeners(
        blipId,
        true,
        callbackExpects(done,undefined,resultsMatch([[listenerId1,1],[listenerId2,1]])));
    });
    
    it("should return results indicating when an upsert was not performed",function (done) {
      blipFound(blip);

      listenNetworkManagerFindListeners([listenerId1,listenerId2]);
      
      // we expect upserts on listenerId1 and listenerId2
      var mongoDupError = new Error("Mongo dup key error");
      mongoDupError.code = mongo.errors.duplicateKeyError;
      receivedBlipsInsert(listenerId1,blip.place.location.tileIndex,blip._id,mongoDupError);
      receivedBlipsInsert(listenerId2,blip.place.location.tileIndex,blip._id,undefined,[{_id:rblipId}]);

      pushNotifyUsersNearBlip([listenerId2],blip);
      
      blipManager.distributeBlipToListeners(
        blipId,
        true,
        callbackExpects(done,undefined,resultsMatch([[listenerId1,0],[listenerId2,1]])));
    });

    it("should return errors in the results when specific upserts fail",function (done) {
      blipFound(blip);

      listenNetworkManagerFindListeners([listenerId1,listenerId2]);
      
      var mongoError =new Error("mongo gives us an error");
      receivedBlipsInsert(listenerId1,blip.place.location.tileIndex,blip._id,
                                 mongoError);
      receivedBlipsInsert(listenerId2,blip.place.location.tileIndex,blip._id,
                                 undefined,[{_id:rblipId}]);

      pushNotifyUsersNearBlip([listenerId2],blip);

      blipManager.distributeBlipToListeners(
        blipId,
        true,
        callbackExpects(done,undefined,resultsMatch([[listenerId1,mongoError],[listenerId2,1]])));
    });


    it("should return a mongoFailed error when blipFound fails",function (done) {
      blipFoundError(blip);
      
      listenNetworkManagerFindListenersNever();
      receivedBlipsInsertNever();
      pushNotifyUsersNearBlipNever();

      blipManager.distributeBlipToListeners(
        blipId,
        true,
        callbackExpectsErrorType(done,BBError.mongoFailed.type));
    });

    it("should return a mongoFailed error when db fails during listenNetworkManager",function (done) {
      blipFound(blip);
      
      listenNetworkManagerFindListenersError();
      receivedBlipsInsertNever();
      receivedBlipsInsertNever();

      blipManager.distributeBlipToListeners(
        blipId,
        true,
        callbackExpectsErrorType(done,BBError.mongoFailed.type));
    });


  });

  describe("#getReceivedBlips",function () {
    var userId = ObjectID("000000000000000000000000");
    var blipId1 = ObjectID("111111111111111111111111");
    var blipId2 = ObjectID("222222222222222222222222");
    var blipId3 = ObjectID("333333333333333333333333");
    var blip1 = { _id: blipId1, message: "blip1" };
    var blip2 = { _id: blipId2, message: "blip2" };
    var blip3 = { _id: blipId3, message: "blip3" };
    var blip1Result = { _id: blipId1, message: "blip1", isRead:false };
    var location = { latitude:-123,longitude:34};
    function receivedBlipsFind(error,array) {
      sandbox.mock(mongo.receivedBlips).expects('find') 
        .returns({sort:function() {
          return toArrayWithArgs(error,array) }});
    }

    function receivedBlipsFindNever() {
      sandbox.mock(mongo.receivedBlips).expects('find').never();
    }

    function blipsFind(error,blipDocs) {
      sinon.mock(mongo.blips).expects('find')
        .returns(toArrayWithArgs(error,blipDocs));
    }

    function blipsFindNever() {
      sinon.mock(mongo.blips).expects('find').never();
    }

    function decorateBlips() { 
      sandbox.stub(channelManager, 'decorateChannelsForBlipsCallback', function (listenerId, callback) { 
        function decorate(blips) { 
          callback(undefined, blips);
        }
        return mongo.mongoHandler("decoratChannelsForBlips", callback, decorate);
      });

      sandbox.stub(topicManager, 'decorateBlipsWithTopics', function (callback) { 
        function decorate(blips) { 
          callback(undefined, blips);
        }
        return mongo.mongoHandler("decorateBlipsWithTopics", callback, decorate);
      });
    }
    
    function copyObject(o) {
      var copy = {};
      for (var key in o) {
        copy[key] = o[key];
      }
      return copy;
    }

    it ("should return the blips in the order provided in the receivedBlipsQueue", function (done) {
      // blipIds are returned in unread and recent-first order (3,2,1) 
      receivedBlipsFind(undefined,
                        [{blip:blipId3, isRead:false},
                         {blip:blipId2, isRead:false},
                         {blip:blipId1, isRead:true}]); 
      // blips are found in random (3,1,2) order
      blipsFind(undefined,[blip3,blip1,blip2]);  
      var blip1Found = copyObject(blip1); blip1Found.isRead=true;
      var blip2Found = copyObject(blip2); blip2Found.isRead=false;
      var blip3Found = copyObject(blip3); blip3Found.isRead=false;

      decorateBlips();

      // blipManager returns blips in most-recent first order (3,2,1) order:
      blipManager.getReceivedBlips(userId,
                                   {location:location},
                                   callbackExpects(done,undefined,[blip3Found,blip2Found,blip1Found]));
    });

    it ("should return no blips if there are no receivedBlipsQueue", function (done) {
      // blipIds are returned in recent-first order (3,2,1) 
      receivedBlipsFind(undefined, []);
      blipsFindNever();     
      decorateBlips();

      // blipManager returns blips in most-recent first order (3,2,1) order:
      blipManager.getReceivedBlips(userId,
                                   {location:location},
                                   callbackExpects(done,undefined,[]));
    });

    it("should return a validation error if userId is not a valid ObjectID", function (done) {
      receivedBlipsFindNever(); 
      blipsFindNever();  
      decorateBlips();

      blipManager.getReceivedBlips("invalidObjectID",
                                   {location:location},
                                   callbackExpectsErrorType(done,BBError.validationError.type));
    });

    it("should return an empty list if no receivedBlips are present", function (done) {
      receivedBlipsFind(undefined,[]); 
      blipsFindNever();  
      decorateBlips();

      blipManager.getReceivedBlips(userId,
                                   {location:location},
                                   callbackExpects(done,undefined,[]));
    });

    it("should return a mongo failed error if receivedBlips.find fails", function (done) {
      receivedBlipsFind(new Error("mongo error of some kind")); 
      blipsFindNever();
      decorateBlips();

      blipManager.getReceivedBlips(userId,
                                   {location: location},
                                   callbackExpectsErrorType(done,BBError.mongoFailed.type));
    });

    it("should return a mongo failed error if blip fails", function (done) {
      receivedBlipsFind(undefined,
                         [{blip:blipId3},
                          {blip:blipId2},
                          {blip:blipId1}]); 
      blipsFind(new Error("mongo error"));
      decorateBlips();

      blipManager.getReceivedBlips(userId,
                                   {location: location},
                                   callbackExpectsErrorType(done,BBError.mongoFailed.type));
    });

    it("should return remove missing blips from the result set", function (done) {
      receivedBlipsFind(undefined,
                        [{blip:blipId3, isRead:false},
                         {blip:blipId2, isRead:false},
                         {blip:blipId1, isRead:true}]); 

      blipsFind(undefined,[blip2,blip3]);  
      var blip1Found = copyObject(blip1); blip1Found.isRead=true;
      var blip2Found = copyObject(blip2); blip2Found.isRead=false;
      var blip3Found = copyObject(blip3); blip3Found.isRead=false;
      decorateBlips();

      blipManager.getReceivedBlips(userId,
                                   {location: location},
                                   callbackExpects(done,undefined,[blip3Found,blip2Found]));
    });
    
  });

  describe("#markIncomingBlipsReceived", function () {
    var userId = ObjectID("000000000000000000000000");
    var blipId1 = ObjectID("111111111111111111111111");
    var blipId2 = ObjectID("222222222222222222222222");
    var blipId3 = ObjectID("333333333333333333333333");
    var blip1 = { _id: blipId1, message: "blip1" };
    var blip2 = { _id: blipId2, message: "blip2" };
    var blip3 = { _id: blipId3, message: "blip3" };
    var location = {latitude: 34, longitude: -124};
    var tileIndex = mongo.tile(location).toIndex();

    var receivedBlipsUpdate = function receivedBlipsUpdate(yieldError,yieldValue) {
      return receivedBlipsMock.expects('update')
        .yields(yieldError,yieldValue);
    }

    var receivedBlipsUpdateNever = function receivedBlipsUpdateNever() {
      receivedBlipsMock.expects('update').never();
    }

    it("returns a validation error if an invalid userId is provided", function (done) {
      receivedBlipsUpdateNever();
      blipManager.markReceivedBlipsRead("invalid id", null, location,
                                        callbackExpectsErrorType(done,BBError.validationError.type));

    });

    it("returns a validation error if an invalid location is provided", function (done) {
      receivedBlipsUpdateNever();
      blipManager.markReceivedBlipsRead(userId, null, {latitude:"invalid"},
                                        callbackExpectsErrorType(done,BBError.validationError.type));

    });

    it("returns a mongo error on failure to update receivedBlips", function (done) {
      receivedBlipsUpdate(new Error("mongo error"));
      blipManager.markReceivedBlipsRead(userId, null, location,
                                        callbackExpectsErrorType(done,BBError.mongoFailed.type));

    });

    it("callsback with 0 if no unread blips were updated", function (done) {
      receivedBlipsUpdate(null,0);
      blipManager.markReceivedBlipsRead(userId, null, location,
                                        callbackExpects(done,null,0));

    });

    it("callsback with N for number of blips marked read", function (done) {
      receivedBlipsUpdate(null,10);

      blipManager.markReceivedBlipsRead(userId, null, location,
                                        callbackExpects(done,null,10));

    });

  });
});

