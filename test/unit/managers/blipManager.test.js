/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview unit tests for the channelRankManager
 *           
 * @author aneil@blipboard.com
 */

var assert = require('assert');
var moment = require('moment');
var should = require('should');
var sinon = require('sinon');
var config = require('../../../config');
var BBError = require('../../../lib/error').BBError;
var blipManager = require('../../../managers/blipManager');
var channelManager = require('../../../managers/channelManager');
var js = require('../../../lib/javascript');
var mongo = require('../../../lib/mongo');
var mongoFaker = require('../mongoFaker');
var notificationManager = require('../../../managers/notificationManager');
var topicManager = require('../../../managers/topicManager');
var pushnot = require('../../../lib/pushnot');
var toArrayWithArgs = require('../mongoFaker').toArrayWithArgs;
var validate = require('../../../managers/validate');


var matchEquals = function (x) {
  return sinon.match(function(y) {
    return y==x || y.equals(x);
  }, "should equal "+x.toString());
};

describe("blipManager",function () {
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


  describe("#distributeBlipsOnTuneIn",function() {
    var channelId = mongo.ObjectID("000000000000000000000000");
    var listenerId = mongo.ObjectID("111111111111111111111111");
    var blipId1 = mongo.ObjectID("222222222222222222222222");
    var blipId2 = mongo.ObjectID("333333333333333333333333");
    var blipId3 = mongo.ObjectID("444444444444444444444444");
    var place = { _id:mongo.ObjectID("555555555555555555555555"),
                  type:config.MONGO.channelType.place,
                  location:{tileIndex:"123123123123",latitude:123,longitude:30}};
    var makeBlip = function makeBlip(blipId,author,place) {
      return {_id:blipId,author:author,place:place,createdTime:new Date(),expiryTime:null};
    };
    it("should distribute 1 blip for a place channel", function (done) {
      var channelsMock = sandbox.mock(mongo.channels);
      var blipsMock= sandbox.mock(mongo.blips);
      var receivedMock = sandbox.mock(mongo.receivedBlips);

      var author= { _id:channelId,
                      type:config.MONGO.channelType.place };
      channelsMock.expects('findOne').once().yields(null,author);
      blipsMock.expects('find').once()
          .withArgs(sinon.match.any,sinon.match(function (x) {
                    return x.limit.equals(config.TUNE_IN_DISTRIBUTION.placeBlipLimit); }))
          .returns(toArrayWithArgs(null,[makeBlip(blipId1,author,place)]));
      receivedMock.expects('update').once().yields(null,1);
      blipManager.distributeBlipsOnTuneIn(channelId,listenerId,function (error, result) {
        should.not.exist(error);
        done();
      });
    });

    it("should test sinon",function () {
      var mod= {fn:function() {}};
      mod.fn();
      var m = sinon.mock(mod);
      m.expects('fn').withArgs(sinon.match(function(x) { return x==1;}));
      m.expects('fn').withArgs(sinon.match(function(x) { return x==2;}));
      mod.fn(1);
      mod.fn(2);
    });
    it("should distribute multiple blips for a user channel", function(done) {
      var channelsMock = sandbox.mock(mongo.channels);
      var blipsMock= sandbox.mock(mongo.blips);
      var receivedMock = sandbox.mock(mongo.receivedBlips);
      
      var author= { _id:channelId,
                    type:config.MONGO.channelType.user };
      channelsMock.expects('findOne').once().yields(null,author);
      blipsMock.expects('find').once()
          .withArgs(sinon.match.any,sinon.match(function (x) {
              return x.limit.equals(config.TUNE_IN_DISTRIBUTION.placeBlipLimit); }))
          .returns(toArrayWithArgs(null,[ makeBlip(blipId1,author,place),
                                          makeBlip(blipId2,author,place),
                                          makeBlip(blipId3,author,place)]));
      var matchBlipId = function matchBlipId(id) {
        return sinon.match(function(o) {
          var result = o.blip.equals(id);
          console.log(o.blip.toString()+"=?="+id.toString()+" "+result.toString());
          return result;
        });
      };
      var matchReceivedDoc = function matchReceivedDoc(blipId) {
        return sinon.match(function(o) {
          var result = o.user.equals(listenerId) &&
                 o.blip.equals(blipId) &&
                 o.author.equals(authorId);
          return result;
        });
      }
      receivedMock.expects('update')
          .withArgs(matchBlipId(blipId1),
                    matchReceivedDoc(blipId1)).once()
          .yields(null,1);
      receivedMock.expects('update')
          .withArgs(matchBlipId(blipId2),
                    matchReceivedDoc(blipId2)).once()
          .yields(null,1);
      receivedMock.expects('update')
          .withArgs(matchBlipId(blipId3),
                    matchReceivedDoc(blipId3)).once()
          .yields(null,1);
      blipManager.distributeBlipsOnTuneIn(channelId,listenerId,function (error, result) {
        should.not.exist(error);
        done();
      });
    });
  });


  describe("#like()", function () {

    function testLikeFail(channel, blip, done) {
      // use atMost since in some cases these can be short-circuited by a failure
      sandbox.mock(mongo.channels).expects('findOne').atMost(1).yields(channel.error, channel.result);
      sandbox.mock(mongo.blips).expects('findOne').atMost(1).yields(blip.error, blip.result);

      blipManager.like(blip.id, channel.id, function(error, likes) {
        should.not.exist(likes);
        should.exist(error);
        error.type.should.equal(BBError.validationError.type);
        process.nextTick(function () {
          sandbox.verify();
          done();
        });
      });
    }

    
    it("should return error with missing blipId", function(done) {
      testLikeFail({id: authorId, error: null, result: {_id:authorId,name:"author"}}, 
                   {id: blipId, error:null, result:null}, 
                   done);
    });
    
    it("should return error with invalid blipId", function(done) {    
      testLikeFail({id: authorId, error: null, result: {_id:authorId,name:"author"}}, 
                   {id: "invalid", error:null, result:null}, 
                   done);
    });
    
    it("should return error with missing userId", function(done) {
      testLikeFail({id: authorId, error: null, result: null}, 
                   {id: blipId, error:null, result:{_id:blipId}},
                   done);
    });

    it("should return error with invalid userId", function(done) {    
      testLikeFail({id: "invalid", error: null, result: null},
                   {id: blipId, error:null, result:{_id:blipId}},
                   done);
    });

    function testLikeSet(liker, blip, updatedBlip, done) {
      //console.log("blip=" + JSON.stringify(blip,null,1));
      sandbox.mock(mongo.channels).expects('findOne').yields(liker.error, liker.result);
      sandbox.mock(mongo.channels).expects('update').once().withArgs({_id: authorId}, {$inc: {'stats.score': 1}}).yields(null);
      
      var mb = sandbox.mock(mongo.blips);
      mb.expects('findOne').yields(blip.error, blip.result);
      mb.expects('findAndModify').yields(updatedBlip.error, updatedBlip.result);
      mb.expects('update').yields(null, updatedBlip.result);

      sandbox.mock(notificationManager).expects('makeNewLikeNotification').once().yields(null);

      blipManager.like(blip.id, updatedBlip.id, function(error, likes) {
        should.not.exist(error);
        should.exist(likes);
        likes.should.be.an.instanceof(Array);
        likes.should.have.lengthOf(1);
        assert.ok(likes[0].id.equals(authorId));
        assert.ok(likes[0].name === "author");
        assert.ok(likes[0].createdTime === createdTime);
        process.nextTick(function () {
          sandbox.verify();
          done();
        });
      });
    }

    it("should add a single liker", function(done) {    
      testLikeSet({id: authorId, error:null, result:{_id:authorId, name:"author"}},
                  {id: blipId, error:null, result:{_id:blipId, 
                                                   author: {_id: authorId, type: "user"}, 
                                                   place: place,
                                                   likes:[]}},
                  {id: blipId, error:null, result:{_id:blipId, 
                                                   author: {_id: authorId, type: "user"},
                                                   place: place,
                                                   createdTime:createdTime, 
                                                   likes:[{id:authorId,name:"author",createdTime:createdTime}]}},
                  done);
    });

  });

  
  // function broadcast(authorId, placeId, topicIds, message, expiryTime, notify, callback)
  describe("#broadcast()", function () {
    it("should fail with invalid authorid", function (done) {
      
      var channels = sandbox.stub(mongo.channels, 'findOne');
      channels.withArgs({_id: invalidId}).yields(null,null);
      channels.withArgs({_id: placeId}).yields(null,{_id: placeId});
      channels.withArgs({_id: []}).yields(null,null);

      sandbox.mock(mongo.blips).expects("insert").never();
      
      blipManager.broadcast({authorId: invalidId, 
                             placeId: placeId, 
                             topicIds: [], 
                             message: message, 
                             expiryTime: expiryTime, 
                             alert: false},
                            function(error, blip) {
                              should.exist(error);
                              should.not.exist(blip);
                              error.type.should.equal(BBError.validationError.type);
                              process.nextTick(function () {
                                sandbox.verify();
                                done();
                              });
                            });
    });

    it("should fail with invalid placeid", function(done) {
      var channels = sandbox.stub(mongo.channels, 'findOne');
      channels.withArgs({_id: authorId}).yields(null, {_id: authorId});
      channels.withArgs({_id: invalidId}).yields(null, null);
      sandbox.mock(mongo.blips).expects("insert").never();

      blipManager.broadcast({authorId: authorId, 
                             placeId: invalidId, 
                             topicIds: [], 
                             message: message, 
                             expiryTime: expiryTime, 
                             alert: false},
                            function(error, blip) {
                              should.exist(error);
                              should.not.exist(blip);
                              error.type.should.equal(BBError.validationError.type);
                              process.nextTick(function () {
                                sandbox.verify();
                                done();
                              });
                            });
    });
    
    it("should fail with missing message", function(done) {
      var channels = sandbox.stub(mongo.channels, 'findOne');
      channels.withArgs({_id: authorId}).yields(null, {_id: authorId});
      channels.withArgs({_id: placeId}).yields(null, {_id: placeId});
      sandbox.mock(mongo.blips).expects("insert").never();

      blipManager.broadcast({authorId: authorId, 
                             placeId: placeId, 
                             topicIds: [], 
                             message: "", 
                             expiryTime: expiryTime, 
                             alert: false},
                            function(error, blip) {
                              should.exist(error);
                              should.not.exist(blip);
                              error.type.should.equal(BBError.validationError.type);
                              process.nextTick(function () {
                                sandbox.verify();
                                done();
                              });
                            });
    });
    
    it("should fail with whitespace message", function(done) {
      var channels = sandbox.stub(mongo.channels, 'findOne');
      channels.withArgs({_id: authorId}).yields(null, {_id: authorId});
      channels.withArgs({_id: placeId}).yields(null, {_id: placeId});
      sandbox.mock(mongo.blips).expects("insert").never();

      blipManager.broadcast({authorId: authorId, 
                             placeId: placeId, 
                             topicIds: [], 
                             message: "\n\n     \t\n", 
                             expiryTime: expiryTime, 
                             alert: false},
                            function(error, blip) {
                              should.exist(error);
                              should.not.exist(blip);
                              error.type.should.equal(BBError.validationError.type);
                              process.nextTick(function () {
                                sandbox.verify();
                                done();
                              });
                            });
    });
    
    
      
    it("should fail validation if unparseable expiry passed in", function(done) { 
      var channels = sandbox.stub(mongo.channels, 'findOne');
      channels.withArgs({_id: authorId}).yields(null, {_id: authorId});
      channels.withArgs({_id: placeId}).yields(null, {_id: placeId});
      sandbox.mock(mongo.blips).expects("insert").never();

      blipManager.broadcast({authorId: authorId, 
                             placeId: placeId, 
                             topicIds: [], 
                             message: message, 
                             expiryTime: "bad-expiry", 
                             alert: false},
                            function(error, blip) {
        should.exist(error);
        should.not.exist(blip);
        error.type.should.equal(BBError.validationError.type);
        process.nextTick(function () {
          sandbox.verify();
          done();
        });
      });
    });

    it("should use default 30 day expiry if none passed in", function(done) { 
      var channels = sandbox.stub(mongo.channels, 'findOne');
      channels.withArgs({_id: authorId, blacklisted: {$ne: true}}).yields(null, {_id: authorId});
      channels.withArgs({_id: placeId,type:mongo.channelType.place}).yields(null, {_id: placeId});

      var chmock = sandbox.mock(mongo.channels);
      chmock.expects('update').once().withArgs({_id: authorId}, {$inc: {'stats.score': 1}}).yields(null);
      chmock.expects('update').once().withArgs({_id: authorId}, {$inc: {'stats.blips': 1}}).yields(null);
      chmock.expects('update').once().withArgs({_id: placeId}, {$inc: {'stats.blips': 1}}).yields(null);
      
      sandbox.mock(mongo.blips).expects("insert")
        .yields(null, [{_id: blipId, message: message, author: {_id: authorId, name: "author"}, place: {_id: placeId}}]);
      
      // yield an error so distribution doesn't happen
      sandbox.mock(mongo.blips).expects("findOne").yields("error"); 
      sandbox.stub(channelManager, 'decorateChannelsForBlipsCallback', function (listenerId, callback) { 
        function decorate(blips) { 
          callback(undefined, blips);
        }
        return mongo.mongoHandler("decorateWithIsListening", callback, decorate);
      });
      sandbox.stub(topicManager, 'decorateBlipsWithTopics', function (callback) { 
        function decorate(blips) { 
          callback(undefined, blips);
        }
        return mongo.mongoHandler("decorateBlipsWithTopics", callback, decorate);
      });

      blipManager.broadcast({authorId: authorId, 
                             placeId: placeId, 
                             topicIds: [], 
                             message: message}, 
                            function(error, blip) {
                              should.not.exist(error);
                              should.exist(blip);
                              process.nextTick(function () {
                                sandbox.verify();
                                done();
                              });
                            });
    });
  }); // describe #broadcast
  
  describe("#addComment", function () {
    var blipId = mongo.ObjectID("000000000000000000000000");
    var commentAuthorId = mongo.ObjectID("111111111111111111111111");
    var commentText = "test commentText";
    var blipAuthorId = mongo.ObjectID("222222222222222222222222");
    var newComment = {id:"commentId",
                      author:{_id:commentAuthorId,name:"name",text:commentText}
                     };

    it("should pass when valid inputs are given", function (done) {
      // !am! most of the sunny day case is tested in blip.test.js
      sandbox.mock(notificationManager).expects('makeNewCommentNotification').withArgs(blipAuthorId,blipId).once().yields(null);

      var blipsMock = sandbox.mock(mongo.blips);
      blipsMock.expects('findAndModify')
        .once()
        .yields(null, {_id:blipId,
                       author:{_id:blipAuthorId,name:"blipAuthor"},
                       comments:[newComment]}); // !am! we don't return the comment from the db call!!
      blipsMock.expects('find')
        .returns(toArrayWithArgs(null,
                                 [{_id:blipId,
                                   comments:[newComment]
                                  }]));
      var chmock = sandbox.mock(mongo.channels);
      chmock.expects('findOne').once().yields(null,{_id:commentAuthorId,name:"name"});
      chmock.expects('update').once().withArgs({_id: blipAuthorId}, {$inc: {'stats.score': 1}}).yields(null);

      blipManager.addComment(blipId,commentAuthorId,commentText,function (error,comment) {
        should.not.exist(error);
        should.exist(comment);
        should.exist(comment.id);
        should.exist(comment.author);
        should.exist(comment.text);
        should.exist(comment.createdTime);
        should.exist(comment.author._id);
        comment.author._id.should.equal(commentAuthorId);
        comment.text.should.equal(commentText);
        should.ok(comment.createdTime instanceof Date);
        sandbox.verify();
        done();
      });
    });

    it("should fail when blips.findAndModify gives a db error", function (done) {
      var blipsMock = sandbox.mock(mongo.blips);
      var pushnotMock = sandbox.mock(pushnot);
      pushnotMock.expects('sendPushNotification').never();
      blipsMock.expects('findAndModify')
        .once()
        .yields(new Error("a mongo error of some kind"));
      blipsMock.expects('find')
        .returns(toArrayWithArgs(null,
                                 [{_id:blipId,
                                   comments:[newComment]
                                  }]));
      sandbox.mock(mongo.channels)
        .expects('findOne')
        .once()
        .yields(null,{_id:commentAuthorId,name:"name"});

      blipManager.addComment(blipId,commentAuthorId,commentText,function (error,comment) {
        should.exist(error);
        should.not.exist(comment);
        should.exist(error.type);
        error.type.should.equal(BBError.mongoFailed.type);
        sandbox.verify();
        done();
      });
    });
  });

  describe("#blipPopularity", function () {
    it("returns a higher value for a blip with more likes ", function () {
      var time = new Date();
      should.ok(blipManager.blipPopularity({author: {type: 'place'}, likes:[1,2,3], createdTime:time}) >
                blipManager.blipPopularity({author: {type: 'place'}, likes:[1,2], createdTime:time}));

      should.ok(blipManager.blipPopularity({author: {type: 'place'}, likes:[1,2,3,4,5,6], createdTime:time}) >
                blipManager.blipPopularity({author: {type: 'place'}, likes:[], createdTime:time}));

      should.ok(blipManager.blipPopularity({author: {type: 'place'}, likes:[1], createdTime:time}) >
                blipManager.blipPopularity({author: {type: 'place'}, likes:[], createdTime:time}));

      should.ok(blipManager.blipPopularity({author: {type: 'place'}, likes:[], createdTime:time}) ===
                blipManager.blipPopularity({author: {type: 'place'}, likes:[], createdTime:time}));
    });
    it("returns the same value for a blip with more FB likes ", function () {
      var time = new Date();
      should.ok(blipManager.blipPopularity({author: {type: 'place'}, facebook: {likeCount:3},createdTime:time}) ===
                blipManager.blipPopularity({author: {type: 'place'}, facebook: {likeCount:2},createdTime:time}));
    });

    it("returns the same value for a blip with more FB comments ", function () {
      var time = new Date();
      should.ok(blipManager.blipPopularity({author: {type: 'place'}, facebook: {commentCount:99}, createdTime:time}) ===
                blipManager.blipPopularity({author: {type: 'place'}, facebook: {commentCount:98}, createdTime:time}));
      
    });

    it("returns a higher value for a more recent blip ", function () {
      var time1 = new Date();
      var time2 = new Date(time1);
      time2.setMinutes(time1.getMinutes()+30);
      should.ok(blipManager.blipPopularity({author: {type: 'place'}, createdTime:time2}) >
                blipManager.blipPopularity({author: {type: 'place'}, createdTime:time1}));
    });

    it("returns a higher value for a person blip ", function () {
      var time1 = new Date();
      var time2 = new Date(time1);
      time2.setMinutes(time1.getMinutes()+30);
      should.ok(blipManager.blipPopularity({author: {type: 'user'}, createdTime:time1}) >
                blipManager.blipPopularity({author: {type: 'place'}, createdTime:time2}));
    });
  });


  describe("#evaluateEffectiveDate", function () {
    var previousSaturday = moment("2012-01-21 0900 -0800", "YYYY-MM-DD HHmm Z");
    var monday = moment("2012-01-23 0900 -0800", "YYYY-MM-DD HHmm Z");
    var mondayNight = moment("2012-01-23 2000 -0800", "YYYY-MM-DD HHmm Z");
    var saturday = moment("2012-01-28 0900 -0800", "YYYY-MM-DD HHmm Z");

    var mondayEnd = moment("2012-01-23 235959.999 -0800", "YYYY-MM-DD HHmmss.SSS Z");
    var tuesdayEnd = moment("2012-01-24 235959.999 -0800", "YYYY-MM-DD HHmmss.SSS Z");
    var wednesdayEnd = moment("2012-01-25 235959.999 -0800", "YYYY-MM-DD HHmmss.SSS Z");
    var fridayEnd = moment("2012-01-27 235959.999 -0800", "YYYY-MM-DD HHmmss.SSS Z");
    var saturdayEnd = moment("2012-01-28 235959.999 -0800", "YYYY-MM-DD HHmmss.SSS Z");
    var sundayEnd = moment("2012-01-29 235959.999 -0800", "YYYY-MM-DD HHmmss.SSS Z");
    var nextMondayEnd = moment("2012-01-30 235959.999 -0800", "YYYY-MM-DD HHmmss.SSS Z");

    it("tonight -> effective midnight today ", function () {
      var blip = { createdTime: moment(monday).toDate(), message: "Check out the club tonight!" };
      blipManager.evaluateEffectiveDate(blip);
      //console.log("blip=" + js.pp(blip));
      blip.effectiveDate.valueOf().should.equal(mondayEnd.toDate().valueOf());
      blip.expiryTime.valueOf().should.equal(mondayEnd.toDate().valueOf());      
    });

    it("tonite -> effective midnight today ", function () {
      var blip = { createdTime: moment(monday).toDate(), message: "Check out the club tonite!" };
      blipManager.evaluateEffectiveDate(blip);
      //console.log("blip=" + js.pp(blip));
      blip.effectiveDate.valueOf().should.equal(mondayEnd.toDate().valueOf());
      blip.expiryTime.valueOf().should.equal(mondayEnd.toDate().valueOf());      
    });


    it("today -> effective midnight today ", function () {
      var blip = { createdTime: moment(monday).toDate(), message: "Check out the club today!!" };
      blipManager.evaluateEffectiveDate(blip);
      blip.effectiveDate.valueOf().should.equal(mondayEnd.toDate().valueOf());
      blip.expiryTime.valueOf().should.equal(mondayEnd.toDate().valueOf());      
    });

     
    it("tomorrow -> effective midnight tomorrow ", function () {
      var blip = { createdTime: moment(monday).toDate(), message: "Check out the club tomorrow night!!" };
      blipManager.evaluateEffectiveDate(blip);
      blip.effectiveDate.valueOf().should.equal(tuesdayEnd.toDate().valueOf());
      blip.expiryTime.valueOf().should.equal(tuesdayEnd.toDate().valueOf());      
    });
    
    it("this weekend -> effective next Friday night (created Monday)", function () {
      var blip = { createdTime: moment(monday).toDate(), message: "Check out the club this weekend!!" };
      blipManager.evaluateEffectiveDate(blip);
      blip.effectiveDate.valueOf().should.equal(sundayEnd.toDate().valueOf());
      blip.expiryTime.valueOf().should.equal(sundayEnd.toDate().valueOf());      
    });

    it("this weekend -> effective next Friday night (created Saturday)", function () {
      var blip = { createdTime: moment(saturday).toDate(), message: "Check out the club this weekend!!" };
      blipManager.evaluateEffectiveDate(blip);
      blip.effectiveDate.valueOf().should.equal(sundayEnd.toDate().valueOf());
      blip.expiryTime.valueOf().should.equal(sundayEnd.toDate().valueOf());      
    });

    it("Monday -> effective Monday (created Monday)", function () {
      var blip = { createdTime: moment(monday).toDate(), message: "Check out the club Monday!!" };
      blipManager.evaluateEffectiveDate(blip);
      //console.log("blip=" + js.pp(blip));
      blip.effectiveDate.valueOf().should.equal(mondayEnd.toDate().valueOf());
      blip.expiryTime.valueOf().should.equal(mondayEnd.toDate().valueOf());      
    });

    it("Monday -> effective Monday (created Monday night)", function () {
      var blip = { createdTime: moment(mondayNight).toDate(), message: "Check out the club Monday!!" };
      blipManager.evaluateEffectiveDate(blip);
      //console.log("blip=" + js.pp(blip));
      blip.effectiveDate.valueOf().should.equal(mondayEnd.toDate().valueOf());
      blip.expiryTime.valueOf().should.equal(mondayEnd.toDate().valueOf());      
    });

    it("Monday -> effective Monday (created Saturday)", function () {
      var blip = { createdTime: moment(saturday).toDate(), message: "Check out the club Monday!!" };
      blipManager.evaluateEffectiveDate(blip);
      blip.effectiveDate.valueOf().should.equal(nextMondayEnd.toDate().valueOf());
      blip.expiryTime.valueOf().should.equal(nextMondayEnd.toDate().valueOf());      
    });

    it("Friday -> effective next Friday (created Saturday)", function () {
      var blip = { createdTime: moment(previousSaturday).toDate(), message: "Check out the club next Friday!!" };
      blipManager.evaluateEffectiveDate(blip);
      blip.effectiveDate.valueOf().should.equal(moment(fridayEnd).toDate().valueOf());
      blip.expiryTime.valueOf().should.equal(moment(fridayEnd).toDate().valueOf());
    });


    it("Thanks -> effective date and expiry date = Date(0)", function () {
      var blip = { createdTime: moment(previousSaturday).toDate(), message: "Many thanks to those who came out on Friday!!" };
      blipManager.evaluateEffectiveDate(blip);
      blip.effectiveDate.valueOf().should.equal(new Date(0));
      blip.expiryTime.valueOf().should.equal(new Date(0));
    });

    it("Congrats -> effective date and expiry date = Date(0)", function () {
      var blip = { createdTime: moment(previousSaturday).toDate(), message: "Many congrats to those who came out on Friday!!" };
      blipManager.evaluateEffectiveDate(blip);
      blip.effectiveDate.valueOf().should.equal(new Date(0));
      blip.expiryTime.valueOf().should.equal(new Date(0));
    });


    it("Congratulations -> effective date and expiry date = Date(0)", function () {
      var blip = { createdTime: moment(previousSaturday).toDate(), message: "Many congratulations to those who came out on Friday!!" };
      blipManager.evaluateEffectiveDate(blip);
      blip.effectiveDate.valueOf().should.equal(new Date(0));
      blip.expiryTime.valueOf().should.equal(new Date(0));
    });


    it("Last (day) -> effective date and expiry date = Date(0)", function () {
      var blip = { createdTime: moment(previousSaturday).toDate(), message: "Something happened last friday!!" };
      blipManager.evaluateEffectiveDate(blip);
      blip.effectiveDate.valueOf().should.equal(new Date(0));
      blip.expiryTime.valueOf().should.equal(new Date(0));
    });

  });
});
  