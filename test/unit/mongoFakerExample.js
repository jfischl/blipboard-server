"use strict";
var sinon = require('sinon');
var mongoFaker = require('./mongoFaker');
var mongo = require('../../lib/mongo');
var validate = require('../../managers/validate');
var assert = require('assert');
describe("Example", function () {
  describe("validate(idsExist...)", function () {
    var sandbox = sinon.sandbox.create();
    var user1 = mongo.ObjectID("000000000000000000000000");
    var user2 = mongo.ObjectID("111111111111111111111111");

    beforeEach(function () {
      sandbox.add(mongoFaker.fake());
    });

    afterEach(function() {
      sandbox.restore();
    });

    it("should pass validation when mongo stub provides ids",function() {
      sandbox.stub(mongo.channels,'find')
        .returns(mongoFaker.toArrayWithArgs([null,[ {_id:user1}, {_id:user2} ]]));

      var errorCallback = sandbox.add(sinon.expectation.create('error'));
      var successCallback = sandbox.add(sinon.expectation.create('success'));
      errorCallback.never();
      successCallback.once();

      validate.validate( { user1: [[user1,user2], validate.idsExist(mongo.channels)] },
                         errorCallback,
                         successCallback);
      sandbox.verify();
    });

    it("should fail validation when mongo stub doesn't provide ids",function() {
      sandbox.stub(mongo.channels,'find')
        .returns(mongoFaker.toArrayWithArgs([null,[ {_id:user1} ]])); // only one id provided

      var errorCallback = sandbox.add(sinon.expectation.create('error'));
      var successCallback = sandbox.add(sinon.expectation.create('success'));
      errorCallback.once();
      successCallback.never();

      validate.validate( { user1: [[user1,user2], validate.idsExist(mongo.channels)] },
                         errorCallback,
                         successCallback);
      sandbox.verify();
    });

  });
});
