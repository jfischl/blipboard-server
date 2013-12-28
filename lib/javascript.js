/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview Extensions to javascript 
 * @author aneil@blipboard.com
 *
 * @created Wed, Feb 22 2012 - 16:11:30 -0800
 * @updated Thu, Feb 23 2012 - 17:45:06 -0800
 */
var assert = require('assert');

/**
 * The class name of any JS object
 * http://stackoverflow.com/questions/332422/how-do-i-get-the-name-of-an-objects-type-in-javascript
 * @usage 
 *         className([1]) => Array
 *         className('ab') => String
 *         className({}) => Object
 *         className(1) => Number  
 */
var className = function className(object) { 
  if (object === undefined) {
    return "undefined";
  }
  else if (object === null) {
    return "null";
  }
  return classOf(object).name;
};

var classOf = function classOf(object) {
  if (object === undefined) {
    return undefined;
  }
  else if (object === null) {
    return null;
  }
  return object.constructor;
};

/**
 * Asserts that className(object) is the given className
 * @usage
 *         assertClassName(x,'Array');
 * @param {object} - object the object to test
 * @param {string} - clsName the expected className() of the object
 */
var assertClassName = function assertClassName(obj,clsName) {
  assert.strictEqual(className(obj),clsName);
};


/**
 * Asserts that class(object) is the given class
 * @usage
 *         assertClass(x,Array);
 * @param {object} - object to test
 * @param {function} - cls expected class (ie. the constructor function)
 */
var assertClass = function assertClass(obj,cls) {
  assert.strictEqual(classOf(obj),cls);
};

function xor(x,y) {
  return ((x && !y) || (!x && y));
}

function isHex(string)
{
  var i;
  if (className(string) === "String") {
    for (i=0; i<string.length; i++)
    {
      if (isNaN(parseInt(string.charAt(i), 16)))
      {return false;}
    }
    return true;
  }
  return false;
}

function clone(obj) {
  if (Object.prototype.toString.call(obj) === '[object Array]') {
    var out = [], i = 0, len = obj.length;
    for ( ; i < len; i++ ) {
      out[i] = arguments.callee(obj[i]);
    }
    return out;
  }
  if (typeof obj === 'object') {
    var out = {}, i;
    for ( i in obj ) {
      out[i] = arguments.callee(obj[i]);
    }
    return out;
  }
  return obj;
}

function zeroFill( number, width )
{
  if (number === undefined) { 
    number = 0;
  }
  width -= number.toString().length;
  if ( width > 0 )
  {
    return new Array( width + (/\./.test( number ) ? 2 : 1) ).join( '0' ) + number;
  }
  return number + "";
}

var pathValue = function pathValue ( obj, path ) {
  var key = path.pop();
  var current = obj;

  for ( var next = path.shift(); next != null; next = path.shift() ) {
    if ( typeof current[next] != 'object' ) return undefined;
    current = current[next];
  }

  return current[key];
}

var setPathValue = function setPathValue ( obj, path, value ) {
  var key = path.pop();
  var current = obj;

  for ( var next = path.shift(); next != null; next = path.shift() ) {
    if ( typeof current[next] != 'object' ) current[next] = { };
    current = current[next];
  }

  current[key] = value;
}


var prettyPrint = function prettyPrint(object) { 
  return JSON.stringify(object,null,1);
}

var prettyPrintCompact = function prettyPrintCompact(object) { 
  return JSON.stringify(object);
}

var prettyPrintChannel = function prettyPrintChannel(channel) { 
  if (classOf(channel) === Array) { 
    var result = "[";
    channel.forEach(function (item, index) { 
      if (index > 0) { 
        result += ",";
      }
      result += prettyPrintChannel(item); 
    });
    return result + "]";
  }
  else {
    var result = channel.name;
    result += " (";
    if (channel._id) result += "id=" + channel._id + " ";
    if (channel.facebook) result += "fbid=" + channel.facebook.id;
    if (channel.blacklisted) result += " blacklisted";
    result += ")";
    return result;
  }
}

Object.defineProperty(Object.prototype,'equals', 
                      {enumerable: false,
                       value: function(x) {
                         var p;
                         for(p in this) {
                           if(typeof(x[p])=='undefined') {return false;}
                         }
                         
                         for(p in this) {
                           if (this[p]) {
                             switch(typeof(this[p])) {
                             case 'object':
                               if (!this[p].equals(x[p])) { 
                                 return false; 
                               } 
                               break;
                             case 'function':
                               if (typeof(x[p])=='undefined' ||
                                   (p != 'equals' && this[p].toString() != x[p].toString()))
                                 return false;
                               break;
                             default:
                               if (this[p] != x[p]) { 
                                 return false; 
                               }
                             }
                           } 
                           else {
                             if (x[p])
                               return false;
                           }
                         }

                         for(p in x) {
                           if(typeof(this[p])=='undefined') {return false;}
                         }

                         return true;
                       }
                      });

// this probably should do a bit better job in the cases where there is one really long word but I don't think it matters for our use case. 
// see the test cases. 
String.prototype.trunc = function (n)
{
  var tooLong = this.length>n;
  var s = tooLong ? this.substr(0, n) : this;
  var last = s.lastIndexOf(' ');
  if (last !== -1) {
    s = s.substr(0, last);
  }
  return tooLong ? s  + '...' : this.toString();
};


exports.isHex = isHex;
exports.className = className;
exports.classOf = classOf;
exports.xor = xor;
exports.assertClass = assertClass;
exports.assertClassName = assertClassName;
exports.clone = clone;
exports.zeroFill = zeroFill;
exports.pathValue = pathValue;
exports.setPathValue = setPathValue;
exports.pp = prettyPrint;
exports.ppc = prettyPrintCompact;
exports.ppch = prettyPrintChannel;
exports.noop = function noop() {};
