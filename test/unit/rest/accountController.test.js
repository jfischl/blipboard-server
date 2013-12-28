/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 * @fileoverview unit tests for the channelRankManager
 */

var sinon = require('sinon');
var should = require('should');
var assert = require('assert');

var BBError = require('../../../lib/error').BBError;
var accountController = require('../../../rest/accountController');
var className = require('../../../lib/javascript').className;
var graphite = require('../../../lib/graphite');
var js = require('../../../lib/javascript');
var mongo = require('../../../lib/mongo');
var resource = require('../../../rest/resource');
var notificationManager = require('../../../managers/notificationManager');
var notificationType = require('../../../config').MONGO.notificationType;
var userManager = require('../../../managers/userManager');

describe("accountController",function () {
  var sandbox;
  var invalidId = "foo";
  var authorId = mongo.ObjectID("000000000000000000000000");
  var placeId  = mongo.ObjectID("111111111111111111111111");
  var blipId  = mongo.ObjectID("222222222222222222222222");
  var aliceId  = mongo.ObjectID("333333333333333333333333");
  var bobId  = mongo.ObjectID("444444444444444444444444");
  var not1Id  = mongo.ObjectID("555555555555555555555555");
  var not2Id  = mongo.ObjectID("666666666666666666666666");

  var topics = [];
  var message = "blip";
  var createdTime = new Date(2012,1,1,0,0,0);// 1/1/12 00:00
  var expiryTime = new Date(2012,1,1);

  var author = { _id: authorId, 
                 displayName: "Author",
                 type: 'user',
                 password: "password",
                 email: "author@foo.com"
               };

  var listener1 = { _id: bobId,
                    displayName: 'Bob',
                    type: 'user', 
                    password: "password",
                    email: "bob@foo.com",
                    lastReadNotificationId: undefined};
  var not1 = { _id: not1Id, 
               userId: authorId, 
               time: createdTime,
               type: notificationType.tunein,
               isNew: true,
               listenerId: listener1._id
             };
  
  var not2 = { _id: not2Id, 
               userId: authorId, 
               time: createdTime,
               type: notificationType.tunein,
               isNew: false,
               listenerId: listener1._id
             };

  var emptyPaging = { next: null, prev: null};

  beforeEach(function () {
    sandbox = sinon.sandbox.create();
  });

  afterEach(function () {
    sandbox.verify();
    sandbox.restore();
  });

  describe("resource.arrayToDictionary()", function() { 
    it("should convert an array to dictionary", function(done) { 
      var arr = [{id: "1", foo: "foo1", bar: "bar"}, {id: "2", a: "a", b: "b"}];
      var dict = {}; 
      resource.arrayToDictionary(dict, 'channels', arr);
      console.log(js.pp(dict));
      dict.should.have.property('channels');
      dict.channels.should.have.property("1");
      dict.channels.should.have.property("2");
      done();
    });
  });

  describe("getNotifications()", function () {
    it("should yield a properly formatted list of tune-in notifications", function(done) {
      var yields = { data: [not1],  blips: [], channels: [author, listener1], paging: emptyPaging };
      sandbox.mock(notificationManager).expects('getNotifications').yields(null, yields);
      
      var request = { user: { _id: aliceId }, page: "page" };
      accountController.api.getNotifications(request, function (error, result) {
        console.log("result=" + js.pp(result));
        should.not.exist(error);
        should.exist(result);
        result.should.have.property('notifications');
        result.notifications.should.have.property('paging');
        result.notifications.should.have.property('data').with.lengthOf(1);
        result.notifications.data[0].should.have.property('userId', authorId.toString());
        result.notifications.data[0].should.have.property('isNew', true);

        process.nextTick(function() { sandbox.verify(); });
        done();
      });
    });
  });

  describe("acknowledgeNotifications()", function() { 
    it("should yield a properly formatted list of tune-in notifications", function(done) {
      not1.isNew = false;
      var yields = { data: [ not2 ],  blips: [], channels: [], paging: emptyPaging };
      sandbox.mock(notificationManager).expects('acknowledgeNotifications').yields(null, yields);
      
      var request = { 
        param: function param() { 
          return not2._id;
        },
        user: { _id: aliceId }, page: "page"};
      accountController.api.acknowledgeNotifications(request, function (error, result) {
        //console.log("result=" + js.pp(result));
        should.not.exist(error);
        should.exist(result);
        result.should.have.property('notifications');
        result.notifications.should.have.property('paging');
        result.notifications.should.have.property('data').with.lengthOf(1);
        result.notifications.data[0].should.have.property('userId', authorId.toString());
        result.notifications.data[0].should.have.property('isNew', false);

        process.nextTick(function() { sandbox.verify(); });
        done();
      });
    });
  });
});
