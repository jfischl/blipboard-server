/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview User manager unit test
 * @author vladimir@blipboard.com
 *
 * @created Thu, Mar 01 2012 - 23:27:25 -0800
 * @updated Fri, Mar 02 2012 - 09:45:26 -0800
 */

var sinon = require('sinon');
var mongoFaker = require('../mongoFaker');
var objectIDMatcher = mongoFaker.objectIDMatcher;
var criterionMatcher = mongoFaker.criterionMatcher;
var mongo = require('../../../lib/mongo');
var should = require('should');
var BBError = require('../../../lib/error').BBError;
var ObjectID = require('../../../lib/mongo').ObjectID;

var userManager = require('../../../managers/userManager');
var blipNotificationService = require('../../../managers/blipNotificationService');
var placeManager = require('../../../managers/placeManager');
var notificationManager = require('../../../managers/notificationManager');
var blipManager = require('../../../managers/blipManager');
var channelEvents = require('../../../managers/channelEvents');
var password = require('../../../lib/password');
var mongoConfig = require('../../../config').MONGO;
var pushnot = require('../../../lib/pushnot');
   
describe('blipNotificationService', function ( ) {
  var sandbox;
  var blipManagerMock;
  var blipsMock;
  var userManagerMock;
  var notificationManagerMock;
  var pushNotMock;
  var receivedBlipsMock;

  beforeEach(function () {
    sandbox = sinon.sandbox.create();
    sandbox.add(mongoFaker.fake());
    blipManagerMock = sandbox.mock(blipManager);
    userManagerMock = sandbox.mock(userManager);
    notificationManagerMock = sandbox.mock(notificationManager);
    pushNotMock = sandbox.mock(pushnot);
    receivedBlipsMock = sandbox.mock(mongo.receivedBlips);
    blipsMock = sandbox.mock(mongo.blips);
  });

  afterEach(function () {
    sandbox.restore();  
  });

  var callbackExpects = function callbackExpects(done,expectedError,expectedValue) {
    var expectation = sandbox.add(sinon.expectation.create('callback'));
    if (expectedValue) {
      expectation.withArgs(expectedError,expectedValue);
    }
    else if (expectedError) {
      expectation.withArgs(expectedError);
    }
    expectation.once();
    return function callback(error,value) {
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

  function callbackValidates(done,fn) {
    return function callback(error,value) {
      setTimeout(function () {
        fn(error,value);
        sandbox.verify();
        done();
      }, 10);
    };
  }

  var expectPushNot = function expectPushNot(userId,count,text) {
    pushNotMock.expects('sendPushNotification')
      .withArgs(objectIDMatcher(userId),count,"arthur naim: test blip")

  };

  var expectPushNotNever = function expectPushNotNever(userId) {
    var e = pushNotMock.expects('sendPushNotification')
    if (userId) {
      e = e.withArgs(objectIDMatcher(userId));
    }
    e.never();
  };

  describe("#pushNotifyUsersNearBlip(userIds,blip,callback)", function() {
    var userId1 = ObjectID("111111111111111111111111");
    var userId2 = ObjectID("222222222222222222222222");
    var userId3 = ObjectID("333333333333333333333333");
    var blipId   = ObjectID("b11111111111111111111111");
    var tileIndex = "123123123123123";
    var place = { _id: userId1, name:"the place",
                  location: {latitude:32,longitude:-129,tileIndex:tileIndex}};
    var author = {_id: userId2, name:"arthur naim"};
    var message = "test blip";
    var blip = {_id:blipId, author:author, place:place,message:message};

    it("should call pushnot.sendNotification when everything works.", function (done) {

      userManagerMock.expects('usersAtTile')
        .once()
        .yields(undefined,
                // only user1 and user2 are at tile
                [userId1,userId2]); // callback results

      receivedBlipsMock.expects('update')
        .withArgs(criterionMatcher({user:{$in:[userId1,userId2]},blip:blipId}))
        .once()
        .yields();

      notificationManagerMock.expects('makeNewBlipNotification')
        .withArgs(userId1).once().yields();
      notificationManagerMock.expects('makeNewBlipNotification')
        .withArgs(userId2).once().yields();

      blipNotificationService.pushNotifyUsersNearBlip([userId1,userId2,userId3],blip,
                                                      callbackExpects(done));
                  
    });

    it("should callback with an error if userManager.usersAtTile fails",function (done) {
      userManagerMock.expects('usersAtTile')
        .once()
        .yields(BBError.mongoFailed());

      receivedBlipsMock.expects('count').never();
      receivedBlipsMock.expects('update').never();

      expectPushNotNever();

      blipNotificationService.pushNotifyUsersNearBlip([userId1,userId2,userId3],blip,
                                                      callbackExpectsErrorType(done,BBError.mongoFailed.type));
    });

    it("should not call pushnot  if userManager.usersAtTile finds no users",function (done) {
      userManagerMock.expects('usersAtTile')
        .once()
        .yields(undefined,
                // only user1 and user2 are at tile
                []); // callback results

      receivedBlipsMock.expects('count').never();
      receivedBlipsMock.expects('update').never();                
      expectPushNotNever();

      blipNotificationService.pushNotifyUsersNearBlip([userId1,userId2,userId3],blip,
                                                      callbackExpects(done));
    });
  });

  describe("#pushNotifyUserAtTile(userId,tileIndex,callback)", function() {
    var userId1 = ObjectID("111111111111111111111111");
    var userId2 = ObjectID("222222222222222222222222");
    var userId3 = ObjectID("333333333333333333333333");
    var blipId   = ObjectID("b11111111111111111111111");
    var tileIndex = "123123123123123";
    var place = { _id: userId1, name:"the place",
                  location: {latitude:32,longitude:-129,tileIndex:tileIndex}};
    var author = {name:"arthur naim", _id: userId2};
    var message = "test blip";
    var blip = {_id:blipId, user: userId1, author:author, place:place,message:message};

    it("should call pushnot.sendNotification when everything works.", function (done) {
      receivedBlipsMock.expects('findAndModify').once().yields(undefined,{blip:blipId});
      blipsMock.expects('findOne').withArgs(criterionMatcher({_id:blipId})).yields(undefined,blip);

      notificationManagerMock.expects('makeNewBlipNotification')
        .withArgs(userId1, blipId).once().yields();

      blipNotificationService.pushNotifyUserAtTile(userId1,tileIndex, callbackExpects(done));            
    });

    it("should do nothing when no blip is available",function (done) {
      receivedBlipsMock.expects('findAndModify').once().yields(undefined,undefined);
      blipsMock.expects('findOne').never();
      notificationManagerMock.expects('makeNewBlipNotification').never();
      
      blipNotificationService.pushNotifyUserAtTile(userId1,tileIndex,
                                                   callbackExpects(done));
    });

    it("should fail if userId is not an objectID",function (done) {
      receivedBlipsMock.expects('findAndModify').never();
      blipsMock.expects('findOne').never();
      receivedBlipsMock.expects('count').never();
      pushNotMock.expects('sendPushNotification').never();

      blipNotificationService.pushNotifyUserAtTile("not an ObjectId",tileIndex,
                                                   callbackExpectsErrorType(done,BBError.validationError.type));
    });

    // it("should fail if tileIndex is not an String",function (done) {
    //   receivedBlipsMock.expects('findAndModify').never();
    //   blipsMock.expects('findOne').never();
    //   receivedBlipsMock.expects('count').never();
    //   pushNotMock.expects('sendPushNotification').never();

    //   blipNotificationService.pushNotifyUserAtTile(userId1,{thisIsNotAString:true},
    //                                                callbackExpectsErrorType(done,BBError.validationError.type));
    // });

    it("should fail if receivedBlips.findAndModify returns an error",function (done) {
      receivedBlipsMock.expects('findAndModify').yields(BBError.mongoFailed());
      blipsMock.expects('findOne').never();
      receivedBlipsMock.expects('count').never();
      pushNotMock.expects('sendPushNotification').never();

      blipNotificationService.pushNotifyUserAtTile(userId1,tileIndex,
                                                   callbackExpectsErrorType(done,BBError.mongoFailed.type));
    });
  }); // describe #pushNotifyUserAtTile

}); //describe