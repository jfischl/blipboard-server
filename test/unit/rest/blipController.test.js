/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 * @fileoverview unit tests for the channelRankManager
 */

var sinon = require('sinon');
var should = require('should');
var assert = require('assert');
var BBError = require('../../../lib/error').BBError;
var blipManager = require('../../../managers/blipManager');
var blipController = require('../../../rest/blipController');
var mongo = require('../../../lib/mongo');
var graphite = require('../../../lib/graphite');

describe("blipController",function () {
  var sandbox;
  var invalidId = "foo";
  var authorId = mongo.ObjectID("000000000000000000000000");
  var placeId  = mongo.ObjectID("111111111111111111111111");
  var blipId  = mongo.ObjectID("222222222222222222222222");
  var aliceId  = mongo.ObjectID("333333333333333333333333");
  var bobId  = mongo.ObjectID("444444444444444444444444");

  var topics = [];
  var message = "blip";
  var createdTime = new Date(2012,1,1,0,0,0);// 1/1/12 00:00
  var expiryTime = new Date(2012,1,1);

  beforeEach(function () {
    sandbox = sinon.sandbox.create();
  });

  afterEach(function () {
    sandbox.verify();
    sandbox.restore();
  });

  describe("getBlip()", function () {
    it("should yield a properly formatted blip with 2 likers including me", function(done) {
      var likes = [{id: aliceId, name:"alice", createdTime: createdTime},
                   {id: bobId, name:"bob", createdTime: createdTime}];
      var yields = {_id: blipId, 
                    author: {_id: authorId, name: "author"},
                    place: {_id: placeId, name: "place"},
                    message: "message",
                    createdTime: createdTime,
                    expiryTime: expiryTime,
                    likes: likes };
      sandbox.mock(blipManager).expects('getBlip').yields(null, yields);
      
      var request = { id: blipId, user: { _id: aliceId } };
      blipController.api.getBlip(request, function (error, result) {
        //console.log("result=" + JSON.stringify(result,null,1));
        should.not.exist(error);
        should.exist(result);
        result.should.have.property('blip');
        result.blip.should.have.property('id', blipId.toString());
        result.blip.author.should.have.property('id', authorId.toString());
        result.blip.place.should.have.property('id', placeId.toString());        
        result.blip.should.have.property('message', "message");
        result.blip.should.have.property('expiryTime', expiryTime);
        result.blip.likes.should.have.property('isLiker', true);
        result.blip.likes.should.have.property('likeCount', 2);
        result.blip.likes.likers[0].should.have.property("id", aliceId.toString());
        result.blip.likes.likers[1].should.have.property("id", bobId.toString());


        process.nextTick(function() { sandbox.verify(); });
        done();
      });
    });

    it("should yield a properly formatted blip with NO likers", function(done) {
      var yields = {_id: blipId, 
                    author: {_id: authorId, name: "author"},
                    place: {_id: placeId, name: "place"},
                    message: "message",
                    createdTime: createdTime,
                    expiryTime: expiryTime,
                    likes: [] };
      sandbox.mock(blipManager).expects('getBlip').yields(null, yields);
      
      var request = { id: blipId, user: { _id: aliceId } };
      blipController.api.getBlip(request, function (error, result) {
        //console.log("result=" + JSON.stringify(result,null,1));
        should.not.exist(error);
        should.exist(result);
        result.should.have.property('blip');
        result.blip.should.have.property('id', blipId.toString());
        result.blip.author.should.have.property('id', authorId.toString());
        result.blip.place.should.have.property('id', placeId.toString());        
        result.blip.should.have.property('message', "message");
        result.blip.should.have.property('expiryTime', expiryTime);
        result.blip.should.have.property('likes');
        result.blip.likes.should.have.property('isLiker', false);
        result.blip.likes.should.have.property('likeCount', 0);
        result.blip.likes.should.have.property('likers').with.lengthOf(0);
        
        process.nextTick(function() { sandbox.verify(); });
        done();
      });
    });

  });


  // describe("getPopularBlips()", function () {
  //   it("should yield an array of properly formatted blips with 1 topic", function(done) {
  //     var yields = [{_id: blipId, 
  //                    author: {_id: authorId, name: "author"},
  //                    place: {_id: placeId, name: "place"},
  //                    message: "message",
  //                    createdTime: createdTime,
  //                    expiryTime: expiryTime,
  //                    topics: [] }];
  //     sandbox.mock(blipManager).expects('getPopularBlips').yields(null, yields);
      
  //     var request = { id: blipId, user: { _id: aliceId } };
  //     blipController.api.getPopularBlips(request, function (error, result) {
  //       //console.log("result=" + JSON.stringify(result,null,1));
  //       should.not.exist(error);
  //       should.exist(result);
  //       result.should.have.property('blip');
  //       result.blip.should.have.property('id', blipId.toString());
  //       result.blip.author.should.have.property('id', authorId.toString());
  //       result.blip.place.should.have.property('id', placeId.toString());        
  //       result.blip.should.have.property('message', "message");
  //       result.blip.should.have.property('expiryTime', expiryTime);
  //       result.blip.likes.should.have.property('isLiker', true);
  //       result.blip.likes.should.have.property('likeCount', 2);
  //       result.blip.likes.likers[0].should.have.property("id", aliceId.toString());
  //       result.blip.likes.likers[1].should.have.property("id", bobId.toString());

  //       process.nextTick(function() { sandbox.verify(); });
  //       done();
  //     });
  //   });
  // });

  describe("like()", function () {
    it("should yield error when blipManager.like returns error", function(done) {
      sandbox.mock(blipManager).expects('like').yields(BBError.validationError, null);
      var request = { id: blipId, user: { _id: authorId } };
      blipController.api.likeBlip(request, function (error, likes) {
        should.not.exist(likes);
        should.exist(error);
        error.type.should.equal(BBError.validationError.type);
        process.nextTick(function() { sandbox.verify(); });
        done();
      });
    });

    it("should yield error when blipManager.unlike returns error", function(done) {
      sandbox.mock(blipManager).expects('unlike').yields(BBError.validationError, null);
      var request = { id: blipId, user: { _id: authorId } };
      blipController.api.unlikeBlip(request, function (error, likes) {
        should.not.exist(likes);
        should.exist(error);
        error.type.should.equal(BBError.validationError.type);
        process.nextTick(function() { sandbox.verify(); });
        done();
      });
    });

    it("should yield like obj on like", function(done) {
      var yields = [{id: authorId, name:"author"}];
      sandbox.mock(blipManager).expects('like').yields(null, yields);

      var request = { id: blipId, user: { _id: authorId } };
      blipController.api.likeBlip(request, function (error, result) {
        //console.log("result=" + JSON.stringify(result,null,1));
        should.not.exist(error);
        should.exist(result);
        result.should.have.property('likes');
        result.likes.likers[0].should.have.property('id', authorId.toString());

        result.likes.should.have.property('isLiker', true);
        result.likes.should.have.property('likeCount', 1);
        
        result.likes.likers[0].should.have.property('id', authorId.toString());
        result.likes.likers[0].should.have.property('name', "author");
        process.nextTick(function() { sandbox.verify(); });
        done();
      });
    });

    it("should yield like obj on successful unlike", function(done) {
      var yields = [];
      sandbox.mock(blipManager).expects('unlike').yields(null, yields);

      var request = { id: blipId, user: { _id: authorId } };
      blipController.api.unlikeBlip(request, function (error, result) {
        //console.log("result=" + JSON.stringify(result,null,1));
        should.not.exist(error);

        should.exist(result);
        result.should.have.property('likes');
        result.likes.should.have.property('likers').with.lengthOf(0);
        result.likes.should.have.property('isLiker', false);
        result.likes.should.have.property('likeCount', 0);

        process.nextTick(function() { sandbox.verify(); });
        done();
      });
    });
  });
});
