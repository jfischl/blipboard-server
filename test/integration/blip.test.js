var assert = require('assert');
var async = require('async');
var should = require('should');
var sinon = require('sinon');
var sprintf = require('sprintf').sprintf;

var Tile = require('../../lib/tile').Tile;
var blipManager = require('../../managers/blipManager');
var notificationManager = require('../../managers/notificationManager');
var blipNotificationService = require('../../managers/blipNotificationService');
var categories = require('../../data/categories');
var config = require('../../config');
var js = require('../../lib/javascript');
var mongo = require('../../lib/mongo');
var mongofix = require('./mongofix');
var pushnot = require('../../lib/pushnot');
var criterionMatcher = require('../unit/mongoFaker').criterionMatcher;
var r = require('./region');

var ObjectID = mongo.ObjectID;

// declaring shared variables
var fix,sandbox,alice,bob,charlie,me,place_a,place_b,blip1,blip2,blip3,blip4,blip5;
var aliceLike,bobLike,charlieLike;
//var createdTime = new Date(2012,1,1,0,0,0);// 1/1/12 00:00
var createdTime = new Date();
var now = new Date();
//var expiryTime = new Date(); expiryTime.setDate(createdTime.getDate()+1); 
var expiryTime = new Date(createdTime.getTime() + config.EXPIRY.user);
var aLike = {id:'alice', name:'alice'};
var bLike = {id:'bob', name:'bob'};
var cLike = {id:'charlie', name:'charlie'};

var matchEquals = function (x) {
  return sinon.match(function(y) {
    return y==x || y.equals(x);
  }, "should equal "+x.toString());
};

