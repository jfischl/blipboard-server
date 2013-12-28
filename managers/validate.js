/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview Validation and data preparation functions
 *           
 * @author aneil@blipboard.com
 *
 * @created Thu, Feb 24 2012 - 20:02:20 -0800
 */
var winston = require('winston');
var async = require('async');
var sets = require('simplesets');
var assert = require('assert');
var mongoskin=require('mongoskin');

var config = require('../config');
var BBError = require('../lib/error').BBError;
var ObjectID = require('../lib/mongo').ObjectID;
var Tile = require('../lib/tile').Tile;
var className = require('../lib/javascript').className;
var classOf = require('../lib/javascript').classOf;
var assertClass = require('../lib/javascript').assertClass;
var mongo = require('../lib/mongo');
var sprintf = require('sprintf').sprintf;
var js = require('../lib/javascript');

/**
 * @param {object} location should contain latitude (float) and longitude (float)
 * @param {function(error)} callback
 */
function isLocation(location,callback) {
  if (!location) {
    callback("location not provided"); 
  }
  else if (!location.hasOwnProperty('latitude') || 
           !location.hasOwnProperty('longitude')) {
    callback("missing latitude or longitude");
  }
  else if (classOf(location.latitude) !== Number ||
           classOf(location.longitude) !== Number) {
    callback("invalid latitude or longitude");
  }
  else {
    callback();
  }
}

/**
 * @param {object} bounds should contain {southwest: { lat:latf, lon:lonf }, northeast: { lat:latf, lon:lonf } }
 * @param {function(error)} callback
 */
function isBounds(bounds,callback) {
  if (!bounds) {
    callback("bounds not provided"); 
  }
  else if (!bounds.hasOwnProperty('southwest') || 
           !bounds.hasOwnProperty('northeast')) {
    callback("missing southwest or northeast from " + JSON.stringify(bounds));
  }
  else if (!bounds.southwest.hasOwnProperty('latitude') || 
           !bounds.southwest.hasOwnProperty('longitude') || 
           !bounds.northeast.hasOwnProperty('latitude') || 
           !bounds.northeast.hasOwnProperty('longitude'))
  {
    callback("missing latitude or longitude from " + JSON.stringify(bounds));
  }
  else if (classOf(bounds.southwest.latitude) !== Number ||
           classOf(bounds.southwest.longitude) !== Number ||
           classOf(bounds.northeast.latitude) !== Number ||
           classOf(bounds.northeast.longitude) !== Number) {
    callback("invalid latitude or longitude from " + JSON.stringify(bounds));
  }
  else {
    callback();
  }
}

/**
 * @param {object} isLocation or isBounds
 * @param {function(error)} callback
 */
function isLocationOrBounds(value,callback) {
  if (bounds.hasOwnProperty('southwest') && bounds.hasOwnProperty('northeast')) {
    isBounds(value, callback);
  }
  else {
    isLocation(value, callback);
  }
}


/**
 * Retrieves the channel from the db using the id
 * @param {object} id
 * @param {function(failure,channel)} callback provides the populated channel
 */
function loadDocument(collection,constraint,fields) {
  return function loadTheDocument(id, callback) {
    if (classOf(id)!==ObjectID) {
      callback("Expecting an ObjectID but received "+JSON.stringify(id));
    }
    else {
      var criterion = {_id:id};
      if (constraint) {
        for (var key in constraint) {
          criterion[key] = constraint[key];
        }
      }
      var options = fields || {};
      collection.findOne(criterion, options, function (error, channel) {
        if (error) { 
          callback(BBError.mongoFailed({message:"Failed while loading document "+id,
                                        cause:error})); 
        }
        else {
          if (channel === null) {
            callback(sprintf("Can't load document %s from %s",id,collection.name));
          }
          else {
            callback(null, channel);
          }
        }
      });
    }
  }
}


/**
 * @param {function} predicate should be a function of one argument (which tests the object)
 * @returns {function(object,callback)} a validator
 */
function test(predicate,failure) {
  assert(predicate instanceof Function);
  return function testWithPredicate(object,callback) {
    if (!predicate(object)) {
      callback(failure || sprintf("failed test %s",predicate.name));
    }
    else {
      callback();
    }
  }
}

/**
 * @param {predicate} predicate should be a function of one argument (which tests the object)
 * @returns {function(object,callback) a validator which tests every element in the list passes the predicate
 */
function testEvery(predicate) {
  assert(predicate instanceof Function);
  return function testAllWithPredicate(list,callback) {
    if (!list.every(predicate)) {
      callback(sprintf("an element failed test every(%s)",predicate.name));
    }
    else {
      callback();
    }
  }
}


