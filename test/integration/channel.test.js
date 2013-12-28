var async = require('async');
var fs = require('fs');
var should=require('should');
var sprintf=require('sprintf').sprintf;
var sinon = require('sinon');
var restler = require('restler');

var mongo = require('../../lib/mongo');
var mongofix = require('./mongofix');
var config = require('../../config');
var js = require('../../lib/javascript');
var events = require('../../lib/events');
var facebook = require('../../lib/facebook');
var graphite = require('../../lib/graphite');
var intercom = require('../../lib/intercom');
var castroPlacesFile = __dirname + "/" + "castroPlaces.json";
var castroPlaces = JSON.parse(fs.readFileSync(castroPlacesFile, 'ascii'));

function countInTile(location, places) {
  var count=0;
  var ref = mongo.tile(location.latitude, location.longitude);

  for (var i in places) {
    if (ref.containsLatLon(places[i].location.latitude, places[i].location.longitude)) count++;
  }
  return count;
}

var castro = {latitude  : 38.7603, longitude : -122.4346 };
var castroTile = mongo.tile(castro.latitude, castro.longitude, config.MONGO.tileZoomLevel);
var countInCastroTile = countInTile(castro, castroPlaces.data);

describe('channel integration', function(){
  var sandbox,facebookMock, fix, me;
 
  var clearMongo = function clearMongo(callback) {
    //console.log("castro tileIndex=" + castroTile.toIndex());
    async.parallel([function (callback) { mongo.tileInfos.remove({tileIndex: castroTile.toIndex()}, {safe:true}, callback) },
                    function (callback) { mongo.channels.remove({'location.tileIndex': castroTile.toIndex()}, {safe:true}, callback) },
                    function (callback) { mongo.channels.remove({'facebook.id': "facebook.999999999"}, callback) },
                    function (callback) { mongo.channels.update({recommended: true}, {$set: {recommended: false}}, {multi:true}, callback) }
                   ], 
                   callback);
  };
  
  var setup = function setup(done) {
    fix = mongofix.MongoFix( 
      { key: 'me',   make: 'user',   name: 'me' }
    );
    me = fix.get('me');

    // starts the server (SUT)
    var server = require('../../server.js');
    mongo = require('../../lib/mongo');

    if ( server.isReady() ) {
      clearMongo(done); 
    }
    else {
      events.onServerReady(function () {
        // clear out the mongo state for facebook tiles
        clearMongo(done);
      });
    }
  };
  
  before(function(done) { 
    console.log("SETUP");
    setup(done);
  });

  describe('#POST /accounts', function(done) {
    var account,accountid, password = "password1234";

    beforeEach(function(done) {
      mongofix.cleanup(function() { 
        sandbox = sinon.sandbox.create();
        facebookMock = sandbox.mock(facebook);
        sandbox.stub(graphite, 'set');
        sandbox.stub(intercom);
        fix.reset(done);
      });
    });
    
    afterEach(function(done) {
      console.log("afterEach: cleanup");
      sandbox.verify();
      sandbox.restore();
      mongo.channels.remove({'facebook.id':/^facebook/}, function() { 
        mongofix.cleanup(done);
      });
    });
    
    function createAnonymous(callback){
      var request = restler.post(sprintf('http://localhost:%s/accounts?password=%s', config.SERVER.url.port(), password));
      console.log("createAnonymous: ");
      request.once('complete', function onComplete (result, response) {
        should.exist(result);
        result.should.not.be.an.instanceof(Error);
        account = result.account;
        accountid = result.account.id;
        response.statusCode.should.equal(200);
        callback(null,result);
      });
    }

    function createFacebookUser(callback) {
      var fbresult = {
        "id": "facebook.999999999",
        "email": "jason.fischl@gmail.com",
        "name": "Jason Fischl"
      };
      facebookMock.expects("getMe").yields(null, fbresult);
      facebookMock.expects("getMySocialNetwork").yields(null, []);

      var request = restler.post(sprintf('http://localhost:%s/accounts?password=%s&fbtoken=xxxxxxxxx', 
                                         config.SERVER.url.port(), password));
      console.log("createFacebookUser: ");
      request.once('complete', function onComplete (result, response) {
        should.exist(result);
        result.should.not.be.an.instanceof(Error);
        account = result.account;
        accountid = account.id;

        account.facebookId.should.equal(fbresult.id);
        account.email.should.equal(fbresult.email);
        account.name.should.equal(fbresult.name);
        response.statusCode.should.equal(200);
        callback(null,result);
      });
    }

    function makeUpdateFacebookToken(authType, getSocial) {
      return function updateFacebookToken(callback) {
        var fbresult = {
          "id": "facebook.999999999",
          "email": "jason@yahoo.com",
          "name": "Neil Mallavar"
        };
        facebookMock.expects("getMe").once().yields(null, fbresult);
        if (getSocial) { 
          facebookMock.expects("getMySocialNetwork").once().yields(null, []);
        }
        else {
          facebookMock.expects("getMySocialNetwork").never();
        }

        var auth;
        if (authType === 'oauth') {
          auth = { headers: { "Authorization" : "OAuth2 xxxxxxxxx"}};
        }
        else {
          auth = { username: accountid, password: password };
        }
        var request = restler.put(sprintf('http://localhost:%s/accounts/me/access_token?fbtoken=xxxxxxxxx',config.SERVER.url.port()), auth);
        
        console.log("updateFacebookToken: ");
        request.once('complete', function onComplete (result, response) {
          should.exist(result);
          //console.log("result=" + js.pp(result));
          result.should.not.be.an.instanceof(Error);
          account = result.account;
          accountid = account.id;
          
          account.facebookId.should.equal(fbresult.id);
          account.email.should.equal(fbresult.email);
          account.name.should.equal(fbresult.name);
          response.statusCode.should.equal(200);
          callback(null,result);
        });
      }
    }

    function getMe(callback){
      var request = restler.get(sprintf('http://localhost:%s/accounts/me', config.SERVER.url.port()),
                                { username: accountid, password: password });
      console.log("getMe: ");
      request.once('complete', function onComplete (result, response) {
        should.exist(result);
        response.statusCode.should.equal(200);
        result.should.not.be.an.instanceof(Error);

        result.account.id.should.equal(accountid);
        if (result.account.facebook) result.account.facebookId.should.equal(account.facebookId);
        if (result.account.email) result.account.email.should.equal(account.email);
        if (result.account.name) result.account.name.should.equal(account.name);

        callback(null, result);
      });
    }
    
    function makeVerify(expected, done) { 
      return function verifyIDs(error, results) {
        //console.log("verify IDs " + JSON.stringify(results,null,1));
        expected.length.should.equal(results.length);
        results.forEach(function (item, index) {
          item.account.id.should.equal(results[expected[index]].account.id);
        });
        mongo.channels.remove({'_id': accountid}, done)
      }
    }

    // (1) means device-1, (2) means device-2
    // (t1,...,tn) - means valid token1,...n. 
    // need to test that everything works if different devices provide updated, but valid tokens.

    // create-anon(1)
    it('returns a new anonymous user for POST /accounts', function(done){
      async.series([createAnonymous,getMe],
                   makeVerify([0,0], done));
    });

    // create-anon(1), update-fb(1)
    it('convert from anonymous to facebook user', function(done){
      async.series([createAnonymous,getMe,makeUpdateFacebookToken('basic', true),getMe,makeUpdateFacebookToken('oauth', false),getMe],
                   makeVerify([0,0,0,0,0,0], done));
    });

    // create-anon(1), create-fb(2), update-fb(2)
    it('convert from anonymous user into facebook authenticated user', function(done){
      async.series([createAnonymous,getMe,createFacebookUser,getMe,makeUpdateFacebookToken('basic', false),getMe],
                   makeVerify([0,0,2,2,2,2],done));
    });
    
    // create-fb(1), update-fb(1)
    it('returns a new facebook user for POST /accounts?fbtoken=xxx and then updates the token', function(done) {
      async.series([createFacebookUser,getMe,makeUpdateFacebookToken('basic',false),getMe],
                   makeVerify([0,0,0,0],done));
    });

    // create-fb(1), create-fb(2), update-fb(1), update-fb(2) (both devices same account)
    // create-fb(1), create-anon(2), update-fb(2) (both devices same account)
    // create-fb(1)(t1), create-fb(2)(t2), update-fb(1)(t3), update-fb(2)(t4) - changing access token
  });
  
  describe('#GET /channels (search)', function(){
    beforeEach(function(done) {
      mongofix.cleanup(function() { 
        sandbox = sinon.sandbox.create();
        facebookMock = sandbox.mock(facebook);
        sandbox.stub(graphite, 'set');
        sandbox.stub(intercom);
        fix.reset(done);
      });
    });
    
    afterEach(function(done) {
      console.log("afterEach: cleanup");
      sandbox.verify();
      sandbox.restore();
      mongo.channels.remove({'facebook.id':/^facebook/}, function() { 
        mongofix.cleanup(done);
      });
    });
    
    it('returns places near Castro', function(done) {
      facebookMock.expects('getPlaces').yields(null,castroPlaces);
      facebookMock.expects('getPosts').never().yields(null, []);

      me = fix.get('me');

      var searchRequest = sprintf('http://localhost:%(port)s/channels?type=place&latlng=%(lat)f,%(lon)f',
                                     { port: config.SERVER.url.port(), 
                                       lat: castro.latitude,
                                       lon: castro.longitude });
      
      var placeManager = require('../../managers/placeManager');
      placeManager.refreshTile(castroTile.toIndex(), function (error, result) {
        should.not.exist(error);

        var request = restler.get(searchRequest, { username: me._id, password: me.name });
        console.log("test");
        request.once('complete', function onComplete (result, response) {
          should.exist(result);
          result.should.not.be.an.instanceof(Error);
          response.statusCode.should.equal(200);
          
          var returnedChannels = result.channels.data;
          returnedChannels.length.should.equal(castroPlaces.length);
          
          for (var i=0; i<returnedChannels.length; i++) {
            var returnedChannel = returnedChannels[i];
            returnedChannel.id.should.be.a('string');
            returnedChannel.name.should.be.a('string');
            returnedChannel.picture.should.be.a('string');
          }
          
          done();
        }); // on search complete
      });
    });
  });
});

