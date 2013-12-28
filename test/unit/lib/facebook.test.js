var should = require('should');
var sinon = require('sinon');
var restler = require('restler');
var fs = require('fs');
var EventEmitter = require('events').EventEmitter;

var facebook = require('../../../lib/facebook');
var graphite = require('../../../lib/graphite');
var config = require('../../../config');
var BBError = require('../../../lib/error').BBError;
var js = require('../../../lib/javascript');

var castroPlaces = JSON.parse(fs.readFileSync(__dirname + "/" + "castroPlaces.json", 'ascii'));
var castroPlaces1 = JSON.parse(fs.readFileSync(__dirname + "/" + "castro.1.json", 'ascii'));
var castroPlaces2 = JSON.parse(fs.readFileSync(__dirname + "/" + "castro.2.json", 'ascii'));
var castroPlaces3 = JSON.parse(fs.readFileSync(__dirname + "/" + "castro.3.json", 'ascii'));

var coordsCastro = {
    longitude : Number(-122.4346),
    latitude  : Number(37.7603)
};

var coordsInvalid = {
    longitude : Number(0),
    latitude  : Number(0)
};

var cats = [ { "name": "dummy category",
               "categories": [ {
                 "id": 137420212991446,
                 "name": "Peruvian Restaurant"
               } ]
             } 
           ];

describe('facebook.getPlaces()', function() {
  var sandbox = sinon.sandbox.create(), emitter;

  beforeEach(function() { 
    sandbox.stub(graphite, 'set');
  });

  afterEach(function() { 
    sandbox.verify();
    sandbox.restore();
  });

  describe('#getPlaces with fake facebook data (1 page of results)', function() {
    
    //!jcf! note: error is when something goes wrong internally such as a parse error. 
    it('should handle an error', function(done) {
      sandbox.stub(restler, 'get', function hijack(uri, params) {
        if (uri.indexOf('https://graph.facebook.com/oauth/access_token') === 0) {
          emitter = new EventEmitter();
          process.nextTick(function() { emitter.emit('success', "access_token=00000000000000000000000000"); });
          return emitter;
        }
        else if (uri.indexOf('https://api.facebook.com/method/fql.query') === 0) { 
          emitter = new EventEmitter();
          process.nextTick(function() { emitter.emit('complete', new Error({ message: "server down"}), {raw: "raw output"}); });
          return emitter;
        }
        else {
          console.log("unexpected call to restler.get(): " + uri);
          assert(0);
          return null;
        }
      });
      
      facebook.getPlaces(coordsCastro.latitude, coordsCastro.longitude, 38, 
                         function(err, data) {
                           should.exist(err);
                           should.not.exist(data);
                           console.log("handled error");
                           done();
                         });
    });

    //!jcf! note: failure is when facebook returns a 4XX 
    it('should handle a failure', function(done) {
      sandbox.stub(restler, 'get', function hijack(uri, params) {
        if (uri.indexOf('https://graph.facebook.com/oauth/access_token') === 0) {
          emitter = new EventEmitter();
          process.nextTick(function() { emitter.emit('success', "access_token=00000000000000000000000000"); });
          return emitter;
        }
        else if (uri.indexOf('https://api.facebook.com/method/fql.query') === 0) { 
          emitter = new EventEmitter();
          process.nextTick(function() { emitter.emit('complete', null, { statusCode: 400}); });
          return emitter;
        }
        else {
          console.log("unexpected call to restler.get()");
          assert(0);
          return null;
        }
      });
      
      facebook.getPlaces(coordsCastro.latitude, coordsCastro.longitude, 38, 
                         function(err, data) {
                           should.exist(err);
                           should.not.exist(data);
                           err.should.be.an.instanceof(BBError);
                           err.status.should.equal(500);
                           console.log("handled failure");
                           done();
                         });
    });

    function stubRestler() {
      sandbox.stub(restler, 'get', function hijack(uri, params) {
        if (uri.indexOf('https://graph.facebook.com/oauth/access_token') === 0) {
          emitter = new EventEmitter();
          process.nextTick(function() { emitter.emit('success', "access_token=00000000000000000000000000"); });
          return emitter;
        }
        else if (uri.indexOf('https://api.facebook.com/method/fql.query') === 0) { 
          emitter = new EventEmitter();
          //console.log("graph.facebook.com/search : " + js.pp(params));
          process.nextTick(function() { emitter.emit('complete', castroPlaces, {statusCode: 200}); });
          return emitter;
        }          
        else {
          console.log("unexpected call to restler.get()");
          assert(0);
          return null;
        }
      });
    }

    it('should succeed when connectivity is restored', function(done) {
      stubRestler();

      facebook.getPlaces(coordsCastro.latitude, coordsCastro.longitude, 38, // meters
                         function(err, data) {
                           should.not.exist(err);
                           should.exist(data);
                           data.should.be.an.instanceof(Array);
                           data.length.should.equal(17);
                           console.log("handled success");
                           done();
                         });
    });


    it('should succeed when FQL query returns errors', function(done) {
      stubRestler();

      facebook.getPlaces(coordsCastro.latitude, coordsCastro.longitude, 38, // meters
                         function(err, data) {
                           should.not.exist(err);
                           should.exist(data);
                           data.should.be.an.instanceof(Array);
                           data.length.should.equal(17);
                           console.log("handled success");
                           done();
                         });
    });

    it('should succeed when FQL query returns no categories', function(done) {
      stubRestler();

      facebook.getPlaces(coordsCastro.latitude, coordsCastro.longitude, 38, // meters
                         function(err, data) {
                           //console.log("no cats: " + js.pp(data));
                           should.not.exist(err);
                           should.exist(data);
                           data.should.be.an.instanceof(Array);
                           data.length.should.equal(17);
                           console.log("handled success");
                           done();
                         });
    });
  });

  // describe('#getPlaces with fake facebook data (3 page of results)', function() {
  //   it('should return 10 places', function(done) {
  //     var count=0;
  //     sandbox.stub(restler, 'get', function hijack(uri, params) {
  //       console.log("uri=" + uri);
  //       if (uri.indexOf('https://graph.facebook.com/oauth/access_token') === 0) {
  //         emitter = new EventEmitter();
  //         process.nextTick(function() { emitter.emit('success', "access_token=00000000000000000000000000");});
  //         return emitter;
  //       }
  //       else if (uri.indexOf('https://api.facebook.com/method/fql.query') === 0) { 
  //         switch (count) {
  //         case 0:
  //           emitter = new EventEmitter();
  //           process.nextTick(function() {emitter.emit('complete', castroPlaces1, {statusCode: 200}); });
  //           return emitter;
  //         case 1:
  //           emitter = new EventEmitter();
  //           process.nextTick(function() { emitter.emit('complete', castroPlaces2, {statusCode: 200}); });
  //           return emitter;
  //         case 2:
  //           emitter = new EventEmitter();
  //           process.nextTick(function() { emitter.emit('complete', castroPlaces3, {statusCode: 200}); });
  //           return emitter;
  //         default:
  //           console.log("unexpected call to restler.get()");
  //           assert(0);
  //           return null;
  //         }
  //         count++;
  //       }
  //       else {
  //         console.log("unexpected call to restler.get()");
  //         assert(0);
  //         return null;
  //       }
  //     });
      
  //     facebook.getPlaces(coordsCastro.latitude, coordsCastro.longitude, 
  //                        100, // meters
  //                        function(err, data) {
  //                          should.not.exist(err);
  //                          should.exist(data);
  //                          data.should.be.an.instanceof(Array).and.lengthOf(10);
  //                          done();
  //                        });
  //   });
  // });
});
