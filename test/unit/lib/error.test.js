/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview Unit test for blipboard error generator
 * @author vladimir@blipboard.com
 *
 * @created Wed, Feb 29 2012 - 12:33:54 -0800
 * @updated Fri, Mar 02 2012 - 16:56:11 -0800
 */

var should = require('should');
var BBError = require('../../../lib/error').BBError;

describe('lib/error.js', function ( ) {
  describe('#BBError()', function ( ) {
    it(
      'should construct a unspecified internal server error when provided with no arguments',
      function ( ) {
        var error = new BBError();
        error.should.have.property('properties');
        error.properties.should.be.a('object');

        error.type.should.equal('unspecified');
        error.status.should.equal(500);
        error.message.should.equal('Internal Server Error');
        error.isUserError.should.equal(false);
    });

    it(
      'should construct a unspecified internal server error even when new keyword is not used',
      function ( ) {
        var error = BBError();
        error.should.have.property('properties');
        error.properties.should.be.a('object');

        error.type.should.equal('unspecified');
        error.status.should.equal(500);
        error.message.should.equal('Internal Server Error');
        error.isUserError.should.equal(false);
    });

    it(
      'should construct a unspecified error with 666 status when provided with 666 argument',
      function ( ) {
        var error = new BBError(666);
        error.status.should.equal(666);
    });

    it(
      'should construct a unspecified error with the provided message when string argument is provided',
      function ( ) {
        var error = new BBError(666, 'new message');
        error.status.should.equal(666);
        error.message.should.equal('new message');
    });

    it(
      'should construct a unspecified error with an array of causes when array argument is provided',
      function ( ) {
        var error = new BBError(666, 'new message', ['cause 1', 'cause 2']);
        error.status.should.equal(666);
        error.message.should.equal('new message');
        error.cause.length.should.equal(2);
        error.cause[0].should.equal('cause 1');
        error.cause[1].should.equal('cause 2');
    });

    it(
      'should construct a unspecified user error when true argument provided',
      function ( ) {
        var error = new BBError(666, 'new message', ['cause 1', 'cause 2'], true);
        error.status.should.equal(666);
        error.message.should.equal('new message');
        error.cause.length.should.equal(2);
        error.cause[0].should.equal('cause 1');
        error.cause[1].should.equal('cause 2');
        error.isUserError.should.be.true;
    });

    it(
      'should construct a custom user error when type is defined in the properties argument',
      function ( ) {
        var error = new BBError(666, 'new message', ['cause 1', 'cause 2'], true, { type: 'custom' });
        error.status.should.equal(666);
        error.message.should.equal('new message');
        error.cause.length.should.equal(2);
        error.cause[0].should.equal('cause 1');
        error.cause[1].should.equal('cause 2');
        error.isUserError.should.be.true;
        error.type.should.equal('custom');
    });

    it(
      'should construct a custom user error even when the order of the arguments is incorrect',
      function ( ) {
        var error = new BBError(true, 'new message', ['cause 1', 'cause 2'], 666, { type: 'custom' });
        error.status.should.equal(666);
        error.message.should.equal('new message');
        error.cause.length.should.equal(2);
        error.cause[0].should.equal('cause 1');
        error.cause[1].should.equal('cause 2');
        error.isUserError.should.be.true;
        error.type.should.equal('custom');
    });

    it(
      'should construct a unspecified error with non empty cause when javascript Error argument is provided',
      function ( ) {
        var e = new Error();
        var error = new BBError(e);
        error.cause.should.equal(e);
    });

    it(
      'should construct a unspecified error with non empty cause when blipboard Error argument is provided',
      function ( ) {
        var e = new BBError();
        var error = new BBError(e);
        error.cause.should.equal(e);
    });
  }); // BBError test

  describe('#BBError().merge(key, value)', function ( ) {
    it(
      'should merge values when property value exists and is not an array',
      function ( ) {
        var error = new BBError({ test: 'test string' });
        error.properties.test.should.equal('test string');
        error.merge('test', 'merged');
        error.properties.test.length.should.equal(2);
        error.properties.test[0].should.equal('test string');
        error.properties.test[1].should.equal('merged');
    });

    it(
      'should merge values when property value is an array',
      function ( ) {
        var error = new BBError({ test: ['a'] });
        error.merge('test', 'b');
        error.merge('test', ['c', 'd']);
        error.properties.test[0].should.equal('a');
        error.properties.test[1].should.equal('b');
        error.properties.test[2].should.equal('c');
        error.properties.test[3].should.equal('d');
    });
  }); // BBError().merge test

  describe('#BBError.normalizeError(error)', function ( ) {
    it(
      'should return null when error is null or undefined',
      function ( ) {
        should.not.exist(BBError.normalizeError());
        should.not.exist(BBError.normalizeError(null));
    });

    it(
      'should convert the error into a cause when error is a boolean',
      function ( ) {
        var e = true;
        var error = BBError.normalizeError(e);
        error.type.should.equal('unspecified');
        error.status.should.equal(500);
        error.message.should.equal('Internal Server Error');
        error.isUserError.should.equal(false);
        error.cause.should.equal(e);
    });

    it(
      'should convert the error into a cause when error is a number',
      function ( ) {
        var e = 1.12141;
        var error = BBError.normalizeError(e);
        error.type.should.equal('unspecified');
        error.status.should.equal(500);
        error.message.should.equal('Internal Server Error');
        error.isUserError.should.equal(false);
        error.cause.should.equal(e);
    });

    it(
      'should convert the error into a cause when error is a string',
      function ( ) {
        var e = 'some string';
        var error = BBError.normalizeError(e);
        error.type.should.equal('unspecified');
        error.status.should.equal(500);
        error.message.should.equal('Internal Server Error');
        error.isUserError.should.equal(false);
        error.cause.should.equal(e);
    });

    it(
      'should convert the error into causes when error is an array',
      function ( ) {
        var e = ['a', 'b', 'c'];
        var error = BBError.normalizeError(e);
        error.type.should.equal('unspecified');
        error.status.should.equal(500);
        error.message.should.equal('Internal Server Error');
        error.isUserError.should.equal(false);
        for ( var i in e ) error.cause[i].should.equal(e[i]);
    });

    it(
      'should convert the error into a cause and reuse its stack when error is a javascript error',
      function ( ) {
        var e = new Error('regular javascript error');
        var error = BBError.normalizeError(e);
        error.type.should.equal('unspecified');
        error.status.should.equal(500);
        error.message.should.equal('Internal Server Error');
        error.isUserError.should.equal(false);
        error.cause.should.equal(e);
        error.stack.should.equal(e.stack);
    });

    it(
      'should simply return the error when error is a blipboard error',
      function ( ) {
        var e = new BBError;
        var error = BBError.normalizeError(e);
        error.should.equal(e);
    });
  }); // BBError.normalizeError test

  describe('#BBError().asResource(showInternal)', function ( ) {
    it(
      'should return an object containing original message and type properties when isUserError property is true',
      function ( ) {
        var res = new BBError(true, 'private message', { type: 'custom type error' }).asResource();
        res.should.be.a('object');
        res.should.have.property('message', 'private message');
        res.should.have.property('type', 'custom type error');
    });

    it(
      'should return an object containing original message and type properties when showInternal is true',
      function ( ) {
        var res = new BBError('private message', { type: 'custom type error' }).asResource(true);
        res.should.be.a('object');
        res.should.have.property('message', 'private message');
        res.should.have.property('type', 'custom type error');
    });

    it(
      'should return an object containing standard or default message and type properties when showInternal and isUserError property are false',
      function ( ) {
        var res = new BBError('private message', { type: 'custom type error' }).asResource();
        res.should.be.a('object');
        res.should.have.property('message');
        res.should.have.property('type');
        res.message.should.equal('Internal server error');
        res.type.should.equal('internalServerError');

        res = new BBError(-1).asResource();
        res.message.should.equal('Unknown error');
        res.type.should.equal('unknownError');
    });
  }); // BBError().asResource test

  describe('#mongoFailed()', function ( ) {
    it(
      'should construct a mongo failed error when called',
      function ( ) {
        var error = BBError.mongoFailed();
        error.should.have.property('properties');
        error.properties.should.be.a('object');

        error.type.should.equal('mongoFailed');
        error.status.should.equal(500);
        error.message.should.equal('MongoDB request failed');
        error.isUserError.should.equal(false);
    });

    it(
      'should construct a mongo failed error and merge properties that have the same keys together when called with arguments',
      function ( ) {
        var props = {
          type: 'testing',
          status: 200,
          isUserError: true,
          message: 'third message',
          cause: 'c',
          test: 'test'
        }
        var error = BBError.mongoFailed(100, true, ['a', 'b'], 'second message', props);
        error.should.have.property('properties');
        error.properties.should.be.a('object');

        error.type.should.match(/.*mongoFailed.*/);
        error.type.should.match(/.*testing.*/);
        error.status.should.equal(500);
        error.message.should.match(/.*MongoDB request failed.*/);
        error.message.should.match(/.*second message.*/);
        error.message.should.match(/.*third message.*/);
        error.isUserError.should.equal(false);
        error.properties.test.should.equal('test');
        error.cause.length.should.equal(3);
        error.cause[0].should.equal('a');
        error.cause[1].should.equal('b');
        error.cause[2].should.equal('c');
    });
  }); // notFound test
});