/**
 * @param {predicate} predicate should be a function of one argument (which tests the object)
 * @returns {function(object,callback) a validator which tests every element in the list passes the predicate
 */
function testSome(predicate) {
  assert(predicate instanceof Function);
  return function testAllWithPredicate(list,callback) {
    if (!list.some(predicate)) {
      callback(sprintf("no element passed test some(%s)",predicate.name));
    }
    else {
      callback();
    }
  }
}
/**
 * Adds a tileIndex to the location
 * @param {object} location must be valid
 * @param {function(failure,location)} callback provides the modified location
 */
function addLocationTileIndex(arg,callback) {
  var useZoom;
  function addLocationTileIndexImpl (location,callback) {
    //winston.log('info',"addLocationTileIndexImpl zoom="+JSON.stringify(useZoom));
    var tile = new Tile(location.latitude,
                        location.longitude,
                        useZoom); // HERE IS WHERE THE ZOOM LEVEL IS SET
    location.tileIndex = tile.toIndex();
    location.tileIndexes = [location.tileIndex];
    callback(null,location);  
  }

  if (arg instanceof Object && callback && callback instanceof Function) { // called as test
    useZoom = mongo.tileZoomLevel;
    return addLocationTileIndexImpl(arg,callback);
  }
  else if (typeof(arg)=='number') {
    useZoom = arg
    return addLocationTileIndexImpl;
  }
  else {
    assert(false, "invalid argument to addLocationTileIndex: "+JSON.stringify(arg));
  }
}

/**
 * Adds a set of tileIndexes for the specified bounds
 * @param {object} bounds must be valid
 * @param {function(failure,bounds)} callback provides the modified bounds
 *        bounds.tileIndexes = array of tileIndexes
 *        bounds.tileIndex = tileIndex of center point of region
 */
function addBoundsTileIndexes(arg,callback) {
  var useZoom;
  function addTileIndexesImpl (bounds, callback) {
    var limit = Tile.limitBoundsToSpan(bounds.southwest.latitude, bounds.southwest.longitude,
                                       bounds.northeast.latitude, bounds.northeast.longitude,
                                       config.REGION.maxRegionSpan);
    
    var tiles = Tile.fromContainedBounds(limit[0], limit[1], limit[2], limit[3], useZoom); 
    bounds.tileIndexes = tiles.map(function (item) { 
      return item.toIndex();
    });
    
    // also return the tileIndex and center coordinates of the centerTile
    bounds.latitude = (bounds.southwest.latitude + bounds.northeast.latitude)/2;
    bounds.longitude = (bounds.southwest.longitude + bounds.northeast.longitude)/2;

    var centerTile = Tile(bounds.latitude, bounds.longitude, useZoom);
    bounds.tileIndex = centerTile.toIndex();

    callback(null,bounds);  
  }

  if (arg instanceof Object && callback && callback instanceof Function) { // called as test
    useZoom = mongo.tileZoomLevel;
    return addTileIndexesImpl(arg,callback);
  }
  else if (typeof(arg)=='number') {
    useZoom = arg
    return addTileIndexesImpl;
  }
  else {
    assert(false, "invalid argument to addBoundsTileIndexes: "+JSON.stringify(arg));
  }
}


function limitMaxValue(limit) {
  return function(value, callback) { 
    if (value > limit || value === undefined) {
      value = limit;
    }
    callback(undefined, value);
  };
}

/**
 * Converts a date string into Date
 * @param {string} must be valid date
 * @param {function(failure,date)} callback provides the modified location
 */
function prepareDate(value, callback) {
  if (value === undefined) {
    callback(undefined, new Date(new Date().getTime() + config.EXPIRY.user));
  }
  else {
    var ms = Date.parse(value);
    if (isNaN(ms)) {
      callback("can't parse expiry value: " + value);
    }
    else { 
      callback(undefined, new Date(ms));
    }
  }
}

/**
 * creates a test that ensures a list of ids actually exists in a collection
 * where collection = a mongoskin collection;
 * @usage validate({myIds: [[id1,id2], testIdsExistIn(myCollection)]}, 
 *                 errorBack, 
 *                 function (prepared) {
 *                   assert.ok(prepared.myIds === [id1,id2]); // passes
 *                 });
 *  
 */
function idsExist(collection) {
  assert(arguments.length === 1);
  function testIdsExist(ids, callback) {
    ids = ids instanceof Array ? ids : [ids];
    if (ids.length === 0) {  // empty array is valid
      callback();
    }
    else {
      collection.find({_id: {$in:ids}},{fields:['_id'],safe:true}).toArray(function (error,results) {
        if (error) {
          callback(error);
        }
        else {
          var resultIds = new sets.Set(results.map(function(r) { return r._id.toString(); }));
          var requestedIds = new sets.Set(ids.map(function(o) { return o.toString(); }));
          if (!resultIds.equals(requestedIds)) {
            callback(collection.name + ": failed to find ids " + ids);
          }
          else {
            callback();
          }
        }
      });
    }
  }
  return testIdsExist;
}

