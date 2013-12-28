/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview Password helper functions
 * @author aneil@blipboard.com
 */

var crypto = require('crypto');

/**
 * Checks if a string matches a saltedHash
 *
 * @param the string to check
 * @param a saltedHash of the form produced by makeSaltedHash
 */
function matchesSaltedHash(str,saltedHash) {
  var splitHash = saltedHash.split('$');
  var algorithm = splitHash[0], salt = splitHash[1], digest = splitHash[2];
  return (makeSaltedHash(str,salt,algorithm) == saltedHash);
}

/**
 * Computes salted hash digest of the form "algorithm$salt$digest"
 * 
 * @param the string to be hashed
 * @param optional salt (default=random 4 char)
 * @param any hash method of crypto.js (e.g., sha1, md5, etc.)
 */
function makeSaltedHash(str,salt,algorithm) {
  var alg = algorithm ? algorithm : 'sha1';

  var hash = crypto.createHash(alg);
  hash.update(str);
  var saltStr = salt ? salt : randomString(4);
  hash.update(saltStr);
  var digest = hash.digest('base64');
  return alg+"$"+saltStr+"$"+digest;
}

function makeBasicAuthString(username,password) {
  return base64Encode(username+":"+password);
}

function base64Decode(s) {
  var b = new Buffer(s,'base64');
  return b.toString('utf8');
}

function base64Encode(s) {
  var b = new Buffer(s,'utf8');
  return b.toString('base64');
}

function randomString(length,charSet) {
  var chars = charSet ?  charSet : "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz";
  var output = '';
  for (var i=0; i<length; i++) {
    var now = new Date();
    var rnum = Math.floor(Math.random(now.getSeconds()) * chars.length);
    output += chars.substring(rnum,rnum+1);
  }
  return output;
}

exports.makeSaltedHash = makeSaltedHash;
exports.matchesSaltedHash = matchesSaltedHash;
exports.randomString = randomString;
exports.base64Encode = base64Encode;
exports.base64Decode = base64Decode;
exports.makeBasicAuthString = makeBasicAuthString;