describe('blipManager integration tests (with mongodb)', function ( ) {
  before(function ( done ) {
    mongo.initialize(function () {
      categories.loadTopicIds(function() { 
        sandbox = sinon.sandbox.create();
        fix = mongofix.MongoFix(
          { key: 'topica',  make: 'topic', name: 'topica' },
          { key: 'topicb',  make: 'topic', name: 'topicb' },
          { key: 'topicc',  make: 'topic', name: 'topicc' },

          { key: 'me',      make: 'user',  name: 'me' },
          { key: 'alice',   make: 'user',  name: 'alice' },
          { key: 'bob',     make: 'user',  name: 'bob' },
          { key: 'charlie', make: 'user',  name: 'charlie' },

          { key: 'place_a', make: 'place', name: 'place_a', location: r.lplace_a },

          { key: 'place_b', make: 'place', name: 'place_b', location: r.lplace_b },
          
          { key: 'place_c', make: 'place', name: 'place_c', location: r.lplace_c },
          { key: 'blip1',   make: 'blip',  message: 'blip1', author: 'me', place: 'place_a', topics: ['topica'],
            createdTime: new Date (createdTime.getTime()+1000), expiryTime: expiryTime, popularity:1.0 },
          { key: 'blip1-alice', make: 'receivedBlip', user: 'alice', place: 'place_a', latlng: r.lplace_a, blip: 'blip1', topics:['topica'] },
          
          { key: 'blip2',   make: 'blip',  message: 'blip2', author: 'me', place: 'place_b', likes:[bLike],
            createdTime: new Date (createdTime.getTime()+2000), expiryTime: expiryTime, popularity:2.0 }, 
          { key: 'blip2-alice', make: 'receivedBlip', user: 'alice', place: 'place_b', latlng: r.lplace_b, blip: 'blip2' },

          { key: 'blip3',   make: 'blip',  message: 'blip3', author: 'me', place: 'place_c', likes:[aLike,bLike,cLike],
            createdTime: new Date (createdTime.getTime()+3000), expiryTime: expiryTime, popularity:3.0 },
          { key: 'blip3-alice', make: 'receivedBlip', user: 'alice', place: 'place_c', latlng: r.lplace_c, blip: 'blip3' },

          { key: 'blip4',   make: 'blip',  message: 'blip4', author: 'me', place: 'place_c', likes:[aLike,bLike,cLike],
            topics: ['topicb'], createdTime: new Date (createdTime.getTime()+4000), expiryTime: expiryTime, popularity:4.0 },
          { key: 'blip4-alice', make: 'receivedBlip', user: 'alice', place: 'place_c', latlng: r.lplace_c, blip: 'blip4' },

          { key: 'blip5',   make: 'blip',  message: 'blip5', author: 'me', place: 'place_c', likes:[aLike,bLike,cLike],
            createdTime: new Date (createdTime.getTime()), expiryTime: createdTime.getTime(), popularity:5.0 },
          { key: 'blip5-alice', make: 'receivedBlip', user: 'alice', place: 'place_c', latlng: r.lplace_c, blip: 'blip5' },

          { key: 'alice_place_b', make: 'tunein', listener: 'alice', listensTo: 'place_b' },
          { key: 'alice_place_c', make: 'tunein', listener: 'alice', listensTo: 'place_c' },
          { key: 'charlie_alice', make: 'tunein', listener: 'charlie', listensTo: 'alice' },
          { key: 'charlie_me', make: 'tunein', listener: 'charlie', listensTo: 'me' },

          { key: 'test-topic', make: 'topic', name: 'test-topic' }
        );
        done();
      });
    });
  });

  after(function(done) {
    mongofix.cleanup(done);
  });
  
  beforeEach(function(done) {
    mongofix.cleanup(function() { 
      //console.log("mongofix.cleanup");
      fix.reset(function() {
        alice = fix.get('alice'); 
        aliceLike = js.clone(aLike);
        aliceLike.id = alice._id;

        bob = fix.get('bob'); 
        bobLike = js.clone(bLike);
        bobLike.id = bob._id;

        charlie = fix.get('charlie'); 
        charlieLike = js.clone(cLike);
        charlieLike.id = charlie._id;

        place_a = fix.get('place_a');
        place_b = fix.get('place_b');
        blip1 = fix.get('blip1');
        blip2 = fix.get('blip2');
        blip3 = fix.get('blip3');
        blip4 = fix.get('blip4');
        blip5 = fix.get('blip5');
        me = fix.get('me');
        done();
      });
    });
  });

  afterEach(function(done) {
    sandbox.verify(); 
    sandbox.restore();
    done();
  });
  
  describe("blipManager.addComment", function () {
    it("should add comment and notify the blip author", function (done) {
      //console.log("blip1 " + js.pp(blip1));
      sandbox.mock(pushnot).expects('sendPushNotification')
        .withArgs(matchEquals(blip1.author._id), 1, 'bob commented on your blip');
      //sinon.match({commentId:sinon.match.string}));
      
      blipManager.addComment(blip1._id,bob._id,"bob comment",function (error,comment) {
        should.not.exist(error);
        should.exist(comment);
        should.ok(comment.author._id.equals(bob._id));
        comment.author.name.should.equal(bob.name);
        comment.text.should.equals("bob comment");
        (comment.createdTime instanceof Date);
        setTimeout(done,100);
      });
    });

    it("should notify the blip author and comment authors only once each", function (done) {
      // on blip1 (author=me)
      // 1. bob comments => notify me
      // 2. charlie comments => notify bob and me
      // 3. me comments => notify bob and charlie
      // 4. charlie comments => notify me and bob
      // 5. bob comments => notify charlie and me once
     
      // A: ENSURE NOTIFICATIONS ARE RECEIVED:
      var pushNotMock = sandbox.mock(pushnot);


      // B: CREATE THE COMMENTS:
      async.series([
        function(callback) {
          // 1. bob comments => notify me
          pushNotMock.expects('sendPushNotification')
            .withArgs(matchEquals(me._id), 1, "bob commented on your blip", sinon.match({id:sinon.match.string}));
          
          blipManager.addComment(blip1._id,bob._id,"comment1 from bob", function(error,comment) {
            should.not.exist(error);
            should.exist(comment);
            callback(error,comment);
          });
        },
        function(callback) {
          // 2. charlie comments => notify bob and me
          pushNotMock.expects('sendPushNotification')
            .withArgs(matchEquals(me._id), 2, "charlie commented on your blip",
                      sinon.match({id:sinon.match.string}));
          pushNotMock.expects('sendPushNotification')
            .withArgs(matchEquals(bob._id), 1, "charlie commented on a blip you commented on",
                      sinon.match({id:sinon.match.string}));
          
          blipManager.addComment(blip1._id,charlie._id,"comment2 from charlie", function(error,comment) {
            should.not.exist(error);
            should.exist(comment);
            callback(error,comment);
          });
        },
        function(callback) {
          // 3. me comments => notify bob and charlie
          pushNotMock.expects('sendPushNotification')
            .withArgs(matchEquals(bob._id), 2, "me commented on a blip you commented on",
                      sinon.match({id:sinon.match.string}));
          pushNotMock.expects('sendPushNotification')
            .withArgs(matchEquals(charlie._id), 1, "me commented on a blip you commented on",
                      sinon.match({id:sinon.match.string}));
          
          blipManager.addComment(blip1._id,me._id,"comment3 from me", function(error,comment) {
            should.not.exist(error);
            should.exist(comment);
            callback(error,comment);
          });          
        },
        function(callback) {
          // 4. charlie comments => notify me and bob
          pushNotMock.expects('sendPushNotification')
            .withArgs(matchEquals(me._id), 3, "charlie commented on your blip",
                      sinon.match({id:sinon.match.string}));
          pushNotMock.expects('sendPushNotification')
            .withArgs(matchEquals(bob._id), 3, "charlie commented on a blip you commented on",
                      sinon.match({id:sinon.match.string}));

          blipManager.addComment(blip1._id,charlie._id,"comment4 from charlie", function(error,comment) {
            should.not.exist(error);
            should.exist(comment);
            callback(error,comment);
          });
        },
        function(callback) {
          // 5. bob comments => notify charlie and me once
          pushNotMock.expects('sendPushNotification')
            .withArgs(matchEquals(charlie._id), 2, "bob commented on a blip you commented on",
                      sinon.match({id:sinon.match.string}));
          pushNotMock.expects('sendPushNotification')
            .withArgs(matchEquals(me._id), 4, "bob commented on your blip",
                      sinon.match({id:sinon.match.string}));
          
          blipManager.addComment(blip1._id,bob._id,"comment5 from bob", function(error,comment) {
            should.not.exist(error);
            should.exist(comment);
            callback(error,comment);
          });
        }
      ], function (error,result) {
        should.not.exist(error);
        should.exist(result);
        result.length.should.equal(5);
        done();
      });  // end of async.series block
    });
  });
  
  describe("blipManager.deleteComment", function () {
    it("should delete the comment given a comment id and correct comment.author.id",function (done) {
      sandbox.mock(pushnot).expects('sendPushNotification').once(); // notification that bob commented on me's blip

      blipManager.addComment(blip1._id,bob._id,"comment from bob", function (error,comment) {
        should.not.exist(error);
        should.exist(comment);
        blipManager.deleteComment(comment.id,bob._id,function (error,blip) {
          should.not.exist(error);
          should.exist(blip);
          blip.comments.length.should.equal(0); // comment was removed 
          // !am! paranoically confirm comment was removed
          blipManager.getBlip(blip1._id,function (error,blip) {
            should.not.exist(error);
            should.exist(blip);
            should.exist(blip.comments);
            blip.comments.length.should.equal(0);
            done();
          });
        });
      });
    });

    it("should NOT delete the comment given a comment id and INcorrect comment.author.id",function (done) {
      sandbox.mock(pushnot).expects('sendPushNotification').once(); // notification that bob commented on me's blip

      blipManager.addComment(blip1._id,bob._id,"comment from bob", function (error,comment) {
        should.not.exist(error);
        should.exist(comment);

        // provide incorrect comment author id:
        blipManager.deleteComment(comment.id,charlie._id,function (error,blip) {
          should.not.exist(error);
          should.exist(blip);
          blip.comments.length.should.equal(1); // no updates made
          // !am! paranoically confirm comment was removed
          blipManager.getBlip(blip1._id,function (error,blip) {
            should.not.exist(error);
            should.exist(blip);
            should.exist(blip.comments);
            blip.comments.length.should.equal(1);
            done();
          });
        });
      });
    });
  });

  describe("blipManager.like", function() {
    function verify(expected, error, likes, done)  {
      //console.log("likes=" + js.pp(likes));
      should.not.exist(error);
      should.exist(likes);
      likes.should.be.an.instanceof(Array);
      likes.should.have.lengthOf(expected.length);
      expected.forEach(function (item, index) {
        assert(likes[index].id.equals(item.id));
        assert(likes[index].name === item.name);
      });
      done();
    }

    it("should add first like to blip1", function(done) {
      sandbox.mock(pushnot).expects('sendPushNotification')
        .withArgs(blip1.author._id, 1, "bob likes your blip") //, criterionMatcher({likerId:bob._id,blipId:blip1._id}))
        .once();
      blipManager.like(blip1._id, bob._id, function(error, likes) {
        verify([bobLike], error, likes, done);
      });
    });

    it("should not remove like from blip1 when no likes", function(done) {
      sandbox.mock(pushnot).expects('sendPushNotification').never();
      blipManager.unlike(blip1._id, bob._id, function(error, likes) {
        verify([], error, likes, done);
      });
    });

    it("should remove like from blip2", function(done) {
      sandbox.mock(pushnot).expects('sendPushNotification').never();
      blipManager.unlike(blip2._id, bob._id, function(error, likes) {
        verify([], error, likes, done);
      });
    });

    it("should not add existing like to blip2", function(done) {
      sandbox.mock(pushnot).expects('sendPushNotification').once();
      blipManager.like(blip2._id, bob._id, function(error, likes) {
        verify([bobLike], error, likes, done);
      });
    });

    it("should add second like to blip2", function(done) {
      sandbox.mock(pushnot).expects('sendPushNotification').once();
      blipManager.like(blip2._id, charlie._id, function(error, likes) {
        verify([bobLike,charlieLike], error, likes, done);
      });
    });

    it("should remove middle like from blip3", function(done) {
      sandbox.mock(pushnot).expects('sendPushNotification').never();
      blipManager.unlike(blip3._id, bob._id, function(error, likes) {
        verify([aliceLike,charlieLike], error, likes, done);
      });
    });

  });

  describe("blipManager.getReceivedBlips", function() {
    var b1,b2,b3,b4;
    beforeEach(function() {
      b1 = fix.get('blip1-alice');
      b2 = fix.get('blip2-alice');
      b3 = fix.get('blip3-alice');
      b4 = fix.get('blip4-alice');
    });

    it("should return 1 blips for Alice at place1", function(done) { 
      var blip1ForAlice = fix.get('blip1-alice');
      
      blipManager.getReceivedBlips(alice._id, {location: r.lplace_a}, function(error, blips) {
        //console.log( JSON.stringify(r.lplace_a, null, 2) );
        //console.log( JSON.stringify(blips, null, 2) );
        //console.log("getReceivedBlips " + JSON.stringify(blips, null,1));
        should.not.exist(error);
        should.exist(blips);
        blips.should.have.lengthOf(1);
        blips[0].should.have.property('author');
        blips[0].author.should.have.property('isListening',false);

        blips[0].should.have.property('place');
        blips[0].place.should.have.property('isListening',false);

        blips[0].should.have.property('isRead', false);
        done();
      });
    });

    it("should return 1 blip for Alice at region1", function(done) { 
      blipManager.getReceivedBlips(alice._id, {bounds: r.region1}, function(error, blips) {
        //console.log("getReceivedBlips " + JSON.stringify(blips, null,1));
        should.not.exist(error);
        should.exist(blips);
        blips.should.have.lengthOf(1);
        assert.ok(blips[0]._id.equals(b1.blip));
        blips[0].should.have.property('isRead', false);
        done();
      });
    });

    it("should return 2 blips for Alice at region2", function(done) { 
      blipManager.getReceivedBlips(alice._id, {bounds: r.region2}, function(error, blips) {
        //console.log("getReceivedBlips " + JSON.stringify(blips, null,1));
        should.not.exist(error);
        should.exist(blips);
        blips.should.have.lengthOf(2);
        assert.ok(blips[0]._id.equals(b2.blip));
        assert.ok(blips[1]._id.equals(b1.blip));
        
        blips[0].should.have.property('author');
        blips[0].author.should.have.property('isListening',false);
        
        blips[0].should.have.property('place');
        blips[0].place.should.have.property('isListening',true);
        blips[0].should.have.property('isRead', false);

        blips[1].should.have.property('isRead', false);
        done();
      });
    });

    it("should return 4 blips for Alice at region3", function(done) { 
      blipManager.getReceivedBlips(alice._id, {bounds: r.region3}, function(error, blips) {
        //console.log("getReceivedBlips " + js.pp(blips));
        should.not.exist(error);
        should.exist(blips);
        blips.should.have.lengthOf(4);
        assert.ok(blips[0]._id.equals(b4.blip));
        assert.ok(blips[1]._id.equals(b3.blip));
        assert.ok(blips[2]._id.equals(b2.blip));
        assert.ok(blips[3]._id.equals(b1.blip));

        blips[0].should.have.property('isRead', false);
        blips[1].should.have.property('isRead', false);
        blips[2].should.have.property('isRead', false);
        blips[3].should.have.property('isRead', false);
        done();
      });
    });
  });

  describe("blipManager.markReceivedBlipRead", function() {
    var b1;
    beforeEach(function() {
      b1 = fix.get('blip1-alice');
    });

    it("should mark Alice's blip as read", function(done) { 
      var blip1ForAlice = fix.get('blip1-alice');
      
      blipManager.markReceivedBlipRead(alice._id, blip1ForAlice.blip, function(error, result) {
        should.not.exist(error);
        blipManager.getReceivedBlips(alice._id, {location: r.lplace_a}, function(error, blips) {
          blips[0].should.have.property('isRead', true);
          done();
        });
      });
    });

    it("should mark Alice's blips at place_c as read", function(done) { 
      var blip3ForAlice = fix.get('blip3-alice');
      var blip4ForAlice = fix.get('blip4-alice');
      var place_c = fix.get('place_c');
      
      blipManager.markReceivedBlipsReadAtPlace(alice._id, place_c._id, function(error, result) {
        should.not.exist(error);
        blipManager.getReceivedBlips(alice._id, {location: r.lplace_c}, function(error, blips) {
          blips.should.have.lengthOf(2);
          blips[0].should.have.property('isRead', true);
          blips[1].should.have.property('isRead', true);
          done();
        });
      });
    });

    // it("bob can't mark Alice's blip as read", function(done) { 
    //   var blip1ForAlice = fix.get('blip1-alice');
    //   blipManager.markReceivedBlipRead(bob._id, blip1ForAlice.blip, function(error, result) {
    //     should.exist(error);
    //     error.status.should.equal(403);
    //     done();
    //   });
    // });
  });
  
  describe("blipManager.getBlip", function() { 
    it("should return blip1", function(done) { 
      blipManager.getBlip(blip1._id, function(error, blip) { 
        //console.log("blip=" + js.pp(blip));
        should.not.exist(error);
        should.exist(blip);
        blip.should.have.property('message', blip1.message);
        blip.should.have.property('author');
        assert.ok(blip.author._id.equals(blip1.author._id));
        blip.should.have.property('place');
        assert.ok(blip.place._id.equals(blip1.place._id));
        blip.should.not.have.property('isListening'); 
        done();
      });
    });

    it("should return blip1 with author.isListening value = true", function(done) { 
      blipManager.getBlip(blip1._id,charlie._id, function(error, blip) { 
        //console.log("blip=" + js.pp(blip));
        should.not.exist(error);
        should.exist(blip);
        blip.should.have.property('message', blip1.message);
        blip.should.have.property('author');
        assert.ok(blip.author._id.equals(blip1.author._id));
        blip.should.have.property('place');
        assert.ok(blip.place._id.equals(blip1.place._id));
        blip.author.should.have.property('isListening');
        blip.author.isListening.should.equal(true); // alice is listening to me - the author of blip1
        done();
      });
    });

    it("should return blip1 with author.isListening value = false", function(done) { 
      blipManager.getBlip(blip1._id,bob._id, function(error, blip) { 
        //console.log("blip=" + js.pp(blip));
        should.not.exist(error);
        should.exist(blip);
        blip.should.have.property('message', blip1.message);
        blip.should.have.property('author');
        assert.ok(blip.author._id.equals(blip1.author._id));
        blip.should.have.property('place');
        assert.ok(blip.place._id.equals(blip1.place._id));
        blip.author.should.have.property('isListening');
        blip.author.isListening.should.equal(false); // bob is not listening to alice, who is the author of blip1
        done();
      });
    });

  });

  describe("blipManager.getPopularBlips", function() {
    var b1,b2,b3,b4,topica,topicb,topicc;

    beforeEach(function(done) {
      b1 = fix.get('blip1');
      b2 = fix.get('blip2');
      b3 = fix.get('blip3');
      b4 = fix.get('blip4');
      topica = fix.get('topica');
      topicb = fix.get('topicb');
      topicc = fix.get('topicc');
      done();
    });
    
    it("should return 1 popular blips for Alice at region1", function(done) { 
      //console.log("popular");
      blipManager.getPopularBlips(alice._id, {bounds: r.region1}, function (error, blips) {
        //console.log("popular blips at region1 : " + js.pp(blips));
        should.not.exist(error);
        should.exist(blips);
        blips.should.have.lengthOf(1);
        assert.ok(blips[0]._id.equals(b1._id));
        
        blips[0].should.have.property('author');
        blips[0].author.should.have.property('isListening',false);

        blips[0].should.have.property('place');
        blips[0].place.should.have.property('isListening',false);

        done();
      });
    });

    it("should return 1 popular blips for Alice at region1 with topica", function(done) { 
      //console.log("popular");
      blipManager.getPopularBlips(alice._id, 
                                  { bounds: r.region1, 
                                    topicIds: [topica._id]
                                  },
                                  function (error, blips) {
                                    //console.log("popular blips at region1 : " + js.pp(blips));
                                    should.not.exist(error);
                                    should.exist(blips);
                                    blips.should.have.lengthOf(1);

                                    assert.ok(blips[0]._id.equals(b1._id));

                                    blips[0].should.have.property('author');
                                    blips[0].author.should.have.property('isListening',false);
                                    
                                    blips[0].should.have.property('place');
                                    blips[0].place.should.have.property('isListening',false);
                                    
                                    done();
                                  });
    });

    it("should return 0 popular blips for Alice at region1 with topicb", function(done) { 
      //console.log("popular");
      blipManager.getPopularBlips(alice._id, 
                                  { bounds: r.region1, 
                                    topicIds: [topicb._id]
                                  },
                                  function (error, blips) {
                                    //console.log("popular blips at region1 : " + js.pp(blips));
                                    should.not.exist(error);
                                    should.exist(blips);
                                    blips.should.have.lengthOf(0);
                                    done();
                                  });
    });

    it("should return 3 popular blips for Alice at region3 with no topic filter", function(done) { 
      // note: blip3 and blip4 are both at place_c so it only returns blip4 (more popular)
      blipManager.getPopularBlips(alice._id, {bounds: r.region3}, function (error, blips) {
        //console.log("popular blips at region3 : " + js.pp(blips));
        should.not.exist(error);
        should.exist(blips);
        blips.should.have.lengthOf(3);
        assert.ok(blips[0]._id.equals(b4._id));
        assert.ok(blips[1]._id.equals(b2._id));
        assert.ok(blips[2]._id.equals(b1._id));

        done();
      });
    });

    it("should return 2 popular blips for Alice at region3 with topica and topicb filter", function(done) { 
      blipManager.getPopularBlips(alice._id, {bounds: r.region3, topicIds: [topica._id,topicb._id]},
                                  function (error, blips) {
                                    //console.log("popular blips at region3 : " + js.pp(blips));
                                    should.not.exist(error);
                                    should.exist(blips);
                                    blips.should.have.lengthOf(2);
                                    assert.ok(blips[0]._id.equals(b4._id));
                                    assert.ok(blips[1]._id.equals(b1._id));
                                    
                                    done();
                                  });
    });
  });

  describe("blipNotificationService.pushNotifyUserAtTile", function() { 
    it("should send most popular blips as alerts first (blip4, blip3) and not send expired blips in alerts", function(done) { 
      
      async.series([ 
        function push1(callback) { 
          sandbox.mock(notificationManager).expects('makeNewBlipNotification')
            .withArgs(alice._id, blip4._id, "me @ place_c: blip4").once().yields();
          
          blipNotificationService.pushNotifyUserAtTile(alice._id, r.tixc, function (error, success) { 
            should.not.exist(error);
            success.should.equal(true);
            sandbox.verify();
            callback();
          });
        },

        function push2(callback) {
          sandbox.mock(notificationManager).expects('makeNewBlipNotification')
            .withArgs(alice._id, blip3._id, "me @ place_c: blip3").once().yields();
          
          blipNotificationService.pushNotifyUserAtTile(alice._id, r.tixc, function (error, success) { 
            should.not.exist(error);
            success.should.equal(true);
            sandbox.verify();
            callback();
          });
        }, 
        
        function push3(callback) {
          sandbox.mock(notificationManager).expects('makeNewBlipNotification').never();

          blipNotificationService.pushNotifyUserAtTile(alice._id, r.tixc, function (error, success) { 
            should.not.exist(error);
            success.should.equal(false);
            sandbox.verify();
            callback();
          });
        }], done);
    });
  });

  describe("blipManager.markReceivedBlipsRead", function() {
  });

  describe("blipManager.broadcast",function () {
    it("alice broadcasts a blip at place_b (which she is following). alice should not get an alert", function(done) { 
      sandbox.mock(notificationManager).expects('makeNewBlipNotification').never();
      //console.log(js.pp(place_b));
      var topic = fix.get("test-topic");
      blipManager.broadcast({placeId: place_b._id,
                             authorId: alice._id, 
                             topicIds: [topic._id],
                             message: "should not deliver an alert"}, 
                            function(error, blip) { 
                              should.not.exist(error);
                              should.exist(blip);
                              //console.log("blip=" + js.pp(blip));
                              sandbox.verify();
                              done();
                            });
      
    });
  });
});

