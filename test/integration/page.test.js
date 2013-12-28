var async = require('async');
var fs = require('fs');
var should=require('should');
var sprintf=require('sprintf').sprintf;
var sinon = require('sinon');
var URI = require('URIjs');

var mongo = require('../../lib/mongo');
var mongofix = require('./mongofix');
var config = require('../../config');
var js = require('../../lib/javascript');
var events = require('../../lib/events');
var facebook = require('../../lib/facebook');
var graphite = require('../../lib/graphite');
var intercom = require('../../lib/intercom');
var Page = require('../../lib/page').Page;

var sandbox,fix;
var r = require('./region');
var place_a,place_b,place_c,place_d;

describe('paging integration (with mongodb)', function(){
  before(function ( done ) {
    mongo.initialize(function () {
      sandbox = sinon.sandbox.create();
      fix = mongofix.MongoFix(
        { key: 'me',      make: 'user',  name: 'me' },
        { key: 'test_page_place_a', make: 'place', facebookId: 1000, location: r.lplace_a, talking_about_count:  10, name: 'test_page_place_a' },
        { key: 'test_page_place_b', make: 'place', facebookId: 1001, location: r.lplace_b, talking_about_count: 100, name: 'test_page_place_b' },
        { key: 'test_page_place_c', make: 'place', facebookId: 1002, location: r.lplace_c, talking_about_count:   2, name: 'test_page_place_c' },
        { key: 'test_page_place_d', make: 'place', facebookId: 1003, location: r.lplace_c, talking_about_count:   1, name: 'test_page_place_d' }
      );
      done();
    });
  });

  after(function(done) {
    mongofix.cleanup(done);
  });
  
  beforeEach(function(done) {
    async.series({
      cleanupFixture: function (callback){ 
        mongofix.cleanup(callback); 
      },
      resetFixture: function (callback) { 
        fix.reset(callback); 
      },
      setupFixture: function (callback) { 
        place_a = fix.get('test_page_place_a'); 
        place_b = fix.get('test_page_place_b'); 
        place_c = fix.get('test_page_place_c'); 
        place_d = fix.get('test_page_place_d'); 
        callback();
      }
    }, done);
  });

  afterEach(function(done) {
    sandbox.verify(); 
    sandbox.restore();
    done();
  });

  function makePage(index) { 
    return new Page(undefined, index);
  }

  //var scoreIndex = [{name: 'score', order: -1, type: function (value) { return value; } },
  //{name: 'name', order: -1, type: function (value) { return value; }}];

  var scoreIndex = [{name: 'name', order: -1, type: function (value) { return value; }}];
  
  describe("Page.retrieve", function() { 
    it("should retrieve 2 place at a time with limit=2", function(done) {
      var page = new Page(undefined, scoreIndex, null, null, 2);
      page.retrieve(mongo.channels,  // collection
                    {name:/test_page_place_/}, // selector
                    undefined, 
                    function onRetrieved(error, documents) { 
                      should.not.exist(error);
                      should.exist(documents);
                      should.exist(documents.data);
                      should.exist(documents.paging);
                      documents.data.length.should.equal(2);
                      //console.log("page1.retrieve: " + js.pp(documents));

                      var pparams = URI(documents.paging.next).query(true);
                      var page2 = new Page(undefined, 
                                           scoreIndex, 
                                           pparams.since,
                                           pparams.until,
                                           pparams.limit,
                                           pparams.prev,
                                           pparams.next);
                      page2.retrieve(mongo.channels,  // collection
                                     {name:/test_page_place_/}, // selector
                                     undefined, 
                                     function onRetrieved(error, documents) { 
                                       should.not.exist(error);
                                       should.exist(documents);
                                       should.exist(documents.data);
                                       should.exist(documents.paging);
                                       documents.data.length.should.equal(2);
                                       //console.log("page2.retrieve: " + js.pp(documents));
                                     });
                    });
      done();
    });
  });
});

