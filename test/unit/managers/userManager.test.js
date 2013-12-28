/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview User manager unit test
 * @author vladimir@blipboard.com
 *
 * @created Thu, Mar 01 2012 - 23:27:25 -0800
 * @updated Fri, Mar 02 2012 - 09:45:26 -0800
 */

var sinon = require('sinon');
var should = require('should');
var assert = require('assert');

var BBError = require('../../../lib/error').BBError;
var ObjectID = require('../../../lib/mongo').ObjectID;
var blipManager = require('../../../managers/blipManager');
var blipNotificationService = require('../../../managers/blipNotificationService');
var channelEvents = require('../../../managers/channelEvents');
var facebook = require('../../../lib/facebook');
var js = require('../../../lib/javascript');
var listenNetworkManager = require('../../../managers/listenNetworkManager');
var mongo = require('../../../lib/mongo');
var mongoConfig = require('../../../config').MONGO;
var mongoFaker = require('../mongoFaker');
var notificationManager = require('../../../managers/notificationManager');
var objectIDMatcher = mongoFaker.objectIDMatcher;
var password = require('../../../lib/password');
var placeManager = require('../../../managers/placeManager');
var pushnot = require('../../../lib/pushnot');
var toArrayWithArgs = require('../mongoFaker').toArrayWithArgs;
var userManager = require('../../../managers/userManager');
    
