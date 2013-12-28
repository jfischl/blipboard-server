/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview unit tests for password.js
 * @author aneil@blipboard.com
 */

var vows = require('vows');
var Error = require('../lib/error').Error;
var assert = require('assert');

var suite = vows.describe('Password helpers').addBatch({
  topic:function () { return Error.notImplemented(); },
  'Can create provided error':function(err) {
    assert.ok(err instanceof Error);
  },
  'Can create provided error with message':function (err) {
    assert.equal(err.message + ' extra message',
                 Error.notImplemented({message:'extra message'}));
  },
  'Can convert to resource': function (err) {
    // !am! TODO
  }

}).run();