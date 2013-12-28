/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview Integration test for tunein/tuneout functionality
 * @author vladimir@blipboard.com
 *
 * @created Wed, Mar 07 2012 - 09:19:56 -0800
 * @updated Tue, Mar 13 2012 - 15:10:01 -0700
 */

var assert = require('assert');
var should = require('should');
var util = require('util');
var restler = require('restler');
var async = require('async');
var sprintf = require('sprintf').sprintf;
var sinon = require('sinon');

var baseURL = require('../../config').SERVER.url;
var channelEvents = require('../../managers/channelEvents');
var config = require('../../config');
var events = require('../../lib/events');
var facebook = require('../../lib/facebook');
var graphite = require('../../lib/graphite');
var intercom = require('../../lib/intercom');
var js = require('../../lib/javascript');
var mongofix = require('./mongofix');
var pushnot = require('../../lib/pushnot');
var r = require('./region');

// declaring shared variables
var fix, sandbox, pushNotMock;
//var createdTime = new Date(2012,1,1,0,0,0);// 1/1/12 00:00
var createdTime = new Date();
//var expiryTime = new Date(); expiryTime.setDate(createdTime.getDate()+1); 
var expiryTime = new Date(createdTime.getTime() + config.EXPIRY.user);
var bLike = {id:'bob', name:'bob'};