describe('userManager', function ( ) {
  var validChannel; // must setup the channel fresh each time (userManager.createAnonymous user sets the pwd field)
  var sandbox;

  beforeEach(function () {
    sandbox = sinon.sandbox.create();
    sandbox.add(mongoFaker.fake());
    validChannel = { _id: '1234567890ab1234567890ab',
                     password: password.makeSaltedHash('#password') };
  });

  afterEach(function () {
    sandbox.verify();
    sandbox.restore();  
  });

  function channelFindsOne(error,doc) {
    sandbox.mock(mongo.channels).expects('findOne')
      .once()
      .yields(error,doc);
  }

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
    }
  }

  var callbackExpectsErrorType = function callbackExpectsErrorType(done,errorType) {
    return callbackExpects(done,errorTypeMatcher(errorType));
  }

  var errorTypeMatcher = function errorTypeMatcher(errorType) {
    return sinon.match(function (value) {
      return value.type===errorType;
    },"error.type expected to be "+errorType);
  }

  function callbackValidates(done,fn) {
    return function callback(error,value) {
      setTimeout(function () {
        fn(error,value);
        sandbox.verify();
        done();
      }, 10);
    }
  }

  describe('#createAnonymousUser()', function ( ) {
    it('should return newUser when called', function (done ) {
      sandbox.mock(mongo.channels).expects('save').yields(null,validChannel);
      userManager.createAnonymousUser("#password", callbackExpects(done,null,validChannel));
    });
    it('should callback with a validation error if invalid password is provided', function (done ) {
      sandbox.mock(mongo.channels).expects('save').never();
      userManager.createAnonymousUser(null, callbackExpectsErrorType(done,BBError.validationError.type));
    });

  }); // createAnonymousUser test

  describe('#authenticateUser(uid, pswd, callback)', function ( ) {
    it('should call back with a non existent user error when wrong id is provided', function (done ) {
      var userIdDoesntExist = "999999999999999999999999";
      
      channelFindsOne(null,null);
      
      userManager.authenticateUserBasic(userIdDoesntExist, 'bad password', callbackValidates(done,function (error, user) {
        should.exist(error);
        error.message.should.match(/.*User with the given id does not exist.*/);
      }));
    });

    it('should call back with a bad password error when bad password is provided', function (done) {
      channelFindsOne(null,validChannel);
      userManager.authenticateUserBasic(validChannel._id, 'bad password', 
                                        callbackValidates(done,function (error, user) {
                                          should.exist(error);
                                          error.message.should.match(/.*Password did not pass validation.*/);
                                        }));
    });
    
    it('should call back with no error and a valid user channel document when everything is done correctly', function (done ) {
      channelFindsOne(null,validChannel);
      userManager.authenticateUserBasic(validChannel._id, "#password", 
                                        callbackValidates(done,function (error, user) {
                                          should.not.exist(error);
                                          user.should.equal(validChannel);
                                        }));
    });
  }); // authenticateUser test

  describe('#createFacebookUser', function() { 
    var jason = { _id: ObjectID('FFFFFFFFFFFFFFFFFFFFFFFF'),
                  name: "Jason", 
                  displayName: "JasonF",
                  picture: "http://example.com",
                  email: "jason@example.com",
                  facebook: {id: "1234", accessToken: "accessToken"},
                  type: "user" 
                },
    alice = { _id: ObjectID('000000000000000000000000'),
              name: "alice",
              type: mongo.channelType.user },
    guru = { _id: ObjectID('111111111111111111111111'),
             name: "guru", 
             displayName: "Guru",
             picture: "http://guru",
             email: "guru@example.com",
             facebook: {id: '5678', accessToken: "accessToken"},
             type: mongo.channelType.user },
    pluto = { _id: ObjectID('111111111111111111111111'),
              name: "pluto",
              type: mongo.channelType.place };

    it('should reject invalid password', function(done) { 
      userManager.createFacebookUser("aaaaaaaaaaaaaaaaaaaaaa", "1234", function(error) { 
        should.exist(error);
        error.type.should.equal("validationError");
        done();
      });
    });

    it('should handle mongo error on facebook profile retrieval as failedToAuthenticate', function(done) {
      sandbox.stub(facebook, 'getMe').yieldsAsync(BBError.facebookError);
      sandbox.stub(mongo.channels, 'update').yieldsAsync();
      userManager.createFacebookUser("aaaaaaaaaaaaaaaaaaaaaa", "12345678", function(error) { 
        should.exist(error);
        error.type.should.equal(BBError.failedToAuthenticate.type);
        done();
      });
    });

    it('should handle mongo error on user creation', function(done) {
      sandbox.stub(facebook, 'getMe').yieldsAsync(null, {name: "Jason", id: "fbid", email: "jason@example.com"});
      sandbox.mock(mongo.channels).expects('update').never();
      sandbox.mock(mongo.channels).expects('findOne').once().yieldsAsync(BBError.mongoFailed);
      //sandbox.mock(mongo.channels).expects('findAndModify').once().yieldsAsync(BBError.mongoFailed);
      
      userManager.createFacebookUser("aaaaaaaaaaaaaaaaaaaaaa", "12345678", function(error) { 
        should.exist(error);
        error.type.should.equal(BBError.mongoFailed.type);
        done();
      });
    });

    it('should handle facebook error on getMySocialNetwork failure', function(done) {
      sandbox.stub(facebook, 'getMe').yieldsAsync(null, {name: "Jason", id: "1234", email: "jason@example.com"});
      sandbox.mock(mongo.channels).expects('update').never();
      sandbox.mock(mongo.channels).expects('findOne').once().yieldsAsync(null,jason);
      sandbox.mock(mongo.channels).expects('findAndModify').once().yieldsAsync(null, jason);
      sandbox.stub(facebook, 'getMySocialNetwork').yieldsAsync(BBError.facebookError);
      sandbox.mock(mongo.channels).expects('find').once().returns(toArrayWithArgs(null, [])); // recommended users
      userManager.createFacebookUser("aaaaaaaaaaaaaaaaaaaaaa", "12345678", function(error, user) { 
        should.not.exist(error);
        should.exist(user);
        assert(user._id.equals(jason._id));
        done();
      });
    });
    
    it('should create user and send no friends/notifications for auto-follows', function(done) {
      sandbox.stub(facebook, 'getMe').yieldsAsync(null, {name: "Jason", id: "fbid", email: "jason@example.com"});
      sandbox.mock(mongo.channels).expects('findOne').once().yieldsAsync(null);
      sandbox.mock(mongo.channels).expects('insert').once().yieldsAsync(null, [jason]);
      sandbox.stub(facebook, 'getMySocialNetwork').yieldsAsync(null, []);
      sandbox.mock(mongo.channels).expects('update').once(); // lastFBNetworkSync
      sandbox.mock(notificationManager).expects('makeNewChannelNotification').never();
      sandbox.mock(mongo.channels).expects('find').once().returns(toArrayWithArgs(null, [])); // recommended users
      userManager.createFacebookUser("aaaaaaaaaaaaaaaaaaaaaa", "12345678", function(error, user) { 
        should.not.exist(error);
        should.exist(user);
        assert(user._id.equals(jason._id));
        done();
      });
    });
    
    it('should create user and send notification for auto-follows of 1 recommended guru', function(done) {
      var chmock = sandbox.mock(mongo.channels);
      sandbox.stub(facebook, 'getMe').yieldsAsync(null, {name: "Jason", id: "fbid", email: "jason@example.com"});
      sandbox.mock(mongo.channels).expects('findOne').once().yieldsAsync(null);
      sandbox.mock(mongo.channels).expects('insert').once().yieldsAsync(null, [jason]);
      sandbox.stub(facebook, 'getMySocialNetwork').yieldsAsync(null, []);
      chmock.expects('update').once(); // lastFBNetworkSync
      sandbox.mock(notificationManager).expects('makeNewChannelNotification').never();

      chmock.expects('find').once().returns(toArrayWithArgs(null, [guru])); // recommended users
      sandbox.mock(listenNetworkManager).expects("listen").withArgs(jason._id, guru._id).yields(null);
      sandbox.mock(notificationManager).expects('makeNewTopUsersNotification')
        .withArgs(jason._id, 
                  "You're now following 1 guru!",
                  'Follow more to make Blipboard more fun', 
                  'We added 1 guru to your "Following" map. Follow more gurus to make Blipboard more fun!')
        .once()
        .yieldsAsync(null);
      
      userManager.createFacebookUser("aaaaaaaaaaaaaaaaaaaaaa", "12345678", function(error, user) { 
        should.not.exist(error);
        should.exist(user);
        assert(user._id.equals(jason._id));
        done();
      });
    });

    it('should create user and send a notification for auto-follow 1 friend', function(done) {
      var chmock = sandbox.mock(mongo.channels);
      sandbox.stub(facebook, 'getMe').yieldsAsync(null, {name: "Jason", id: "fbid", email: "jason@example.com"});
      sandbox.mock(mongo.channels).expects('findOne').once().yieldsAsync(null);
      sandbox.mock(mongo.channels).expects('insert').once().yieldsAsync(null, [jason]);
      sandbox.stub(facebook, 'getMySocialNetwork').yieldsAsync(null, ['fb1']);
      chmock.expects('update').once(); // lastFBNetworkSync
      chmock.expects('find').withArgs({'facebook.id': {$in: ['fb1']}}).once().returns(toArrayWithArgs(null, [alice]));
      sandbox.mock(listenNetworkManager).expects("listen").withArgs(jason._id, alice._id).yields(null);
      sandbox.mock(notificationManager).expects('makeNewChannelNotification')
        .withArgs(jason._id, 
                  "You're following more blippers!",
                  '1 Facebook friend added to "Following" map', 
                  'Your "Following" map now shows blips of 1 friend you like from Facebook',
                  jason._id)
        .once()
        .yieldsAsync(null);
      chmock.expects('find').withArgs({type:'user', 
                                       name:{$exists:true},
                                       recommended:true,
                                       'stats.score':{$gt:0}})
        .once().returns(toArrayWithArgs(null, [])); // recommended users
      
      userManager.createFacebookUser("aaaaaaaaaaaaaaaaaaaaaa", "12345678", function(error, user) { 
        should.not.exist(error);
        should.exist(user);
        assert(user._id.equals(jason._id));
        done();
      });
    });



    it('should create user and send a notification for auto-follow 1 friend and 1 place', function(done) {
      var chmock = sandbox.mock(mongo.channels);
      sandbox.stub(facebook, 'getMe').yieldsAsync(null, {name: "Jason", id: "fbid", email: "jason@example.com"});
      sandbox.mock(mongo.channels).expects('findOne').once().yieldsAsync(null);
      sandbox.mock(mongo.channels).expects('insert').once().yieldsAsync(null, [jason]);
      sandbox.stub(facebook, 'getMySocialNetwork').yieldsAsync(null, ['fb1','fb2']);
      chmock.expects('update').once(); // lastFBNetworkSync
      chmock.expects('find').withArgs({'facebook.id': {$in: ['fb1','fb2']}}).once().returns(toArrayWithArgs(null, [alice,pluto]));
      sandbox.mock(listenNetworkManager).expects("listen").withArgs(jason._id).yields(null).twice();
      sandbox.mock(notificationManager).expects('makeNewChannelNotification')
        .withArgs(jason._id, 
                  "You're following more blippers!",
                  '1 Facebook friend and 1 place added to "Following" map', 
                  'Your "Following" map now shows blips of 1 friend and 1 place you like from Facebook',
                  jason._id)
        .once()
        .yieldsAsync(null);
      chmock.expects('find').withArgs({type:'user', 
                                       name:{$exists:true},
                                       recommended:true,
                                       'stats.score':{$gt:0}})
        .once().returns(toArrayWithArgs(null, [])); // recommended users

      userManager.createFacebookUser("aaaaaaaaaaaaaaaaaaaaaa", "12345678", function(error, user) { 
        should.not.exist(error);
        should.exist(user);
        assert(user._id.equals(jason._id));
        done();
      });
    });
  });

  describe('#updateFacebookUser', function() { 
    
  });

  describe('#reportLocation(user, location,  callback)', function ( ) {
    it('should call back with an error when bad userid is provided', function (done ) {
      var newLocation = { latitude: 1, longitude: 2 };
      var userBadId = {_id:"asdfasdf",currentLocation: {longitude:1,latitude:1,tileIndex:"123123123123123"}};
      sandbox.mock(mongo.channels).expects('update').never();

      sandbox.mock(channelEvents).expects('currentTileChanged').never();

      userManager.reportLocation(userBadId, newLocation, {}, callbackValidates(done,function (error) {
        should.exist(error);
        error.message.should.match(/.*Invalid parameter.*/);
      }));
    });

    it('should call back with an error when bad location (missing latitude) is provided', function (done ) {
      var newLocation = { longitude:1};
      var userBadLocation = {_id:ObjectID('000000000000000000000000'),
                             type:   mongo.channelType.user,
                             currentLocation: { latitude:1, tileIndex:"123123123123" }};
      sandbox.mock(mongo.channels).expects('update').never();

      sandbox.mock(channelEvents).expects('currentTileChanged').never();

      userManager.reportLocation(userBadLocation, newLocation, {}, callbackValidates(done,function (error) {
        should.exist(error);
        error.message.should.match(/.*Invalid parameter.*/);
      }));
    });


    it('should call back with an error when mongo fails to update', function (done ) {
      var newLocation = { latitude: 1, longitude: 2 };
      var user = {_id:    ObjectID('000000000000000000000000'),
                  type:   mongo.channelType.user,
                  currentLocation: { longitude:2,latitude:3 }};
      sandbox.mock(mongo.channels).expects('update').yields(new Error("some mongo error"),null);
      sandbox.mock(channelEvents).expects('currentTileChanged').never();
      // sandbox.mock(mongo.reportedLocationHistory).expects('insert').once();

      userManager.reportLocation(user, newLocation, {}, callbackValidates(done,function (error) {
        should.exist(error);
        error.message.should.match(/.*MongoDB request failed.*/);
      }));
    });

    it('should call back with no error when everything is done correctly', function (done ) {
      var location = { latitude: 1, longitude: 2 } ;
      var user = {_id:    ObjectID('000000000000000000000000'),
                  type:   mongo.channelType.user,
                  currentLocation: { longitude:90,latitude:90 }};
      sandbox.mock(mongo.channels).expects('update').yields(null,1);
      sandbox.mock(blipNotificationService).expects('pushNotifyUserAtLocation').once().yields(null, true);
      //sandbox.mock(placeManager).expects('prepopulate').once(); 
      sandbox.mock(channelEvents).expects('currentTileChanged').once();
      // sandbox.mock(mongo.reportedLocationHistory).expects('insert').once();

      userManager.reportLocation(user, location, {}, callbackValidates(done,function (error, tile) {
        should.not.exist(error);
        should.exist(tile);
        tile.latitude.should.equal(location.latitude);
        tile.longitude.should.equal(location.longitude);
      }));
    });

    it('should not call the currentTileChanged event when the tileIndex is the same', function (done ) {
      var location = { latitude: 1, longitude: 2 } ;
      var user = {_id:    ObjectID('000000000000000000000000'),
                  type:   mongo.channelType.user,
                  currentLocation: { latitude:1,longitude:2 }};
      sandbox.mock(mongo.channels).expects('update').yields(null,1);
      sandbox.mock(channelEvents).expects('currentTileChanged').never();
      // sandbox.mock(mongo.reportedLocationHistory).expects('insert').once();

      userManager.reportLocation(user, location, {}, callbackValidates(done,function (error, tile) {
        should.not.exist(error);
        should.exist(tile);
        tile.latitude.should.equal(location.latitude);
        tile.longitude.should.equal(location.longitude);
      }));
    });
  }); // reportLocation test
});