function areAllClass(cls) {
  if (classOf(cls)!==Function) {
    throw new Error("areAllClass requires a Function argument, but received "+className(cls));
  }
  return function arrayClassNameTest(values,callback) {
    for (var i=0; i<values.length; i++) {
      if (classOf(values[i])!==cls) {
        return callback(sprintf("className(%s)='%s' but was expecting '%s'",values[i],className(values[i]),cls.name));
      }
    }
    callback(); // success!
  };
}

function isClass(cls) {
  if (classOf(cls)!==Function) {
    throw new Error("isClass requires a Function argument, but received "+className(cls));
  }
  return function classTest(value,callback) {
    if (classOf(value)!==cls) {
      callback(sprintf("Expecting class %s but received %s",cls.name,className(value)));
    }
    else {
      callback();
    }
  }
}

function isEqual(x) {
  return function equalTest(value,callback) {
    if (value==x) {
      callback();
    }
    else {
      callback(value+" != "+x);
    }
  }
}

function isStrictlyEqual(x) {
  return function equalTest(value,callback) {
    if (value===x) {
      callback();
    }
    else {
      callback(value+" !== "+x);
    }
  }
}

function isOneOf(array) {
  return function isOneOfTest(value,callback) {
    if (!array.some(function (elt) { return elt==value; })) {
      callback(sprintf("%s is not one of %s", value,array));
    }
    else {
      callback();
    }
  }
}

function isStrictlyOneOf(array) {
  return function isStrictlyOneOfTest(value,callback) {
    if (!array.some(function (elt) { return  elt===value; })) {
      callback(sprintf("%s is not strictly one of %s", value,array));
    }
    else {
      callback();
    }
  }
}

function hasKeys(keys) {
  if (classOf(keys)!==Array) {
    throw new Error(sprintf("Invalid argument %s - expecting an array"),keys);
  }
  return function hasKeysTest(object,callback) {
    var objKeysSet = new sets.Set(Object.keys(object));
    var keysSet = new sets.Set(keys);
    if (keysSet.issubset(objKeysSet)) {
      callback();
    }
    else {
      callback(sprintf("argument doesn't contain required keys %s",keysSet.array()));
    }
  }
}

/**
 * tests for existence of a value in an object at a specified key path
 * @param {path} String dot-delimited string of property names e.g., "a.b.c"
 * @param {class} [class] optional class, if specified the value at path must be === classOf(class)
 */
function hasKeyPath(path,cls) {
  if (classOf(path)!==String) {
    throw new Error(sprintf("Invalid argument %s - expecting a String",path));
  }
  var keys = path.split('.');
  return function hasPropertyTest(object,callback) {
    function propValue(o,stack) {
      var value = o[stack.shift()];
      if (value===undefined) {
        throw sprintf("Object does not have a value at %s",path);
      }
      if (stack.length>0) {
        return propValue(value,stack);
      }
      else {
        // success
        return value;
      }
    }

    try {
      var value = propValue(object,keys);
    }
    catch (e) {
      return callback(e);
    }

    if (!cls) {
      return callback();
    }
    else if(classOf(value)===cls) {
      return callback(); //success
    }
    else {
      return callback(sprintf("Value at %s is not of type %s",path,cls.name));
    }
  }
}

function undefinedOK () {
  assert(false, "undefinedOK may only appear as the first test");
}
/**
 * Process the forms, call errorBack(error) with the first error 
 * or if all succeed, call successBack
 * @param {object} forms structured as:
 *       { paramName1: [ value, [undefinedOk,] test* ... ]
 *         paramName2: [ value, [undefinedOk,] test* ... ]
 *       }
 *       each test is a function of the form test(value,callback),
 *            where callback is called callback(failure, result)
 *            failure is a string describing the failure
 *            result should be set to a new value to replace value
 *            or should be left as undefined
 *            undefinedOk is a special signal that ignores the remaining tests
 *            if the value is undefined.
 * @param {function(error)} errorBack where error is an error object 
 *                          representing the failure
 *        !am! note, in the future, we'll want to do all the validations,
 *        and return a combined error, but that's for later.
 * @param {function(values)} successBack where values is a dictionary mapping
 *                           paramnames to the correctly prepared values
 * @example
 *   function myManagerAction(foo,location, callback) {
 *      validate({ foo:      [foo, 'String'], // tests the class name
 *                 location: [location, testLocation, addLocationTileIndex] }}
 *               callback, // called if errors occur
 *               function doMyManagerAction(prepared) {
 *                 winston.log('info',prepared.foo);
f *                 winston.log('info',pepared.location);
 *               })
 *   });
 *   myManager(123,{latitude:100,longitude:100},  // pass invalid arguments, get an error
 *             function (error) { winston.log('info',error); }, 
 *             function (prepared) {
 *               winston.log('info',prepared.foo); // never gets called
 *               winston.log('info',prepared.bar);
 *             });
 *   => Error: 'foo', expecting String but received Number
 *
 *   myManager("123",{latitude:100,longitude:100}, 
 *             function (error) { winston.log('info',error); }, 
 *             function (prepared) {
 *               winston.log('info',"Yay! foo is a "+className(prepared.foo));
 winston.log("'info', location is "+prepared.location);
 *             });
 *   => 
 *   "foo is a String"
 *   "bar is {latitude:100,longitude:100, tile:'1200123012312'}" // or some such
 */
