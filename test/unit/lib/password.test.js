/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview unit tests for password.js
 * @author aneil@blipboard.com
 */

var password = require('../../../lib/password');
var assert = require('assert');
var should = require('should');
var sprintf = require('sprintf').sprintf;
describe('password module', function () {
  describe('when making salted hash with password only', function () {

    var saltedHash = password.makeSaltedHash('password'); 

    it("should have three parts split by '$'", function () {
      saltedHash.split('$').should.have.length(3);
    });

    it("should have no part is undefined", function () {
      var parts = saltedHash.split('$');
      parts[0].should.not.equal("undefined");
      parts[1].should.not.equal("undefined");
      parts[2].should.not.equal("undefined");
    });
    
    it("should have algorithm sha1", function () {
      var parts = saltedHash.split('$');
      parts[0].should.equal("sha1");
    });

    describe('when using matchesSaltedHash', function () {
      it("should match password to the saltedHash", function () {
        password.matchesSaltedHash('password',saltedHash).should.be.true;
      })
    });
  });

  describe('when making salted hash with password and salt', function () {
    var saltedHash = password.makeSaltedHash('password','123'); 

    it("should have correct salt", function () {
      saltedHash.split('$')[1].should.equal("123");
    });

    it("should have three parts split by '$'", function () {
      saltedHash.split('$').should.have.length(3);
    });

    it("should have no part undefined", function () {
      var parts = saltedHash.split('$');
      parts[0].should.not.equal("undefined");
      parts[1].should.not.equal("undefined");
      parts[2].should.not.equal("undefined");
    });

    it("should have algorithm sha1", function () {
      var parts = saltedHash.split('$');
      parts[0].should.equal("sha1");
    });

    it("should match password with matchesSaltedHash", function () {
      password.matchesSaltedHash('password',saltedHash).should.be.ok;
    });
  });


  describe('when making salted hash with password, salt and algorithm=md5', function () {
    var saltedHash =  password.makeSaltedHash('password','123','md5'); 
    var parts = saltedHash.split('$');

    it("should have three parts split by '$'", function () {
      saltedHash.split('$').should.have.length(3);
    });

    it("should use the alternate algorithm", function () {
      var defaultDigest = password.makeSaltedHash('password','123').split('$')[2]
      defaultDigest.should.not.equal(parts[2]);
    });

    it("should have no part undefined", function () {
      parts[0].should.not.equal("undefined");
      parts[1].should.not.equal("undefined");
      parts[2].should.not.equal("undefined");
    });

    it("should have algorithm md5", function () {
      var parts = saltedHash.split('$');
      parts[0].should.equal("md5");
    });

    it("should match password with matchesSaltedHash", function () {
      password.matchesSaltedHash('password',saltedHash).should.be.ok;
    });
  });

  describe('when using base64Encode,', function() {
    it('should be reversed with base64Decode', function () {
      var str = 'abcdefghijklmnopqrstuvwxyz1234567890!@#$%^&*()`~-_=+[{]}\|;:\'"';
      str.should.equal(password.base64Decode(password.base64Encode(str)));
    })
  });
    
  describe('randomString is random', function () {
    it('should not equal another call to randomString',function () {
      password.randomString(1000).should.not.equal(password.randomString(1000));
    });
  });
});