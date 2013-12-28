/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @author aneil@blipboard.com
 * @fileoverview integration tests for .tuneIn and .tuneOut
 */
var APIeasy = require('api-easy');
var password = require('../lib/password');


var suite = APIeasy.describe('Tuning in');
var user1Id,user2Id;
suite.use('localhost', 3000)
  .setHeader('Content-Type', 'application/json')
  /*
    A GET Request to /ping
    should respond with 200
    should respond with { pong: true }
  */
  .post('/channels',{type:'user'} )
    .expect(200)
    .expect("should respond with { id:userId, password:pwd }", function (err,res,body) {
      console.log("body1:"+body);
      var result = JSON.parse(body);
      assert.isNotNull(result);
      user1Id=result.id;
      console.log("user1Id"+user1Id);
      suite.before('setAuth', function (outgoing) {
        outgoing.headers['AUTHORIZATION'] = password.makeBasicAuthString(result.id,result.password);
        return outgoing;
      });
    })
  .post('/channels',{type:'user'})
    .expect(200)
    .expect("should return another user", function (err,res,body) {
      console.log("body2:"+body);
      var result = JSON.parse(body);
      user2Id=result.id;
    })
  .discuss("tuning in")
  .post('/'+user1Id+'listensTo/'+user2Id)
    .expect(200)
    .expect("result = ",function (err,res,body) {
      console.log(body)
    })
  .export(module);