function validate(forms, errorBack, successBack) {
  var prepared = {}; // where the prepared values will be stored
  assert(errorBack instanceof Function, "Expecting an error callback");
  assert(successBack instanceof Function, "Expecting a success callback");
  function makeFormWorker(name, value, tests) {
    //winston.log('info',sprintf("making formWorker (%s,%s,%s)",name,value,tests));
    // formWorker returns a function which runs all the tests

    // tests need to be wrapped in testWorkers:
    function makeTestWorker(test) {
      var cls = classOf(test);
      if (cls!==Function) {
        assert(false, sprintf("Invalid test passed to validate:%s=%s [%s]",name,value,cls));
      }
      return function testWorker(callback) {
        //winston.log('info',sprintf("calling test %s(%s,%s)",test,value,callback));
        test(value,function(error,result) {
          if (result!==undefined) {
            if (prepared[name]!==undefined) {
              //winston.log('info',sprintf("prepared[%s]=%s, but changing to %s",name,prepared[name],result));
              winston.log('info',sprintf("warning: validation produces multiple preparations for '%s'",name));
            }
            prepared[name] = result;
          }
          callback(error,result);
          
        });
      };
    };

    var testWorkers = tests.map(makeTestWorker);
    // this is the function which process the form and calls the callback
    function formWorker(callback) {
      //winston.log('info',"calling formWorker");
      async.series(testWorkers, function (error,results) {
        //winston.log('info',sprintf("formWorker->async.parallel(tw,fn(error,results): error=%s,results=%s",
        //                    error,results));
        if (error) {
          if (classOf(error)===String) {
            callback(BBError.validationError(sprintf("%s (%s): %s",name,value,error)));
          }
          else {
            callback(error);
          }
        }
        else { 
          if (!prepared.hasOwnProperty(name)) {
            prepared[name] = value;
          }
          callback(); /* not really necessary to return any results 
                       * since they're accumulated in prepared
                       */
        }
      });
    } // end of formWorker
    return formWorker;
  } // end of makeFormWorker

  var formWorkers = [];
  for (var formName in forms) {
    var formData = forms[formName];
    var value = formData[0];
    var tests = formData.splice(1);

    // handle the special undefinedOK test:
    if (tests[0]===undefinedOK) {
      if (value===undefined) { // ignore the rest of the tests
        tests = [function emptyTest(value,callback) { callback(); }];
      }
      else { // get rid of undefinedOK
        tests = tests.splice(1); 
      }
    }
    formWorkers.push(makeFormWorker(formName,value,tests));
  }

  //winston.log('info',formWorkers);
  async.parallel(formWorkers, function (error,singlePreparedResults) {
    if (error) {
      //winston.log('info',"errors...");
      errorBack(error);
    }
    else {
      //winston.log('info',"successes...");
      successBack(prepared);    
    }
  });
}


exports.validate = validate;

// tests
exports.areAllClass = areAllClass;
exports.idsExist = idsExist;
exports.isClass = isClass;
exports.undefinedOK = undefinedOK;
exports.isLocation = isLocation;
exports.isBounds = isBounds;
exports.loadDocument = loadDocument;
exports.addLocationTileIndex = addLocationTileIndex;
exports.addBoundsTileIndexes = addBoundsTileIndexes;
exports.limitMaxValue = limitMaxValue;
exports.prepareDate = prepareDate;
exports.isEqual = isEqual;
exports.isStrictlyEqual = isStrictlyEqual;
exports.isOneOf = isOneOf;
exports.isStrictlyOneOf =isStrictlyOneOf;
exports.hasKeys=hasKeys;
exports.hasKeyPath=hasKeyPath;
exports.test = test;
exports.testEvery = testEvery;
exports.testSome = testSome;

