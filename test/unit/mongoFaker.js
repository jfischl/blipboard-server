/**
 * @fileoverview Listen network manager unit tests
 * @author aneil@blipboard.com
 */

"use strict";

var mongoConfig = require('../../config').MONGO;

// /lib modules
var js = require('../../lib/javascript');
var classOf = require('../../lib/javascript').classOf;
var mongo = require('../../lib/mongo');
var ObjectID = mongo.ObjectID;

// external modules
var sets = require('simplesets');
var sinon = require('sinon');
var mongoskin = require('mongoskin');

var fakeCollection = function fakeCollection(colName,silent) {
  var methods = mongoskin.SkinCollection.prototype
  var fake = {}
  for (var name in methods) {
    fake[name] = silent ? function silentFake () {} : makeUnexpectedCall(colName,name);
  }
  fake.constructor = mongoskin.SkinCollection;
  fake.name = colName;
  return fake;
}

var makeUnexpectedCall = function makeUnexpectedCall(colName,method) {
  return function unexpectedFakeMethodCall() {
    throw new Error("Unexpected call to fake method "+colName+"."+method + "; Create fake with mongoFaker.fake({silent:true}) to suppress this message."); 
  };
}

var restore = function restore() {
  for (var name in this.__originals__) {
    mongo[name] = this.__originals__[name];
    if (mongo[name]===undefined) {
      delete mongo[name];
    }
  }
}

/**
 * fakes the mongo module, readies it for spying/mocking/stubbing
 * @param {options} object { silent:true/false }  default:false, collection methods 
 *                         throw an error if they are called before being spied/stubbed/mocked
 */
var fake = function fake(options) {
  var mongoFake = { __originals__: {},
                    restore: restore };
  mongoConfig.collections.forEach(function(col) {
    mongoFake.__originals__[col.name] = mongo[col.name];
    mongo[col.name] = fakeCollection(col.name,options && options.silent);
  });
  mongoFake.__originals__.initialize = mongo['initialize'];
  mongo.initialize = makeUnexpectedCall('mongo','initialize');
  return mongoFake;
}

/**
 * Helper - used to create a toArray return
 * @usage myMockedCollection.expects('find')
 *           .returns(toArrayWithArgs([theError,theArray]))
 *   OR   myMockedCollection.expects('find')
 *           .returns(toArrayWithArgs(theError,theArray);
 * to mock the call:
 *        myCollection.find(...).toArray(function(theError,theArray) {...})
 */
var toArrayWithArgs = function toArrayWithArgs() {
  var args = arguments;
  var fakeCursor = { 
    toArray: function(callback) { 
      if (args.length==1 && (args[0] instanceof Array)) {
        callback.apply(undefined, args[0]); 
      }
      else if (args.length==2) {
        callback.apply(undefined,args);
      }
      else {
        throw new Error("Invalid use of toArrayWithArgs");
      }
    },
    constructor: mongoskin.SkinCursor
  };

  return fakeCursor;
}

/**
 * A sinon matcher for ObjectIDs
 * @param {Object} o may be an ObjectID, or an Array or StringSet of ObjectIDs
 * @returns {Match} a sinon matcher 
 */
var objectIDMatcher = function objectIDMatcher(o) {
  if (classOf(o)===Array) {
    return sinon.match(function (value) {
      return (classOf(value)===Array &&
              value.every(function (elt) {
                return o.equals(elt);
              }));
    }, "matching array of ObjectIDs: "+JSON.stringify(o));
  }
  else if (classOf(o)===ObjectID) {
    return sinon.match(function (value) {
      return o.equals(value);
    },"matching object ID" + JSON.stringify(o));
  }
  else if (classOf(o)===sets.StringSet) {
    return sinon.match(function (array) {
      if (classOf(array)===Array) {
        var arraySet = new sets.StringSet(array);
        return o.equals(arraySet);
      }
      else {
        return false;
      }
    },"matches ObjectID set");
  }
  else {
    throw new Error("Invalid input to ObjectIDMatcher: expecting an ObjectID, Array of ObjectIDs or a StringSet of ObjectIDs");
  }
}

var criterionPredicate = function criterionPredicate(o1) {
  function isMatcher(x) {
    return x && x['test'] && classOf(x.test)===Function;
  }
  function critEqual (o1,o2) {
    if (o1==o2) {
      return true;
    }
    if (!o2) {
      return false;
    }
    for (var key in o1) {
      var o1Val = o1[key];
      var o2Val = o2[key];
      var o1Type = typeof(o1Val);

      // any mismatch of a criterion value causes the entire test to fail
      if (o1Type==='object') {
        if (isMatcher(o1Val)) {
          if (!o1Val.test(o2Val)) {
            return false;
          }
        }
        else if (!critEqual(o1Val,o2Val)) {
          return false;
        }
      }
      else {
        if (o1Val!=o2Val) {
          return false;
        }
      }
    }
    return true;
  }
  return function (o2) { 
    return critEqual(o1,o2); 
  }
}

var criterionMatcher = function criterion(o1) {
  return sinon.match(criterionPredicate(o1), 
                     "Matching criterion "+JSON.stringify(o1));
}

var criterionExactMatcher = function criterion(o1) {
  return sinon.match(function (o2) {
    var o1Keys = new sets.Set(Object.keys(o1));
    var o2Keys = new sets.Set(Object.keys(o2));
    return (o1Keys.equals(o2Keys) &&
            criterionMatcher(o1)(o2));
  }, "Matching criterion exactly "+JSON.stringify(o1));
}
exports.fake = fake;
exports.toArrayWithArgs = toArrayWithArgs;
exports.objectIDMatcher = objectIDMatcher;
exports.criterionMatcher = criterionMatcher;
exports.criterionExactMatcher = criterionExactMatcher;
