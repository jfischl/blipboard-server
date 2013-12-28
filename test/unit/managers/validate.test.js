/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview unit tests for the validation framework 
 *           
 * @author aneil@blipboard.com
 */
var should = require('should');
var className = require('../../../lib/javascript').className;
var ObjectID = require('../../../lib/mongo').ObjectID;
var v = require('../../../managers/validate');
var config = require('../../../config');


describe('validate', function() {
  describe('#validate()', function() {
    describe("when testing with isClass", function () {
      it("should fail when String is expected, but non-string is given",function(done) {        
        v.validate({foo: [123, v.isClass(String)]},
                 function onError(error) {
                   className(error).should.equal('BBError');
                   error.type.should.equal('validationError');
                   done();
                 },
                 function onSuccess(prepared) {
                   true.should.not.exist; // should never get here
                   done();
                 });
      });

      it("should pass when String is given and String is expected", function (done) {
        v.validate({foo: ["abc", v.isClass(String)]},
                 function onError(error) {
                   true.should.not.exist; // should never get here
                 },
                 function onSuccess(prepared) {
                   prepared.should.have.key('foo');
                   prepared.foo.should.equal("abc");
                   done();
                 });
      });

      it("should fail when String is given and ObjectID is expected", function (done) {
        v.validate({ foo: ['abc',v.isClass(ObjectID)],
                     bar: [ObjectID('111111111111111111111111'), v.isClass(ObjectID)] },
                   function onError(error) {
                     error.should.exist;
                     done();
                   },
                   function onSuccess(prepared) {
                     true.should.not.exist; // should never get here
                     done();
                   });
      });
    }); // describe("when using className validation...

    describe("when using v.undefinedOK", function () {
      it("should call the successCallback when the value is = undefined", function (done) {
        v.validate({foo: [undefined,v.undefinedOK, v.isClass(Number)]},
                 function onError(error) {
                   true.should.not.exist; // should never get here
                   done();
                 },
                 function onSuccess(prepared) {
                   prepared.should.have.key('foo');
                   should.strictEqual(prepared.foo,undefined);
                   done();
                 });
      });

      it("should call the successCallback when the value matches the test", function (done) {
        v.validate({foo: [123,v.undefinedOK, v.isClass(Number)]},
                 function onError(error) {
                   true.should.not.exist; // should never get here
                   done();
                 },
                 function onSuccess(prepared) {
                   prepared.should.have.key('foo');
                   should.strictEqual(123,prepared.foo)
                   done();
                 });
      });

      it("should call the errorCallback when the value is defined, but doesn't pass the test", function (done) {
        v.validate({foo: ["abc",v.undefinedOK, v.isClass(Number)]},
                 function onError(error) {
                   className(error).should.equal('BBError');
                   error.type.should.equal('validationError');
                   done();
                 },
                 function onSuccess(prepared) {
                   true.should.not.exist; // should never get here
                   done();
                 });
      });
    });

    describe("while validating a location", function () {
      function makeLoc(lat,lng) { return {latitude:lat,longitude:lng}; }
      it("validates with {latitude:number, longitude:number}", function (done) {
        v.validate({location: [makeLoc(1,2), v.isLocation]},
                 function onError(error) {
                   true.should.not.exist; // should never get here
                   done();
                 },
                 function onSuccess(prepared) {
                   prepared.location.should.be.ok;
                   done();
                 });
      });

      it("can add a tileIndex to the location", function (done) {
        v.validate({location: [makeLoc(1,2), v.addLocationTileIndex]},
                 function onError(error) {
                   true.should.not.exist; // should never get here
                   done();
                 },
                 function onSuccess(prepared) {
                   prepared.location.should.be.ok;
                   prepared.location.should.have.property('tileIndex');
                   done();
                 });        
      });

      it("can validate a location then add the tile index to the location", function (done) {
        v.validate({location: [makeLoc(1,2), v.isLocation, v.addLocationTileIndex]},
                   function onError(error) {
                     true.should.not.exist; // should never get here
                     done();
                   },
                   function onSuccess(prepared) {
                     prepared.location.should.be.ok;
                     prepared.location.should.have.property('tileIndex');
                     done();
                   });
      });

      it("fails when undefined is passed to isLocation and/addLocationTileIndex", function (done) {
        v.validate({location: [undefined, v.isLocation, v.addLocationTileIndex]},
                   function onError(error) {
                     error.should.exist;
                     done();
                     // should get here
                   },
                   function onSuccess(prepared) {
                     true.should.not.exist; // should never get here
                     done();
                   });
      });

    });
   }); // describe #v.validate()

  describe("while validating a Date", function() {
    it("should prepare a valid Date object", function(done) {
      var now = new Date(2012,4,4);
      v.validate({expiry: [now.toString(), v.prepareDate]}, 
                 function onError(error) {
                   true.should.not.exist; // should never get here
                   done();
                 },
                 function onSuccess(prepared) {
                   (prepared.expiry-now).should.equal(0);
                   done();
                 });
    });

    it("should return error for invalid Date string", function(done) {
      v.validate({expiry: ["foo", v.prepareDate]}, 
                 function onError(error) {
                   error.should.exist;
                   done();
                 },
                 function onSuccess(prepared) {
                   true.should.not.exist; // should never get here
                   done();
                 });
    });

    it("should return default (user expiry) for undefined value", function(done) {
      var defaultExpiry = new Date(new Date().getTime() + config.EXPIRY.user);

      v.validate({expiry: [undefined, v.prepareDate]}, 
                 function onError(error) {
                   error.should.not.exist;
                 },
                 function onSuccess(prepared) {
                   prepared.expiry.getDay().should.equal(defaultExpiry.getDay());
                   prepared.expiry.getMonth().should.equal(defaultExpiry.getMonth());
                   prepared.expiry.getFullYear().should.equal(defaultExpiry.getFullYear());
                   done();
                 });
    });
  });

  describe("while validating a limitMaxValue", function() {
    it ("should not limit a value in range", function(done) {
      v.validate({value: [10, v.limitMaxValue(20)]}, 
                 function onError(error) {
                   error.should.not.exist;
                 },
                 function onSuccess(prepared) { 
                   prepared.value.should.equal(10);
                   done();
                 });
    });
    
    it ("should limit a value not in range", function(done) {
      v.validate({value: [10, v.limitMaxValue(5)]}, 
                 function onError(error) {
                   error.should.not.exist;
                 },
                 function onSuccess(prepared) { 
                   prepared.value.should.equal(5);
                   done();
                 });
    });

    it ("should limit an undefined value", function(done) {
      v.validate({value: [undefined, v.limitMaxValue(100)]}, 
                 function onError(error) {
                   error.should.not.exist;
                 },
                 function onSuccess(prepared) { 
                   prepared.value.should.equal(100);
                   done();
                 });
    });
  });



  
  describe("when testing classes...", function () {
    it("should pass when isClass gets the correct class", function (done) {
      v.isClass(String)("abc", function (failure, prepared) {
        should.strictEqual(failure,undefined);
        should.strictEqual(prepared,undefined);
        done();
      });
    });


    it("should fail when isClass gets an incorrect class", function (done) {
      v.isClass(String)(123, function (failure, prepared) {
        className(failure).should.equal('String');
        should.strictEqual(prepared,undefined);
        done();
      });
    });

    it("should fail when areAllClass gets an array with one invalid instance", function (done) {
      v.areAllClass(String)(["abc",123], function (failure,prepared) {
        className(failure).should.equal('String');
        should.strictEqual(prepared,undefined);
        done();
      });
    });

    it("should pass when areAllClass gets an array with all valid instances", function (done) {
      v.areAllClass(Number)([384,1.2,123], function (failure,prepared) {
        should.strictEqual(failure,undefined);
        should.strictEqual(prepared,undefined);
        done();
      });
    });

    it("should fail when isLocation is passed undefined", function (done) {
      v.isLocation(undefined, function (failure, prepared) {
        className(failure).should.equal('String');
        should.strictEqual(prepared,undefined);
        done();
      });
    });    
  });

  describe("when validating objects in the database...",function () {
    var ObjectID = require('../../../lib/mongo').ObjectID;
    var id1 = ObjectID("000000000000000000000000");
    var id2 = ObjectID("000000000000000000000001");
    var mockResult = [];
    var mockCollection = { 
      result: [], // set this to simulate    
      find: function (criterion,options,callback) { 
        var result = mockResult;
        return { toArray: 
                 function (callback) {
                   callback(null,result);
                 }
               };
      }
    };

    mockResult = [{_id:id1},{_id:id2}];
    it("should pass when idsExist is called with ids which exist in the db, and result is not in order provided", function (done) {
      v.idsExist(mockCollection)([id2,id1], function (failure, prepared) {
        should.strictEqual(failure,undefined);
        should.strictEqual(prepared,undefined);
        done();
      });
    });

    mockCollection.result = [];
    it("should fail when idsExist is called with ids which do not exist in the db", function (done) {
      v.idsExist(mockCollection)([id1,id2], function (failure, prepared) {
        should.strictEqual(failure,undefined);
        should.strictEqual(prepared,undefined);
        done();
      });
    });

  });

  describe("when testing for equality or presence in a set...",function () {
    it("should pass when isEqual tests two type-cast equal objects", function (done) {
      v.isEqual(123)("123",function (failure, prepared) {
        should.strictEqual(failure,undefined);
        should.strictEqual(prepared,undefined);
        done();
      });
    });

    it("should fail when isEqual tests two unequal objects", function (done) {
      v.isEqual("1234")("123",function (failure, prepared) {
        should.strictEqual(className(failure),'String');
        should.strictEqual(prepared,undefined);
        done();
      });
    });

    it("should pass when isStrictlyEqual tests two equal objects", function (done) {
      v.isStrictlyEqual("123")("123",function (failure, prepared) {
        should.strictEqual(failure,undefined);
        should.strictEqual(prepared,undefined);
        done();
      });
    });

    it("should fail when isStrictlyEqual tests two type-cast equal objects", function (done) {
      v.isStrictlyEqual(123)("123",function (failure, prepared) {
        should.strictEqual(className(failure),'String');
        should.strictEqual(prepared,undefined);
        done();
      });
    });

    it("should pass when isOneOf finds a type-cast-equal element in a list", function (done) {
      v.isOneOf([1,2,3])("2",function (failure, prepared) {
        should.strictEqual(failure,undefined);
        should.strictEqual(prepared,undefined);
        done();
      });
    });

    it("should fail when isOneOf fails to find a type-cast-equal element in a list", function (done) {
      v.isOneOf([1,2,3])(4,function (failure, prepared) {
        should.strictEqual(className(failure),'String');
        should.strictEqual(prepared,undefined);
        done();
      });
    });

    it("should pass when isStrictlyOneOf finds a strictly equal object in a list", function (done) {
      v.isStrictlyOneOf([1,2,3])(2,function (failure, prepared) {
        should.strictEqual(failure,undefined);
        should.strictEqual(prepared,undefined);
        done();
      });
    });

    it("should fail when isStrictlyOneOf doesn't find a strictly equal value in the list", function (done) {
      v.isStrictlyOneOf([1,2,3])("2", function (failure, prepared) {
        should.strictEqual(className(failure),'String');
        should.strictEqual(prepared,undefined);
        done();
      });
    });
  });

  describe("when using generic test predicates...",function () {
    function isOne(x) {  // test predicate
      return x===1; 
    }    

    it("should fail when test(predicate) fails", function (done) {
      v.test(isOne)(2,function (failure,prepared) {
        should.strictEqual(failure,'failed test isOne');
        should.strictEqual(prepared,undefined);
        done();
      });
    });

    it("should pass when test(predicate) passes", function (done) {
      v.test(isOne)(1,function (failure,prepared) {
        should.strictEqual(failure,undefined);
        should.strictEqual(prepared,undefined);
        done();
      });
    });

    it("should fail when any testEvery(predicate) fails", function (done) {
      v.testEvery(isOne)([1,1,2,1],function (failure,prepared) {
        should.strictEqual(failure,'an element failed test every(isOne)');
        should.strictEqual(prepared,undefined);
        done();
      });
    });

    it("should pass when testEvery(predicate) passes", function (done) {
      v.testEvery(isOne)([1,1,1],function (failure,prepared) {
        should.strictEqual(failure,undefined);
        should.strictEqual(prepared,undefined);
        done();
      });
    });


    it("should fail when testSome(predicate) fails", function (done) {
      v.testSome(isOne)([0,4,3], function (failure,prepared) {
        should.strictEqual(failure,'no element passed test some(isOne)');
        should.strictEqual(prepared,undefined);
        done();
      });
    });

    it("should pass when testSome(predicate) passes", function (done) {
      v.testSome(isOne)([0,1,0],function (failure,prepared) {
        should.strictEqual(failure,undefined);
        should.strictEqual(prepared,undefined);
        done();
      });
    });
  });

  describe("when testing object properties", function () {
    it("should pass when hasKeys tests object with exact key match", function (done) {
      v.hasKeys(['a','b','c'])({a:1,b:2,c:3},function (failure,prepared) {
        should.strictEqual(failure,undefined);
        should.strictEqual(prepared,undefined);
        done();
      });
    });

    it("should pass when hasKeys tests object with superset of keys", function (done) {
      v.hasKeys(['a','b','c'])({a:1,b:2,c:3,d:3},function (failure,prepared) {
        should.strictEqual(failure,undefined);
        should.strictEqual(prepared,undefined);
        done();
      });
    });

    it("should fail when hasKeys tests object with subset of keys", function (done) {
      v.hasKeys(['a','b','c'])({a:1,b:2},function (failure,prepared) {
        should.strictEqual(failure,"argument doesn't contain required keys a,b,c");
        should.strictEqual(prepared,undefined);
        done();
      });
    });

    it("should pass when hasKeys tests object for no key,", function (done) {
      v.hasKeys([])({a:1,b:2},function (failure,prepared) {
        should.strictEqual(failure,undefined);
        should.strictEqual(prepared,undefined);
        done();
      });
    });

    it("should pass hasKeyPath when object contains a value for the key path", function (done) {
      v.hasKeyPath('a.b.c')({a: {b: {c: 1}}}, function (failure,prepared)  {
        should.strictEqual(failure,undefined);
        should.strictEqual(prepared,undefined);
        done();
      });
    });

    it("should pass hasKeyPath when object contains a value of type cls for the key path", function (done) {
      v.hasKeyPath('a.b.c',Number)({a: {b: {c: 1}}}, function (failure,prepared)  {
        should.strictEqual(failure,undefined);
        should.strictEqual(prepared,undefined);
        done();
      });
    });

    it("should fail hasKeyPath when object contains a value not of type cls for the key path", function (done) {
      v.hasKeyPath('a.b.c',String)({a: {b: {c: 1}}}, function (failure,prepared)  {
        should.strictEqual(failure,"Value at a.b.c is not of type String");
        should.strictEqual(prepared,undefined);
        done();
      });
    });

    it("should fail hasKeyPath when object does not contain a value for the key path", function (done) {
      v.hasKeyPath('a.b.c')({a: {b: 1}}, function (failure,prepared)  {
        should.strictEqual(failure,"Object does not have a value at a.b.c");
        should.strictEqual(prepared,undefined);
        done();
      });
    });
  });
}); // describe v.validate