describe('REST API integration tests', function ( ) {
  before(function ( done ) {
    var server = require('../../server');

    sandbox = sinon.sandbox.create();

    fix = mongofix.MongoFix(
      { key: 'topica',  make: 'topic', name: 'topica' },
      { key: 'topicb',  make: 'topic', name: 'topicb' },
      { key: 'topicc',  make: 'topic', name: 'topicc' },
      
      { key: 'me',   make: 'user',   name: 'me' },                    // create user with name and password 'me'
      { key: 'alice',make: 'user',   name: 'alice' },
      { key: 'bob',  make: 'user',   name: 'bob' },
      { key: 'carl', make: 'user',   name: 'carl' },
      { key: 'doug', make: 'user',   name: 'doug' },

      { key: 'place_a', make: 'place', name: 'place_a', location: r.lplace_a },
      { key: 'place_b',    make: 'place',  name: 'place_b', location: r.lplace_b }, 
      { key: 'place_c',    make: 'place',  name: 'place_c', location: r.lplace_c }, 
      { key: 'place_d',    make: 'place',  name: 'place_d' },

      { key: 'me_a', make: 'tunein', listener: 'me', listensTo: 'place_a' },      // tune me into place_a
      
      { key: 'blip1',   make: 'blip',  text: 'blip1', topics: ['topica'], 
        createdTime: createdTime, expiryTime: expiryTime, author: 'doug', place: 'place_c' },
      { key: 'blip1-alice', make: 'receivedBlip', user: 'alice', place: 'place_c', latlng: r.lplace_c, blip: 'blip1', topics: ['topica'] },

      { key: 'blip2',   make: 'blip',  text: 'blip2', topics: ['topicb'],
        createdTime: createdTime, expiryTime: expiryTime, 
        author: 'doug', place: 'place_d', likes:[bLike]}, 

      { key: 'blip3',   make: 'blip',  text: 'blip3', topics: ['topicc'],
        createdTime: createdTime, expiryTime: expiryTime, 
        author: 'doug', place: 'place_b'}, 

      // bob is tuned into everybody and place_a, but not place_b
      { key: 'bob_a', make: 'tunein', listener: 'bob', listensTo: 'place_a' },    // tune bob into place_a
      { key: 'bob_alice', make: 'tunein', listener: 'bob', listensTo: 'alice' },  // tune bob into alice
      { key: 'bob_carl', make: 'tunein', listener: 'bob', listensTo: 'carl' },    // tune bob into carl
      { key: 'bob_doug', make: 'tunein', listener: 'bob', listensTo: 'doug' }   // tune bob into doug
    );
    
    if ( server.isReady() ) { 
      done(); 
    }
    else {
      events.onServerReady(done);
    }
  });

  beforeEach(function ( done ) { 
    // !jcf! do not let refresh events happen here
    // remove interaction with facebook from this test suite
    sandbox.stub(channelEvents, 'refreshChannelBlips'); 
    sandbox.stub(facebook, 'getPlaces');
    sandbox.stub(facebook, 'getPosts');
    sandbox.stub(graphite, 'set');
    sandbox.stub(intercom);

    mongofix.cleanup(function() { 
      fix.reset(done);
    });
  });
  
  afterEach(function(done) {
    sandbox.restore();
    mongofix.cleanup(done);
  });

  var callbackExpects = function callbackExpects(done,expectedError,expectedValue) {
    var expectation = sandbox.add(sinon.expectation.create('callback'));
    if (expectedValue) {
      expectation.withArgs(expectedError,expectedValue);
    }
    else {
      expectation.withArgs(expectedError);
    }
    expectation.once();
    return function callback(error,value) {
      expectation(error,value);
      var doneTimeOut = function () {
        sandbox.verify();
        done();
      };
      setTimeout(doneTimeOut, 10);
    };
  };

  var callbackExpectsErrorType = function callbackExpectsErrorType(done,errorType) {
    return callbackExpects(done,errorTypeMatcher(errorType));
  };

  var errorTypeMatcher = function errorTypeMatcher(errorType) {
    return sinon.match(function (value) {
      return value.type===errorType;
    },"error.type expected to be "+errorType);
  };

  describe('account update description', function() { 
    it("should return updated alice with description after PUT", function(done) { 
      var alice = fix.get("alice"),
      url = baseURL.clone().path(['accounts', 'me'].join('/')),
      aliceUpdate = { id: alice._id.toString(),
                      name: alice.name,
                      description: "alice description",
                      picture: alice.picture,
                      email: alice.email
                    },
      options = { username: alice._id, password: alice.name, data: aliceUpdate };
      var request = restler.put(url.toString(), options);
      
      request.on('complete', function onComplete (result, response) {
        should.exist(result);
        result.should.not.be.an.instanceOf(Error);
        response.statusCode.should.equal(200);
        result.should.have.property('account');
        result.account.should.have.property('description', aliceUpdate.description);
        //console.log("update description: " + js.pp(result));
        done();
      });
    });
  });

  describe('retrieve topics', function() { 
    it("should return a list of topics including the test fixture topics", function(done) { 
      var alice = fix.get("alice"),
      url = baseURL.clone().path('topics'),
      options = { username: alice._id, password: alice.name },
      request = restler.get(url.toString(), options),
      topica = fix.get("topica"), 
      topicb = fix.get("topicb"), 
      topicc = fix.get("topicc"); 

      request.on('complete', function onComplete (result, response) {
        should.exist(result);
        result.should.not.be.an.instanceOf(Error);
        response.statusCode.should.equal(200);
        result.should.have.property('topics');
        result.topics.should.have.property('data');
        result.topics.should.have.property('paging');

        async.filter(result.topics.data, 
                     function (topic, callback) { 
                       callback(topic.name.indexOf("topic") === 0);
                     }, 
                     function (results) { 
                       results.should.have.lengthOf(3);
                       results[0].should.have.property('id', topica._id.toString());
                       results[0].should.have.property('name', topica.name);
                       results[0].should.have.property('description', topica.description);
                       results[0].should.have.property('picture', topica.picture);
                       results[0].should.have.property('picture2x', topica.picture2x);
                       
                       results[1].should.have.property('id', topicb._id.toString());
                       results[2].should.have.property('id', topicc._id.toString());
                       done();
                     });
      });
    });
  });
  
  describe('listensTo', function() {
    it("should return bob's listeners: place_a, alice, carl, doug", function ( done ) {
      var a = fix.get('place_a'), 
      bob = fix.get('bob'),
      carl = fix.get('carl'),
      doug = fix.get('doug'),
      options = { username: bob._id, password: bob.name },
      url = baseURL.clone().path([bob._id, 'listensTo'].join('/')),
      request = restler.get(url.toString(), options);

      request.on('complete', function onComplete (result, response) {
        should.exist(result);
        result.should.not.be.an.instanceOf(Error);
        response.statusCode.should.equal(200);
        done();
      });
    });
  });

  describe('tuneIn', function ( ) {
    it('should give an error when the place does not exist', function ( done ) {
      var me = fix.get('me'), a = fix.get('place_a'), b = fix.get('place_b');
      var options = { username: me._id, password: me.name }
      var url = baseURL.clone().path([me._id, 'listensTo', '000000000000000000000000'].join('/'));
      var request = restler.post(url.toString(), options);
      request.on('complete', function onComplete (result, response) {
        //console.log("result=" + js.pp(result));
        result.should.not.be.an.instanceOf(Error);
        response.statusCode.should.equal(400);
        should.exist(result);
        result.error.type.should.equal('badRequest');
        done();
      });
    });

    it('should tune me in when the place exists', function ( done ) {
      var me = fix.get('me'), a = fix.get('place_a'), b = fix.get('place_b');
      var options = { username: me._id, password: me.name }
      var url = baseURL.clone().path([me._id, 'listensTo', b._id].join('/'));
      var request = restler.post(url.toString(), options);

      request.on('complete', function onComplete (result, response) {
        should.exist(result);
        result.should.not.be.an.instanceOf(Error);
        response.statusCode.should.equal(200);
        done();
      });
    });

    it('should tune me in to another user channel and notifies the other user', function ( done ) {
      var me = fix.get('me'), alice = fix.get('alice');
      var options = { username: me._id, password: me.name };
      var url = baseURL.clone().path([me._id, 'listensTo', alice._id].join('/'));
      var request = restler.post(url.toString(), options);
      request.on('complete', function onComplete (result, response) {
        result.should.not.be.an.instanceOf(Error);
        response.statusCode.should.equal(200);
        setTimeout(done,50);
        //done();
      });
    });

    it('should have no effect when tuning into the same channel multiple times', function ( done ) {
      var me = fix.get('me'), a = fix.get('place_a'), b = fix.get('place_b');
      var options = { username: me._id, password: me.name }
      var url = baseURL.clone().path([me._id, 'listensTo', b._id].join('/'));
      var request = restler.post(url.toString(), options);
      request.on('complete', function onComplete (result, response) {
        result.should.not.be.an.instanceOf(Error);
        response.statusCode.should.equal(200);
        done();
      });
    });
  });

  describe('tuneOut', function ( ) {
    it('should have no effect when tuning out of a channel I am not tuned into', function ( done ) {
      var me = fix.get('me'), a = fix.get('place_a'), b = fix.get('place_b');
      var options = { username: me._id, password: me.name }
      var url = baseURL.clone().path([me._id, 'listensTo', b._id].join('/'));
      var request = restler.del(url.toString(), options);
      request.on('complete', function onComplete (result, response) {
        result.should.not.be.an.instanceOf(Error);
        response.statusCode.should.equal(200);
        done();
      });
    });

    it('should tune me out when I am tuned into the channel', function ( done ) {
      var me = fix.get('me'), a = fix.get('place_a'), b = fix.get('place_b');
      var options = { username: me._id, password: me.name }
      var url = baseURL.clone().path([me._id, 'listensTo', b._id].join('/'));
      restler.del(url.toString(), options).on('complete', function onComplete (result) {
        result.should.not.be.an.instanceOf(Error);
        done();
      });
    });

    it('should tune me out when I am tuned into channel (b) and then tune me back in (b)', function ( done ) {
      var me = fix.get('me'), b = fix.get('place_b');
      var options = { username: me._id, password: me.name }
      var url = baseURL.clone().path([me._id, 'listensTo', b._id].join('/'));

      restler.post(url.toString(), options).on('complete', function onComplete (result) {
        result.should.not.be.an.instanceOf(Error);
        //console.log(js.pp(result));        
        restler.del(url.toString(), options).on('complete', function onComplete (result) {
          result.should.not.be.an.instanceOf(Error);
          //console.log(js.pp(result));
          
          restler.post(url.toString(), options).on('complete', function onComplete (result) {
            result.should.not.be.an.instanceOf(Error);
            //console.log(js.pp(result));

            done();
          });
        });
      });
    });
  });
  
  describe('broadcast', function() {

    function sendTestBroadcast(author, blip, expiry, callback) {
      console.log("broadcast.sendTestBroadcast " + js.ppc(blip));
      var options = { username: author._id, password: author.name };
      var url = baseURL.clone().path(['channels', author._id, 'blips'].join('/'));
      var request = restler.postJson(url.toString(), blip, options);

      request.on('complete', function onComplete (result, response) {
        should.exist(result);
        response.statusCode.should.equal(200);
        result.blip.message.should.equal(blip.message);
        callback(null, result);
      });
    }

    function getBroadcasts(user, id, count, callback) {
      //console.log("getBroadcasts");

      var options = { username: user._id, password: user.name }; 
      var url = baseURL.clone().path(['channels', id, 'broadcasts'].join('/')); 
      var request = restler.get(url.toString(), options);
      
      request.once('complete', function onComplete (result, response) {
        should.exist(result);
        response.statusCode.should.equal(200);
        result.should.have.property('blips').with.lengthOf(count);
        callback(null, result);
      });
    }

    function getChannelBlipStream(user, id, count, callback) {
      //console.log("getChannelBlipStream expect=" + count);

      var options = { username: user._id, password: user.name }; 
      var url = baseURL.clone().path(['channels', id, 'stream'].join('/')); 
      var request = restler.get(url.toString(), options);
      
      request.once('complete', function onComplete (result, response) {
        response.statusCode.should.equal(200);
        //console.log("result.blips=" + JSON.stringify(result.blips,null,1));
        result.should.have.property('blips').with.lengthOf(count);
        //console.log("callback");
        callback(null, result);
      });
    }
    
    it('should create a basic blip', function(done) { 
      var topica = fix.get("topica"), topicb = fix.get("topicb"), topicc = fix.get("topicc"); 
      //console.log("topica: " + js.pp(topica));

      var now = new Date(), tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate()+1); 

      var me = fix.get('me'), a = fix.get('place_a'), b = fix.get('place_b'),
      blip1 = { authorid : me._id.toString(), 
                placeid:   a._id.toString(),
                topicids:  [topica._id.toString()],
                message:   "test blip",
                expiryTime: tomorrow.toString()
              },
      blip2 = { authorid : me._id.toString(), 
                placeid: a._id.toString(),
                topicids: [topicb._id.toString()],
                message: "blah blah",
                expiryTime: tomorrow.toString()
              };
      
      async.series(
        [ 
          function (callback) { sendTestBroadcast(me, blip1, tomorrow, callback); }, 
          function (callback) { getChannelBlipStream(me, a._id, 1, callback); },
          function (callback) { getChannelBlipStream(me, me._id, 1, callback); },
          function (callback) { sendTestBroadcast(me, blip2, tomorrow, callback); },
          function (callback) { getBroadcasts(me, me._id, 2, callback); },
          function (callback) { getChannelBlipStream(me, me._id, 2, callback); },
          function (callback) { getChannelBlipStream(me, a._id, 2, callback); }
        ], 
        function (err, results) {
          should.not.exist(err);
          //result[2].blips[0].message.should.equal(result[0].blip.message);
          //result[2].blips[1].message.should.equal(result[1].blip.message);
          done();
        });
    });
  });

  describe('POST location', function() {
    it("should update the user's location", function(done) { 
      var me = fix.get('me');
      var options = { username: me._id, password: me.name, data: { latlng:"12,12" } }
      var url = baseURL.clone().path(['accounts', 'me', 'location'].join('/'));
      var request = restler.post(url.toString(), options);
      
      request.on('complete', function onPOSTComplete (result, response) {
        should.exist(result);
        result.should.not.be.an.instanceOf(Error);
        response.statusCode.should.equal(200);
        //console.log("result=" + js.pp(result));
        done();
      });
    });

    it("should fail if a different user attempts to update the user's location", function(done) { 
      var me = fix.get('me'), a = fix.get('place_a');
      var options = { username: me._id, password: me.name, data: { latlng:"12,12" } }
      var url = baseURL.clone().path(['accounts', a._id, 'location'].join('/'));
      var request = restler.post(url.toString(), options);

      request.on('complete', function onPOSTComplete (result, response) {
        should.exist(result);
        result.should.not.be.an.instanceOf(Error);
        response.statusCode.should.equal(403);
        done();
      });
    });
  });

  describe('like blips', function() { 
    function like(user, blip, callback) {
      var options = { username: user._id, password: user.name };
      var url = baseURL.clone().path(['blips', blip._id, 'likes'].join('/'));
      var request = restler.post(url.toString(), options);
      
      request.on('complete', function onPOSTComplete (result, response) {
        should.exist(result);
        result.should.not.be.an.instanceOf(Error);
        response.statusCode.should.equal(200);

        result.should.have.property('likes');
        result.likes.should.have.property('likers').with.lengthOf(1);
        result.likes.should.have.property('isLiker',true);
        result.likes.should.have.property('likeCount',1);

        result.likes.likers[0].name.should.equal(user.name);
        result.likes.likers[0].id.should.equal(user._id.toHexString());

        callback();
      });
    }
    
    function unlike(user, uLike, blip, callback) {
      var userLike = js.clone(uLike);
      userLike.id = user._id;

      var options = { username: user._id, password: user.name };
      var url = baseURL.clone().path(['blips', blip._id, 'likes'].join('/'));
      var request = restler.del(url.toString(), options);
      
      request.on('complete', function onDELETEComplete (result, response) {
        should.exist(result);
        response.statusCode.should.equal(200);

        result.should.have.property('likes');
        result.likes.should.have.property('likers').with.lengthOf(0);
        result.likes.should.have.property('isLiker',false);
        result.likes.should.have.property('likeCount',0);

        callback();
      });
    }

    function getBlip(user, blip, likeCount, isLiker, callback) {
      var options = { username: user._id, password: user.name };
      var url = baseURL.clone().path(['blips', blip._id].join('/'));
      var request = restler.get(url.toString(), options);
      
      request.on('complete', function onGETComplete (result, response) {
        //console.log("getBlip: " + js.pp(result));
        result.should.not.be.an.instanceOf(Error);
        response.statusCode.should.equal(200);

        result.should.have.property('blip');
        result.blip.should.have.property('likes');
        result.blip.likes.should.have.property('likeCount', likeCount);
        result.blip.likes.should.have.property('isLiker', isLiker);
        result.blip.likes.should.have.property('likers').with.lengthOf(likeCount);
        
        callback();
      });
    }

    it("should add me to likes for blip1", function(done) {
      async.series([
        function (callback) {
          like(fix.get('me'), fix.get('blip1'), callback); 
        }, 
        function (callback) {
          getBlip(fix.get('me'), fix.get('blip1'), 1, true, callback);
        }
      ], done);
    });

    it("should remove me from likes for blip1", function(done) {
      async.series([
        function (callback) { 
          unlike(fix.get('bob'), bLike, fix.get('blip2'), callback); 
        },
        function (callback) {
          getBlip(fix.get('bob'), fix.get('blip2'), 0, false, callback);
        }
      ], done);
    });
  });
  
  describe('read blips', function() { 
    function getReceived(user, place, topic, isRead, callback) {
      var latlng = place.location.latitude + "," + place.location.longitude;
      var options = { username: user._id, password: user.name, query: { latlng: latlng, topicids: [topic._id.toString()]} };
      var url = baseURL.clone().path(['channels', user._id, 'received'].join('/'));
      var request = restler.get(url.toString(), options);

      request.on('complete', function onComplete (result, response) {
        should.exist(result);
        result.should.not.be.an.instanceOf(Error);
        response.statusCode.should.equal(200);

        //console.log("result=" + js.pp(result));
        
        var blips = result.blips;
        blips.length.should.equal(1);
        blips[0].should.have.property('isRead', isRead);
        
        callback();
      });
    }

    function markReadAtPlace(user,place,callback) {
      var c = fix.get('place_c');
      var options = { username: user._id, password: user.name };
      var url = baseURL.clone().path(['channels', user._id, 'received', 'place', c._id, 'mark-read'].join('/'));
      var request = restler.post(url.toString(), options);
      
      request.on('complete', function onComplete (result, response) {
        should.exist(result);
        result.should.not.be.an.instanceOf(Error);
        response.statusCode.should.equal(200);
        setTimeout(function() { callback(null, result); },10);
      });
    }

    it("mark blip1 as read at place", function(done) {
      var c = fix.get('place_c');
      var rb = fix.get('blip1-alice');
      async.series([
        function (callback) {
          getReceived(fix.get('alice'), c, fix.get('topica'), false, callback);
        },
        function (callback) { 
          markReadAtPlace(fix.get('alice'), c._id, callback);
        },
        function (callback) {
          getReceived(fix.get('alice'), c, fix.get('topica'), true, callback);
        }
      ], done);
    });
  });


  describe('distribution', function() { 
    var lastNotification;

    beforeEach(function ( done ) { 
      mongofix.cleanup(function() { 
        fix.reset(done);
      });
    });
    
    function reportLocation(user, place, callback) {
      var latlng = place.location.latitude + "," + place.location.longitude;
      var options = { username: user._id, password: user.name, data: { latlng: latlng } };
      var url = baseURL.clone().path(['accounts', 'me', 'location'].join('/'));
      var request = restler.post(url.toString(), options);

      request.on('complete', function onPOSTComplete (result, response) {
        should.exist(result);
        result.should.not.be.an.instanceOf(Error);
        response.statusCode.should.equal(200);
        process.nextTick(function() { callback(null, result); });
      });
    }
    
    function broadcast(author, place, text, callback) {
      var topica = fix.get("topica"), topicb = fix.get("topicb"), topicc = fix.get("topicc"); 
      var blip = { authorid : '' + author._id, 
                   placeid: '' + place._id,
                   message: text, 
                   topicids: [topica._id.toString(), topicb._id.toString()]};
      var options = { username: author._id, password: author.name }
      var url = baseURL.clone().path(['channels', author._id, 'blips'].join('/'));
      var request = restler.postJson(url.toString(), blip, options);
      
      request.on('complete', function onComplete (result, response) {
        should.exist(result);
        response.statusCode.should.equal(200);
        result.blip.message.should.equal(blip.message);
        setTimeout(function() { callback(null, result); },200);
      });
    }

    // function getUnreadReceived(user, place, callback) {
    //   var latlng = place.location.latitude + "," + place.location.longitude;
    //   var options = { username: user._id, password: user.name, query: { latlng: latlng} }
    //   var url = baseURL.clone().path(['channels', user._id, 'received'].join('/'));
    //   var request = restler.get(url.toString(), options);

    //   request.on('complete', function onComplete (result, response) {
    //     should.exist(result);
    //     response.statusCode.should.equal(200);

    //     result.blips.should.be.an.instanceOf(Array);

    //     setTimeout(function() { callback(null, result); },10);
    //   });
    //   request.on('error', function onError (error,response) {
    //     callback(error);
    //   });
    // }

    function getReceived(user,place, callback) {
      var latlng = place.location.latitude + "," + place.location.longitude;
      var options = { username: user._id, password: user.name, query: { latlng: latlng} };
      var url = baseURL.clone().path(['channels', user._id, 'received'].join('/'));
      var request = restler.get(url.toString(), options);

      request.on('complete', function onComplete (result, response) {
        should.exist(result);
        result.should.not.be.an.instanceOf(Error);
        response.statusCode.should.equal(200);

        setTimeout(function() { callback(null, result); },10);
      });
    }

    function markRead(user,place,callback) {
      var latlng = place.location.latitude + "," + place.location.longitude;
      var options = { username: user._id, password: user.name, query: { latlng: latlng} };
      var url = baseURL.clone().path(['channels', user._id, 'received','mark-read'].join('/'));
      var request = restler.post(url.toString(), options);

      request.on('complete', function onComplete (result, response) {
        should.exist(result);
        result.should.not.be.an.instanceOf(Error);
        response.statusCode.should.equal(200);
        setTimeout(function() { callback(null, result); },10);
      });
    }

    function readBlips(blips) {
      return blips.filter(function (blip) { return blip.isRead===true; });
    }

    function unreadBlips(blips) {
      return blips.filter(function (blip) { return blip.isRead===false; });
    }
    
    function verifyNotifications(notifications, user, expected, numBlips, numChannels, callback) {
      notifications.should.have.property('paging');
      
      notifications.should.have.property('blips');
      Object.keys(notifications.blips).length.should.equal(numBlips);
      
      notifications.should.have.property('channels');
      Object.keys(notifications.channels).length.should.equal(numChannels);
      
      notifications.should.have.property('data').with.lengthOf(expected.length);
      notifications.data.forEach(function (notification, index) {
        notification.should.have.property('type', expected[index].type);
        notification.should.have.property('userId', expected[index].userId.toString());
        notification.should.have.property('isNew', expected[index].isNew);
        
        var blipId = notification.blipId;
        var blip = notifications.blips[blipId];
        blip.should.have.property('author');
        blip.author.should.have.property('id', expected[index].authorId.toString());
      });
      
      //console.log("getNotifications + " + user._id + " -> " + js.pp(result));
      process.nextTick(function() { callback(null, notifications); });
    }

    function getNotifications(user, expected, numBlips, numChannels, callback) { 
      var options = { username: user._id, password: user.name};
      var url = baseURL.clone().path(['accounts', 'me', 'notifications'].join('/'));
      var request = restler.get(url.toString(), options);
      
      request.on('complete', function onComplete (result, response) {
        should.exist(result);
        result.should.not.be.an.instanceOf(Error);
        response.statusCode.should.equal(200);
        result.should.have.property("notifications");
        verifyNotifications(result.notifications, user, expected, numBlips, numChannels, callback);
      });
    }

    function acknowledgeNotifications(user, notificationId, expected, numBlips, numChannels, callback) { 
      var options = { username: user._id, 
                      password: user.name, 
                      data: { id: notificationId}
                    };
      var url = baseURL.clone().path(['accounts', 'me', 'notifications', 'acknowledge'].join('/'));
      var request = restler.post(url.toString(), options);
      
      request.on('complete', function onComplete (result, response) {
        should.exist(result);
        result.should.not.be.an.instanceOf(Error);
        response.statusCode.should.equal(200);
        result.should.have.property("notifications");
        //console.log("acknowledgeNotifications + " + user._id + " -> " + js.pp(result));
        verifyNotifications(result.notifications, user, expected, numBlips, numChannels, callback);
      });
    }

    it("Alice broadcasts blip at place B, Carl broadcasts a blip at place B. Doug broadcasts at place B. Bob moves near place B and marks blips read there.", function(done) {
      var aliceMsg = "Alice at place B!";
      var carlMsg = "Carl at place B!";
      var dougMsg = "Doug at place B!";
      var aliceMsg2 = "Alice at place B again!";
      var aliceMsg3 = "Alice broadcasts thrice";
      var alice = fix.get('alice');
      var bob = fix.get('bob');
      var carl = fix.get('carl');
      var doug = fix.get('doug');
      var place_a = fix.get('place_a'); 
      var place_b = fix.get('place_b'); 
      var objectIDMatcher = require('../unit/mongoFaker').objectIDMatcher;

      //console.log("alice._id="+alice._id);
      //console.log("bob._id="+bob._id);
      //console.log("carl._id="+carl._id);
      //console.log("doug._id="+doug._id);
      //console.log("place_a._id="+place_a._id);
      //console.log("place_b._id="+place_b._id);
      async.series([
        function alice_report_at_b(callback) {
          pushNotMock = sandbox.mock(pushnot);
          pushNotMock.expects('sendPushNotification').never();
          reportLocation(alice,place_b, function(error, result) {
            //console.log("reportLocation callback called");
            should.not.exist(error);
            setTimeout(function () {
              sandbox.verify();
              callback(error,result);
            }, 10);
          });
        },
        function alice_broadcast_at_b(callback) {
          console.log("Alice: broadcast blip at B");
          pushNotMock = sandbox.mock(pushnot);
          pushNotMock.expects('sendPushNotification').never();
          broadcast(alice, place_b, aliceMsg, function (error,result) {
            sandbox.verify(); 
            callback(error, result);
          });
        },
        function verify_alice_no_blips_at_b(callback) {
          console.log("Alice: should have no blips after broadcasting at place B");
          getReceived(alice,place_b, function (error,result) {
            var blips = result.blips;
            blips.length.should.equal(0);
            callback(error,result);
          });
        },
        function carl_broadcast_at_b(callback) {
          console.log("Carl: broadcast blip at B");
          pushNotMock = sandbox.mock(pushnot);
          pushNotMock.expects('sendPushNotification').never();
          broadcast(carl, place_b, carlMsg, function (error,result) {
            sandbox.verify();
            callback(error,result);
          });
        },
        function carl_report_at_b(callback) {
          console.log("Carl: reports location at place B after broadcast, and should not receive pushnots");
          pushNotMock = sandbox.mock(pushnot);
          pushNotMock.expects('sendPushNotification').never();
          reportLocation(carl,place_b, function(error, result) {
            //console.log("reportLocation callback called");
            should.not.exist(error);
            setTimeout(function () {
              sandbox.verify();
              callback(error,result);
            }, 10);
          });
        },
        function doug_broadcast_at_b(callback) {
          console.log("Doug: broadcast blip at B");
          pushNotMock = sandbox.mock(pushnot);
          pushNotMock.expects('sendPushNotification').never();
          broadcast(doug, place_b, dougMsg, function (error,result) {
            sandbox.verify();
            callback(error,result);
          });
        },
        function verify_bob_no_blips_at_a(callback) {
          console.log("Bob: should have no received blips at his current location, place_a");
          pushNotMock = sandbox.mock(pushnot);
          pushNotMock.expects('sendPushNotification').never();
          getReceived(bob, place_a, function(error, result) {
            //console.log("getReceived callback called");
            should.not.exist(error);
            sandbox.verify();
            var blips = result.blips;
            blips.length.should.equal(0);
            callback(error, result);
          });
        },
        function verify_bob_3_blips_at_b(callback) {
          console.log("Bob: should have 3 incoming blips at place B");
          pushNotMock = sandbox.mock(pushnot);
          pushNotMock.expects('sendPushNotification').never();
          getReceived(bob, place_b, function(error, result) {
            //console.log("getUnreadReceived callback called");
            should.not.exist(error);
            sandbox.verify();
            var blips = result.blips;
            unreadBlips(blips).length.should.equal(3);
            readBlips(blips).length.should.equal(0);
            callback(error, result);
          });
        },
        function bob_report_at_b(callback) {
          console.log("Bob: reports location at place B");
          pushNotMock = sandbox.mock(pushnot);
          pushNotMock.expects('sendPushNotification')
            .withArgs(objectIDMatcher(bob._id), 1, "doug @ place_b: " + dougMsg)
            .once();
          reportLocation(bob,place_b, function(error, result) {
            //console.log("reportLocation callback called");
            should.not.exist(error);
            // need a timer here since userManager.pushNotifyUser takes a while to complete
            setTimeout(function() { 
              sandbox.verify(); 
              callback(error, result);
            }, 100);
          });
        },
        function bob_get_1_notifications(callback) {
          console.log("Bob: retrieves 1 notification for doug's blip");
          var expected = [ { type: 'blip', userId: bob._id, isNew: true, authorId: doug._id} ];
          getNotifications(bob, expected, 1, 1, function(error, notifications) { 
            should.not.exist(error);           
            sandbox.verify();
            callback(error,notifications);
          });
        },
        function bob_mark_read_at_b(callback) {
          console.log("Bob: marks blips at place B read");
          markRead(bob,place_b, function(error, result) {
            //console.log("markRead callback called");
            should.not.exist(error);
            callback(error, result);
          });
        },
        function bob_verify_3_read_blips_at_b(callback) {
          console.log("Bob: should now have 0 unread and 3 read blips at place B");
          getReceived(bob,place_b, function(error, result) {
            //console.log("getReceived callback called");
            should.not.exist(error);

            var blips = result.blips;
            unreadBlips(blips).length.should.equal(0);
            readBlips(blips).length.should.equal(3);
            callback(error, result);
          });
        },
        function alice_broadcast2_at_b(callback) {
          console.log("Alice: broadcasts a second blip at place B and Bob should immediately receive a second notification.");
          pushNotMock = sandbox.mock(pushnot);
          // badge is 2 since none of the notifications has been marked read by Bob
          pushNotMock.expects('sendPushNotification').withArgs(objectIDMatcher(bob._id),2,"alice @ place_b: "+aliceMsg2);
          pushNotMock.expects('sendPushNotification').withArgs(objectIDMatcher(alice._id)).never();
          broadcast(alice, place_b, aliceMsg2, function (error,result) {
            sandbox.verify();
            callback(error,result);
          });
        },
        function bob_get_2_notifications(callback) {
          console.log("Bob: retrieves 2 notifications");
          var expected = [ 
            { type: 'blip', userId: bob._id, isNew: true, authorId: alice._id},
            { type: 'blip', userId: bob._id, isNew: true, authorId: doug._id}
          ];
          getNotifications(bob, expected, 2, 1, function(error, notifications) { 
            should.not.exist(error);
            sandbox.verify();
            lastNotification = notifications.data[0].id;
            callback(error,notifications);
          });
        },
        function bob_acknowledge_notifications(callback) { 
          console.log("Bob: acknowledge 2 notifications");
          var expected = [ 
            { type: 'blip', userId: bob._id, isNew: false, authorId: alice._id},
            { type: 'blip', userId: bob._id, isNew: false, authorId: doug._id}
          ];
          assert(lastNotification);
          acknowledgeNotifications(bob, lastNotification, expected, 2, 1, function(error, notifications) { 
            should.not.exist(error);
            sandbox.verify();
            callback(error,notifications);
          });          
        },
        function alice_broadcast3_at_b(callback) {
          console.log("Alice: broadcasts a third blip at place B and Bob should immediately receive a notification for the second blip.");
          pushNotMock = sandbox.mock(pushnot);
          // badge is 1 since both of the notifications have been marked read by Bob
          pushNotMock.expects('sendPushNotification').withArgs(objectIDMatcher(bob._id),1,"alice @ place_b: "+aliceMsg3);
          pushNotMock.expects('sendPushNotification').withArgs(objectIDMatcher(alice._id)).never();
          broadcast(alice, place_b, aliceMsg3, function (error,result) {
            sandbox.verify();
            callback(error,result);
          });
        },
        function bob_verify_2_unread_3_read_blips_at_b(callback) {
          console.log("Bob: should have 2 unread and 3 read blips at place B");
          
          getReceived(bob,place_b, function(error, result) {
            //console.log("getUnreadReceived callback called");
            should.not.exist(error);
            
            var blips = result.blips;
            unreadBlips(blips).length.should.equal(2);
            readBlips(blips).length.should.equal(3);
            callback(error, result);
          });
        },
        function bob_mark_read_at_b(callback) {
          console.log("Bob: marks blips at place B read");
          markRead(bob,place_b, function(error, result) {
            //console.log("markRead callback called");
            should.not.exist(error);
            callback(error, result);
          });
        },
        function bob_verify_5_read_blips_at_b(callback) {
          console.log("Bob: should now have 0 unread blips and 5 read blips at place B");
          getReceived(bob,place_b, function(error, result) {
            //console.log("getUnreadReceived callback called");
            should.not.exist(error);

            var blips = result.blips;
            unreadBlips(blips).length.should.equal(0);
            readBlips(blips).length.should.equal(5);
            callback(error, result);
          });
        }
      ], done);
    });    

    it("Alice broadcasts blip at place A. Bob (tuned into place A and Alice) has a single blip in incoming at place A", function(done) {
      var blipMessage = "hi all";
      var alice = fix.get('alice');
      var bob = fix.get('bob');
      var place_a = fix.get('place_a');
      var place_b = fix.get('place_b'); 

      async.series([
        function(callback) {
          //console.log("Alice: broadcast blip at A");
          broadcast(alice, place_a, blipMessage, callback);
        },
        function(callback) {
          //console.log("Bob: retrieve incoming at A");
          getReceived(bob, place_a, function(error, result) {
            should.not.exist(error);

            var blips = result.blips;
            blips.length.should.equal(1);
            blips[0].message = blipMessage;
            callback(error, result);
          });
        }
      ], done);
    });
    

   it("Alice broadcasts blip at place A, Carl broadcasts a blip at place A. Doug broadcasts at place B. Bob's incoming at place A contains only Alice and Carl's blips.", function(done) {
      var aliceMsg = "Alice at place A!";
      var carlMsg = "Carl at place A!";
      var dougMsg = "Doug at place B!";
      var alice = fix.get('alice');
      var bob = fix.get('bob');
      var carl = fix.get('carl');
      var doug = fix.get('doug');
      var place_a = fix.get('place_a'); 
      var place_b = fix.get('place_b'); 
      //console.log("alice._id="+alice._id);
      //console.log("bob._id="+bob._id);
      //console.log("carl._id="+carl._id);
      //console.log("doug._id="+doug._id);
      //console.log("place_a._id="+place_a._id);
      //console.log("place_b._id="+place_b._id);
      async.series([
        function(callback) {
          //console.log("Alice: broadcast blip at A");
          broadcast(alice, place_a, aliceMsg, callback);
        },
        function(callback) {
          //console.log("Carl: broadcast blip at A");
          broadcast(carl, place_a, carlMsg, callback);
        },
        function(callback) {
          //console.log("Doug: broadcast blip at B");
          broadcast(doug, place_b, dougMsg, callback);
        },

        function(callback) {
          //console.log("Bob: retrieve incoming at A");
          getReceived(bob, place_a, function(error, result) {
            //console.log("getReceived callback called");
            should.not.exist(error);

            var blips = result.blips;
            blips.length.should.equal(2);
            blips[0].message.should.equal(carlMsg);
            blips[1].message.should.equal(aliceMsg);
            callback(error, result);
          });
        }
      ], done);
    });


  });
});
