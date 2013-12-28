/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview Unit test for middleware used by the server
 * @author vladimir@blipboard.com
 *
 * @created Tue, Feb 28 2012 - 10:35:54 -0800
 * @updated Thu, Mar 01 2012 - 22:57:19 -0800
 */

var should = require('should');
var sinon = require('sinon');
var mongoFaker = require('../mongoFaker');
var toArrayWithArgs = require('../mongoFaker').toArrayWithArgs;

var className= require('../../../lib/javascript').className;
var ObjectID = require ('../../../lib/mongo').ObjectID;
var password = require('../../../lib/password');
var middleware = require('../../../rest/middleware');
var userManager = require('../../../managers/userManager');
var BBError = require('../../../lib/error').BBError;

function Request (headers, params) {
  if ( !(this instanceof Request) ) {
    return new Request(headers, params);
  }
  this.headers = headers || { };
  this.params = params || { };
}

Request.prototype.header = function header (name) { return this.headers[name]; };
Request.prototype.param = function param (name) { return this.params[name]; };

var sandbox, userManagerMock;

describe('rest/middleware.js', function () {
  beforeEach (function() {
    sandbox = sinon.sandbox.create();
    sandbox.add(mongoFaker.fake());
    userManagerMock = sandbox.mock(userManager);
  });

  afterEach(function() {
    sandbox.restore();
  });

  describe('#authenticate(req, res, next)', function ( ) {
    it('should call back with an error when authorization header is missing', function ( done) {
      middleware.authenticate(Request(), null,
                              function onAuthenticate ( error ) {
                                error.should.be.an.instanceOf(BBError);
                                error.type.should.equal(BBError.failedToAuthenticate.type);
                                error.status.should.equal(401);
                                error.message.should.match(/.*Cannot find authorization header.*/);
                                done();
                              });
    });

    it('should call back with an error when authorization method is different from basic', function (done ) {
      middleware.authenticate(Request({ Authorization: 'not basic' }), null,
                              function onAuthenticate ( error ) {
                                error.should.be.an.instanceOf(BBError);
                                error.type.should.equal(BBError.failedToAuthenticate.type);
                                error.status.should.equal(401);
                                error.message.should.match(/.*Unknown authorization method.*/);
                                done();
                              });
    });
    
    it('should call back with an error when credentials are missing', function (done) {
      middleware.authenticate(Request({ Authorization: 'BASIC' }), null,
                              function onAuthenticate ( error ) {
                                error.should.be.an.instanceOf(BBError);
                                error.type.should.equal(BBError.failedToAuthenticate.type);
                                error.status.should.equal(401);
                                error.message.should.match(/.*Credentials are missing.*/);
                                done();
                              });
    });

    it('should call back with an error when username is missing', function (done ) {
      var request = new Request({ Authorization: 'BASIC ' + password.makeBasicAuthString('', '') });
      middleware.authenticate(request, null, function onAuthenticate ( error ) {
        error.should.be.an.instanceOf(BBError);
        error.type.should.equal(BBError.failedToAuthenticate.type);
        error.status.should.equal(401);
        error.message.should.match(/.*No username found.*/);
        done();
      });
    });

    it('should call back with an error when password is missing', function (done) {
      var request = new Request({ Authorization: 'BASIC ' + password.makeBasicAuthString('bad', '') });
      middleware.authenticate(request, null, function onAuthenticate ( error ) {
        error.should.be.an.instanceOf(BBError);
        error.type.should.equal(BBError.failedToAuthenticate.type);
        error.status.should.equal(401);
        error.message.should.match(/.*No password found.*/);
        done();
      });
    });

    it('should call back with an error when a channel with the provided username does not exist', function (done) {
      userManagerMock.expects('authenticateUserBasic').once()
        .yields(BBError.failedToAuthenticate('User with the given id does not exist.'),null);

      var request = new Request({ Authorization: 'BASIC ' + password.makeBasicAuthString('bad', 'creds') });
      middleware.authenticate(request, null, function onAuthenticate ( error ) {
        error.should.be.an.instanceOf(BBError);
        error.type.should.equal(BBError.failedToAuthenticate.type);
        error.status.should.equal(401);
        error.message.should.match(/.*User with the given id does not exist.*/);
        sandbox.verify();
        done();
      });
    });

    it('should call back with an error when the password is wrong', function (done) {
      userManagerMock.expects('authenticateUserBasic').once()
        .yields(BBError.failedToAuthenticate('Password did not pass validation'),null);
      
        var request = new Request({ Authorization: 'BASIC ' + password.makeBasicAuthString('name', 'wrong') });
        middleware.authenticate(request, null, function onAuthenticate ( error ) {
          error.should.be.an.instanceOf(BBError);
          error.type.should.equal(BBError.failedToAuthenticate.type);
          error.status.should.equal(401);
          error.message.should.match(/.*Password did not pass validation.*/);
          sandbox.verify();
          done();
        });
    });

    it('should set up request user object when everything is done correctly', function (done) {
      var correctUser = { user: "user" , password: "password" };
      userManagerMock.expects('authenticateUserBasic').once().yields(null, correctUser);
      
      var request = new Request({ Authorization: 'BASIC ' + password.makeBasicAuthString('name', 'password') });
      middleware.authenticate(request, null, function onAuthenticate ( error ) {
        should.not.exist(error);
        request.should.have.property('user');
        request.user.should.equal(correctUser);
        sandbox.verify();
        done();
      });
    });
  }); // authenticate test

  describe('#getAddress(req, res, next)', function ( ) {

    it('should set up request location as an empty object when no location properties are provided in the request',
       function (done) {
         var request = new Request();
         middleware.getAddress(request, null, function onGetAddress ( error ) {
           should.not.exist(error);
           request.should.have.property('location');
           request.location.should.be.a('object');
           request.location.should.not.have.property('address');
           request.location.should.not.have.property('city');
           request.location.should.not.have.property('state');
           request.location.should.not.have.property('country');
           request.location.should.not.have.property('zip');
           request.location.should.not.have.property('location');
           done();
         });
       });
    
    it('should set up request location address when address parameter is provided in the request',
       function (done) {
         var address = 'correct address';
         var request = new Request(null, { address: address });
         middleware.getAddress(request, null, function onGetAddress ( error ) {
           should.not.exist(error);
           request.location.should.have.property('address');
           request.location.address.should.equal(address);
           done();
         });
       });
    
    it('should set up request location city when city parameter is provided in the request',
       function (done) {
         var city = 'correct city';
         var request = new Request(null, { city: city });
         middleware.getAddress(request, null, function onGetAddress ( error ) {
           should.not.exist(error);
           request.location.should.have.property('city');
           request.location.city.should.equal(city);
           done();
         });
       });
    
    it('should set up request location state when state parameter is provided in the request',
       function (done) {
         var state = 'correct state';
         var request = new Request(null, { state: state });
         middleware.getAddress(request, null, function onGetAddress ( error ) {
           should.not.exist(error);
           request.location.should.have.property('state');
           request.location.state.should.equal(state);
           done();
         });
       });
    
    it('should set up request location country when country parameter is provided in the request',
       function (done) {
         var country = 'correct country';
         var request = new Request(null, { country: country });
         middleware.getAddress(request, null, function onGetAddress ( error ) {
           should.not.exist(error);
           request.location.should.have.property('country');
           request.location.country.should.equal(country);
           done();
         });
       });
    
    it('should set up request location zip when zip parameter is provided in the request',
       function (done) {
         var zip = 'correct zip';
         var request = new Request(null, { zip: zip});
         middleware.getAddress(request, null, function onGetAddress ( error ) {
           should.not.exist(error);
           request.location.should.have.property('zip');
           request.location.zip.should.equal(zip);
           done();
         });
       });
    
    it('should set up request location coordinates when latitude and longitude are provided in the request',
       function (done) {
         var request = new Request(null, { latlng: "1,1" });
         middleware.getAddress(request, null, function onGetAddress ( error ) {
           should.not.exist(error);
           request.location.should.be.a('object')
           request.location.should.have.property('latitude');
           request.location.should.have.property('longitude');
           done();
         });
       });
  }); // getAddress test
  
  describe('#checkUserIdMatchesParam(req, res, next)', function () {
    it('should call back with an error when request user object does not exist', function (done) {
      var request = new Request(null, { id: '00000' });
      middleware.checkUserIdMatchesParam('id')(request, null, function onChecked ( error ) {
        error.should.be.an.instanceOf(BBError);
        error.type.should.equal(BBError.unAuthorized.type);
        error.status.should.equal(401);
        done();
      });
    });
    
    it('should call back with an error when request user _id is different from request id parameter', function (done) {
      var request = new Request(null, { id: 'not matching id' });
      request.user = { _id: '00000', name: 'name' }
      middleware.checkUserIdMatchesParam('id')(request, null, function onChecked ( error ) {
        error.should.be.an.instanceOf(BBError);
        error.type.should.equal(BBError.forbidden.type);
        error.status.should.equal(403);
        done();
      });
    });
    
    it('should call next with no errors when request user _id is the same as the request id parameter', function (done) {
      var request = new Request(null, { id: '00000' });
      request.id='00000';
      request.user = { _id: '00000', name: 'name' }
      middleware.checkUserIdMatchesParam('id')(request, null, function onChecked ( error ) {
        should.not.exist(error);
        done();
      });
    });
  }); // checkChannelMatchesUser
  
  describe('#getLocation(req, res, next)', function()  {
    it('should call back with an error when latitude is not a number', function (done) {
      var request = new Request(null, { latlng: 'not a number,1' });
      middleware.getLocation(request, null, function ( error ) {
        error.should.be.an.instanceOf(BBError);
        error.type.should.equal(BBError.badLocation.type);
        error.status.should.equal(400);
        done();
      });
    });

    it('should call back with an error when longitude is not a number', function (done) {
      var request = new Request(null, { latlng: '1,not a number' });
      middleware.getLocation(request, null, function ( error ) {
        error.should.be.an.instanceOf(BBError);
        error.type.should.equal(BBError.badLocation.type);
        error.status.should.equal(400);
        done();
      });
    });

    it('should not set up request location when latitude or longitude is not provided in the request', function (done) {
      var request = new Request();
      middleware.getLocation(request, null, function ( error ) {
        should.not.exist(error);
        request.should.not.have.property('location');
        done();
      });
    });
    
    it('should set up request location coordinates when latitude and longitude are provided in the request',function (done) {
      var request = new Request(null, { 'latlng': '-1.2352,1.234' });
      middleware.getLocation(request, null, function ( error ) {
        should.not.exist(error);
        request.should.have.property('location');
        request.location.should.be.a('object');
        request.location.should.have.property('latitude');
        request.location.latitude.should.equal(-1.2352);
        request.location.should.have.property('longitude');
        request.location.longitude.should.equal(1.234);
        done();
      });
    });
  }); // getLocation test

  describe('#requireLocation(req, res, next)', function () {
    it('should call back with an error when latitude or longitude is not a number', function (done) {
      var request = new Request(null, { latlng: 'not a number,not a number' });
      middleware.requireLocation(request, null, function ( error ) {
        error.should.be.an.instanceOf(BBError);
        error.type.should.equal(BBError.badLocation.type);
        error.status.should.equal(400);
        done();
      });
    });
    
    it('should call back with an error when request location is not set up', function (done) {
      var request = new Request();
      middleware.requireLocation(request, null, function ( error ) {
        error.should.be.an.instanceOf(BBError);
        error.type.should.equal(BBError.badLocation.type);
        error.status.should.equal(400);
        done();
      });
    });
    
    it('should set up request location coordinates when latitude and longitude are provided in the request', function (done) {
      var request = new Request(null, { 'latlng': '-1.2352,1.234' });
      middleware.requireLocation(request, null, function ( error ) {
        should.not.exist(error);
        request.should.have.property('location');
        request.location.should.be.a('object');
        request.location.should.have.property('latitude');
        request.location.latitude.should.equal(-1.2352);
        request.location.should.have.property('longitude');
        request.location.longitude.should.equal(1.234);
        done();
      });
    });
  }); // requireLocation test

 describe('#getBounds(req, res, next)', function()  {
    it('should call back with an error when no bounds has no | separator', function (done) {
      var request = new Request(null, { bounds:"1,1,1,1" });
      middleware.getBounds(request, null, function ( error ) {
        error.should.be.an.instanceOf(BBError);
        error.type.should.equal(BBError.badBounds.type);
        error.status.should.equal(400);
        done();
      });
    });

    it('should call back with an error whenXS bounds "south" is NAN', function (done) {
      var request = new Request(null, { bounds:"Not a number,1|1,1" });
      middleware.getBounds(request, null, function ( error ) {
        error.should.be.an.instanceOf(BBError);
        error.type.should.equal(BBError.badBounds.type);
        error.status.should.equal(400);
        done();
      });
    });

    it('should call back with an error when bounds "east" is NAN', function (done) {
      var request = new Request(null, { bounds:"1,Not a number|1,1" });
      middleware.getBounds(request, null, function ( error ) {
        error.should.be.an.instanceOf(BBError);
        error.type.should.equal(BBError.badBounds.type);
        error.status.should.equal(400);
        done();
      });
    });

    it('should call back with an error when bounds "north" is NAN', function (done) {
      var request = new Request(null, { bounds:"1,1|Not a number,1" });
      middleware.getBounds(request, null, function ( error ) {
        error.should.be.an.instanceOf(BBError);
        error.type.should.equal(BBError.badBounds.type);
        error.status.should.equal(400);
        done();
      });
    });

    it('should call back with an error when bounds "north" is NAN', function (done) {
      var request = new Request(null, { bounds:"1,1|1,not a number" });
      middleware.getBounds(request, null, function ( error ) {
        error.should.be.an.instanceOf(BBError);
        error.type.should.equal(BBError.badBounds.type);
        error.status.should.equal(400);
        done();
      });
    });

    it('should not set up request when bounds is not provided in the request', function (done) {
      var request = new Request();
      middleware.getBounds(request, null, function ( error ) {
        should.not.exist(error);
        request.should.not.have.property('bounds');
        done();
      });
    });
    
    it('should set up request bounds coordinates when bounds are provided in the request',function (done) {
      var request = new Request(null, { 'bounds': '1.1,-2.2|3.3,-4.4' });
      middleware.getBounds(request, null, function ( error ) {
        should.not.exist(error);
        request.should.have.property('bounds');
        request.bounds.should.be.a('object');
        request.bounds.should.have.property('southwest');
        request.bounds.southwest.should.have.property('latitude',1.1);
        request.bounds.southwest.should.have.property('longitude',-2.2);

        request.bounds.should.have.property('northeast');
        request.bounds.northeast.should.have.property('latitude',3.3);
        request.bounds.northeast.should.have.property('longitude',-4.4);

        done();
      });
    });
  }); // getBounds test

  describe('#requireBoundsOrLocation(req, res, next)', function () {
    it('should call back with an error when bounds contains invalid numbers', function (done) {
      var request = new Request(null, { bounds: 'nan,nan|nan,nan' });
      middleware.requireBoundsOrLocation(request, null, function ( error ) {
        error.should.be.an.instanceOf(BBError);
        error.type.should.equal(BBError.badBounds.type);
        error.status.should.equal(400);
        done();
      });
    });
    
    it('should call back with an error when request bounds is not set up', function (done) {
      var request = new Request();
      middleware.requireBoundsOrLocation(request, null, function ( error ) {
        error.should.be.an.instanceOf(BBError);
        error.type.should.equal(BBError.badLocation.type);
        error.status.should.equal(400);
        done();
      });
    });
    
    it('should set up request bounds when bounds is provided in the request', function (done) {
      var request = new Request(null, { 'bounds':  '1.1,-2.2|3.3,-4.4' });
      middleware.requireBoundsOrLocation(request, null, function ( error ) {
        should.not.exist(error);
        request.should.have.property('bounds');
        request.bounds.should.be.a('object');
        request.bounds.should.have.property('southwest');
        request.bounds.southwest.should.have.property('latitude',1.1);
        request.bounds.southwest.should.have.property('longitude',-2.2);

        request.bounds.should.have.property('northeast');
        request.bounds.northeast.should.have.property('latitude',3.3);
        request.bounds.northeast.should.have.property('longitude',-4.4);

        done();
      });
    });

    it('should set up request location when location is provided in the request', function (done) {
      var request = new Request(null, { 'latlng':  '1.1,-2.2' });
      middleware.requireBoundsOrLocation(request, null, function ( error ) {
        should.not.exist(error);
        request.should.have.property('location');
        request.should.not.have.property('bounds');
        request.location.should.be.a('object');
        request.location.should.have.property('latitude', 1.1);
        request.location.should.have.property('longitude', -2.2);
        done();
      });
    });
  }); // requireBoundsOrLocation test

  describe('#requireObjectID(req, res, next)', function () {
    it('should call back with an error when the required parameter is not in the request', function (done) {
      var request = new Request();
      middleware.requireObjectID('par')(request, null, function ( error ) {
        error.should.be.an.instanceOf(BBError);
        error.type.should.equal(BBError.badParameter.type);
        error.status.should.equal(400);
        error.message.should.match(/.*Invalid id.*/);
        done();
      });
    });

    it('should call back with an error when the required parameter is not a 12 characters long hex string', function (done) {
      var request = new Request(null, { par: 'not a hexstr' });
      middleware.requireObjectID('par')(request, null, function ( error ) {
        error.should.be.an.instanceOf(BBError);
        error.type.should.equal(BBError.badParameter.type);
        error.status.should.equal(400);
        error.message.should.match(/.*Invalid id.*/);
        done();
      });
    });

    it('should set up request parameter to an appropriate MongoDB object id when eveything is done correctly', function (done) {
      var request = new Request(null, { par: '0123456789ab1234567890ab' });
      middleware.requireObjectID('par')(request, null, function ( error ) {
        should.not.exist(error);
        request.should.have.property('par');
        className(request.par).should.equal('ObjectID');
        done();
      });
    });
  });

  describe('#requireObjectIDs(req, res, next)', function () {
    it('should call back with an error when the required parameter is not in the request', function (done) {
      var request = new Request();
      middleware.requireObjectIDs('par')(request, null, function ( error ) {
        error.should.be.an.instanceOf(BBError);
        error.type.should.equal(BBError.badParameter.type);
        error.status.should.equal(400);
        error.message.should.match(/.*Invalid id.*/);
        done();
      });
    });

    it('should call back with an error when the required parameter is not a 12 characters long hex string', function (done) {
      var request = new Request(null, { par: '["not a hexstr"]' });
      middleware.requireObjectIDs('par')(request, null, function ( error ) {
        error.should.be.an.instanceOf(BBError);
        error.type.should.equal(BBError.badParameter.type);
        error.status.should.equal(400);
        error.message.should.match(/.*Invalid id.*/);
        done();
      });
    });

    it('should set up request parameter to an appropriate [MongoDB ObjectId] when eveything is done correctly', function (done) {
      var request = new Request(null, { par: '["0123456789ab1234567890ab","0123456789ab1234567890ab"]' });
      middleware.requireObjectIDs('par')(request, null, function ( error ) {
        should.not.exist(error);
        request.should.have.property('par').with.lengthOf(2);
        className(request.par[0]).should.equal('ObjectID');
        className(request.par[1]).should.equal('ObjectID');
        done();
      });
    });

    it('should set up request parameter to an empty array when empty array passed in', function (done) {
      var request = new Request(null, { par: '[]' });
      middleware.requireObjectIDs('par')(request, null, function ( error ) {
        should.not.exist(error);
        request.should.have.property('par').with.lengthOf(0);
        done();
      });
    });

  });



});
