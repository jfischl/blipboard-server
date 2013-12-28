require('should');
var assert = require('assert');
var js = require('../../../lib/javascript');
var sinon = require('sinon');

describe('javascript.js unit tests', function(){
  describe('#className(obj)', function(){
    it('should return undefined when passed undefined', function() {
      js.className(undefined).should.equal("undefined");
    });
    
    it('should return Array when passed [1]', function(){
      js.className([1]).should.equal("Array");
    });

    it('should return String when passed \'ab\'', function(){
      js.className('ab').should.equal("String");
    });
    
    it('should return Object when passed {}', function(){
      js.className({}).should.equal("Object");
    });

    it('should return Number when passed 1', function(){
      js.className(1).should.equal("Number");
    });

    it('should return function when passed fn', function(){
      js.className(function() { }).should.equal("Function");
    });
  });
  
 describe('#isHex(obj) test', function(){
    it('should return true for "10"', function(){
      js.isHex('10').should.be.true;
    });

    it('should return true for "deadbeef"', function(){
      js.isHex('deadbeef').should.be.true;
      js.isHex('DEADBEEF').should.be.true;
    });

    it('should return false for "undefined"', function(){
      js.isHex(undefined).should.be.false;
    });

    it('should return false for "jason"', function(){
      js.isHex('jason').should.be.false;
    });

  });

  describe('#assertClassName(obj)', function(){
    it('should not throw for appropriate types', function() {
      js.assertClassName([1], "Array");
      js.assertClassName('ab', "String");
      js.assertClassName(1, "Number");
      js.assertClassName(function() { }, "Function");
      js.assertClassName({ }, "Object");
    });

    it('should throw for inappropriate types', function() {
      (function () { js.assertClassName([1], "Number") }).should.throw();
      (function () { js.assertClassName([1], "Object") }).should.throw();
      (function () { js.assertClassName({}, "String") }).should.throw();
    });

  });

  describe('#assertClass(obj)', function(){
    it('should not throw for appropriate types', function() {
      js.assertClass([1], Array);
      js.assertClass('ab', String);
      js.assertClass(1, Number);
      js.assertClass(function() { }, Function);
      js.assertClass({ }, Object);
    });

    it('should throw for inappropriate types', function() {
      (function () { js.assertClass([1], Number) }).should.throw();
      (function () { js.assertClass([1], Object) }).should.throw();
      (function () { js.assertClass({}, String) }).should.throw();
    });

  });

  describe('#xor(obj)', function(){
    it('should implement xor', function() { 
      js.xor(true,false).should.be.true;
      js.xor(false,true).should.be.true;
      js.xor(false,false).should.be.false;
      js.xor(true,true).should.be.false;
    });
  });

  describe('#zeroFill(number,width)', function() {
    it("should return 00000 for zeroFill(0,5)", function() {
      js.zeroFill(0,5).should.equal("00000");
    });
    it("should return 1 for zeroFill(1,1)", function() {
      js.zeroFill(1,1).should.equal("1");
    });
    it("should return 0000100 for zeroFill(100,7)", function() {
      js.zeroFill(100,7).should.equal("0000100");
    });
  });

  describe('#pathValue', function() {
    it("should return appropriate values (lame description)", function() { 
      js.pathValue({a: 1}, ['a']).should.equal(1);
      js.pathValue({a: {b: 1}}, ['a', 'b']).should.equal(1);
      js.pathValue({a: {b: {c: 1}}}, ['a', 'b', 'c']).should.equal(1);

      assert.ok(js.pathValue({a: 1}, ['a','b']) === undefined);
      assert.ok(js.pathValue({a: 1}, ['b']) === undefined);
      assert.ok(js.pathValue({a: 1}, []) === undefined);

      assert.ok(js.pathValue({a: {b: 1}}, ['b', 'a']) === undefined);
      assert.ok(js.pathValue({a: {b: 1}}, ['a', 'b', 'c']) === undefined);
    });
  });

  describe('#String.trunc', function() { 
    it("should not truncate something in range", function() { 
      assert.ok("hi there".trunc(25) === "hi there");
    });
    it("should trunc empty string", function() { 
      assert.ok("".trunc(5) === "");
    });
    it("should trunc simple case with ellipsis", function() { 
      assert.ok("hi there".trunc(5) === "hi...");
    });
    it("should trunc really long string 1 word", function() { 
      console.log('"hithereasdfladsjf".trunc(5)' + "hithereasdfladsjf".trunc(5));
      assert.ok("hithereasdfladsjf".trunc(5) === "hithe...");
    });
    it("should trunc really long string 2 words", function() { 
      assert.ok("hi thereasdfladsjf".trunc(10) === "hi...");
    });

  });
});
  