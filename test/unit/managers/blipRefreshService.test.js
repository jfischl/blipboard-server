/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview unit tests for the blipDistributionService
 *           
 * @author aneil@blipboard.com
 */
"use strict";

// external modules
var sinon = require('sinon');
var should = require('should');
var sets = require('simplesets');

// test modules
var mongoFaker = require('../mongoFaker');
var toArrayWithArgs = mongoFaker.toArrayWithArgs;
var criterionMatcher = mongoFaker.criterionMatcher;

// lib modules
var BBError = require('../../../lib/error').BBError;
var mongo = require('../../../lib/mongo');
var ObjectID = mongo.ObjectID;
var classOf = require('../../../lib/javascript').classOf;
var facebook = require('../../../lib/facebook');

// manager mondules
var validate = require('../../../managers/validate');
var blipManager = require('../../../managers/blipManager');
var listenNetworkManager = require('../../../managers/listenNetworkManager');
var blipNotificationService = require('../../../managers/blipNotificationService');
var channelManager = require('../../../managers/channelManager');
var blipRefreshService = require('../../../managers/blipRefreshService');

describe("blipRefreshService",function () {
  var sandbox;
  var receivedBlipsMock;
  var blipNotificationServiceMock;
  var channelManagerMock;
  var listenNetworkManagerMock; 
  var blipManagerMock;
  var facebookMock;
  var channelsMock;
  var placeChannel = { type:mongo.channelType.place,
                       facebook: { id: "12345678" },
                       _id: ObjectID("000000000000000000000000") };

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
    blipNotificationServiceMock = sandbox.mock(blipNotificationService);
    listenNetworkManagerMock = sandbox.mock(listenNetworkManager);
    facebookMock = sandbox.mock(facebook);
    channelsMock = sandbox.mock(mongo.channels);
    blipManagerMock = sandbox.mock(blipManager);
    channelManagerMock = sandbox.mock(channelManager);
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe("#loadBlips(channelId)", function () {
    var fbPosts = require('./mmbbq.blips.fb.json');
    var listenerId1 = ObjectID("111111111111111111111111");
    var listenerId2 = ObjectID("222222222222222222222222");
    fbPosts[0].notify=true;

    it("should call broadcastFacebookPost for each facebook post", function (done) {
      facebookMock.expects('getPosts').once().yields(undefined,fbPosts);
      channelsMock.expects('findOne').once().yields(undefined,placeChannel);
      channelManagerMock.expects('updateRefreshTime').once().yields();

      fbPosts.forEach(function (post) {
        blipManagerMock.expects('broadcastFacebookPost')
          .withArgs(placeChannel.facebook.id,post,post.notify)
          .yields(undefined,"not used");
      });
      blipRefreshService.loadBlips(placeChannel._id, callbackExpects(done, null, fbPosts.length));

    });
  });
});