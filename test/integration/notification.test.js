var assert = require('assert');
var async = require('async');
var should = require('should');
var sinon = require('sinon');
var sprintf = require('sprintf').sprintf;

var ObjectID = require('../../lib/mongo').ObjectID;
var Page = require('../../lib/page').Page;
var config = require('../../config');
var criterionMatcher = require('../unit/mongoFaker').criterionMatcher;
var facebook = require('../../lib/facebook');
var js = require('../../lib/javascript');
var mongo = require('../../lib/mongo');
var mongofix = require('./mongofix');
var notificationManager = require('../../managers/notificationManager');
var pushnot = require('../../lib/pushnot');
var r = require('./region');


// declaring shared variables
var fix,sandbox,alice,bob,charlie,doug,me;
var place_a,blip1,blip2,blip3,blip4,blip5;
var not1,not2,not3;
var aliceLike,bobLike,charlieLike;
var now = new Date();
var t1 = new Date(2012,1,1,0,0,0);
var t2 = new Date(2012,1,1,0,0,1);
var t3 = new Date(2012,1,1,0,0,2);
var t4 = new Date(2012,1,1,0,0,3);
var t5 = new Date(2012,1,1,0,0,4);
var expiryTime = new Date(t1.getTime() + config.EXPIRY.user);
var aLike = {id:'alice', name:'alice'};
var bLike = {id:'bob', name:'bob'};
var cLike = {id:'charlie', name:'charlie'};

var matchEquals = function (x) {
  return sinon.match(function(y) {
    return y===x || y.equals(x);
  }, "should equal "+x.toString());
};

describe('notificationManager integration tests (with mongodb)', function ( ) {
  before(function ( done ) {
    mongo.initialize(function () {
      sandbox = sinon.sandbox.create();
      fix = mongofix.MongoFix(
        { key: 'me',      make: 'user',  name: 'me' },
        { key: 'alice',   make: 'user',  name: 'alice' },
        { key: 'bob',     make: 'user',  name: 'bob' },
        { key: 'charlie', make: 'user',  name: 'charlie' },
        { key: 'doug',    make: 'user',  name: 'doug' },

        { key: 'not1', make: 'notification', user: 'me', time: t1, type: 'tunein', listener: 'alice' },
        { key: 'not2', make: 'notification', user: 'me', time: t2, type: 'tunein', listener: 'bob' },
        { key: 'not3', make: 'notification', user: 'me', time: t3, type: 'tunein', listener: 'charlie' },

        { key: 'place_a', make: 'place', name: 'place_a', location: r.lplace_a },
        { key: 'blip1',   make: 'blip',  message: 'blip1', author: 'bob', place: 'place_a',
          createdTime: t1, expiryTime: expiryTime, popularity:1.0 },
        
        { key: 'not4', make: 'notification', user: 'alice', time: t1, type: 'like', liker: 'bob', blip: 'blip1'}
      );

      done();
    });
  });

  after(function(done) {
    mongofix.cleanup(done);
  });
  
  beforeEach(function(done) {
    sandbox.mock(facebook);

    fix.reset(function() {
      alice = fix.get('alice'); 
      bob = fix.get('bob'); 
      charlie = fix.get('charlie');
      doug = fix.get('doug');
      me = fix.get('me');
      not1 = fix.get('not1');
      not2 = fix.get('not2');
      not3 = fix.get('not3');
      done();
    });
  });

  afterEach(function(done) {
    sandbox.verify(); 
    sandbox.restore();
    done();
  });
  
  describe("notificationManager", function () {
    before(function (done) { 
      mongofix.cleanup(done);
    });

    var index = [{name: '_id', order: -1, type: 'objectID'}];
    it("should retrieve 3 unread notifications for me", function (done) {
      var page = new Page(null, index);
      notificationManager.getNotifications(me, page, function (error,notifications) {
        should.not.exist(error);
        should.exist(notifications);
        notifications.should.have.property('paging');
        notifications.should.have.property('data').with.lengthOf(3);
        notifications.should.have.property('channels').with.lengthOf(4);
        notifications.should.have.property('blips').with.lengthOf(0);

        //console.log("notification=" + js.pp(notifications));

        assert(notifications.channels[0]._id.toString() === me._id.toString());
        assert(notifications.channels[1]._id.toString() === alice._id.toString());
        assert(notifications.channels[2]._id.toString() === bob._id.toString());
        assert(notifications.channels[3]._id.toString() === charlie._id.toString());
        
        assert(notifications.data[0].userId.equals(me._id));
        assert(notifications.data[0].listenerId.equals(charlie._id));
        notifications.data[0].should.have.property('isNew', true);

        assert(notifications.data[1].userId.equals(me._id));
        assert(notifications.data[1].listenerId.equals(bob._id));
        notifications.data[1].should.have.property('isNew', true);

        assert(notifications.data[2].userId.equals(me._id));
        assert(notifications.data[2].listenerId.equals(alice._id));
        notifications.data[2].should.have.property('isNew', true);

        done();
      });
    });
    
    it("after marking most recent as read, should retrieve 3 read notifications for me", function (done) {
      var page = new Page(null, index);
      me.lastReadNotificationId = not3._id;
      notificationManager.acknowledgeNotifications(me, not3._id, page, function (error,notifications) {
        should.not.exist(error);
        should.exist(notifications);
        notifications.should.have.property('paging');
        notifications.should.have.property('data').with.lengthOf(3);

        //console.log("notification=" + js.pp(notifications));

        assert(notifications.channels[0]._id.toString() === me._id.toString());
        assert(notifications.channels[1]._id.toString() === alice._id.toString());
        assert(notifications.channels[2]._id.toString() === bob._id.toString());
        assert(notifications.channels[3]._id.toString() === charlie._id.toString());
        
        assert(notifications.data[0].userId.equals(me._id));
        assert(notifications.data[0].listenerId.equals(charlie._id));
        notifications.data[0].should.have.property('isNew', false);

        assert(notifications.data[1].userId.equals(me._id));
        assert(notifications.data[1].listenerId.equals(bob._id));
        notifications.data[1].should.have.property('isNew', false);

        assert(notifications.data[2].userId.equals(me._id));
        assert(notifications.data[2].listenerId.equals(alice._id));
        notifications.data[2].should.have.property('isNew', false);

        done();
      });
    });

    it("after doug tunes in to me, I get a notification", function (done) { 
      var page = new Page(null, index);
      me.lastReadNotificationId = not3._id;
      notificationManager.acknowledgeNotifications(me, not3._id, page, function (error,notifications) {
        //console.log("nots=" + js.pp(notifications));
        should.not.exist(error);
        should.exist(notifications);
        
        sandbox.mock(pushnot).expects('sendPushNotification')
          .withArgs(me._id, 1, "doug is following your blips")
          .once();
        
        notificationManager.makeNewListenerNotification(me, doug, function(error) { 
          should.not.exist(error);
          done();
        });
      });
    });

    it("after bob (recommended guru) tunes in to doug, he gets a notification with no text", function (done) { 
      sandbox.mock(pushnot).expects('sendPushNotification').withArgs(doug._id, 1, undefined).once();
      
      doug.recommended = true;
      notificationManager.makeNewListenerNotification(doug, bob, function(error) { 
        should.not.exist(error);
        done();
      });
    });

    it("after bob (not recommended guru) tunes in to doug, he gets a notification with text", function (done) { 
      sandbox.mock(pushnot).expects('sendPushNotification').withArgs(doug._id, 1, "bob is following your blips").once();
      
      doug.recommended = false;
      notificationManager.makeNewListenerNotification(doug, bob, function(error) { 
        should.not.exist(error);
        done();
      });
    });


    it("should show 1 like notification for alice", function(done) { 
      var page = new Page(null, index);
      notificationManager.getNotifications(alice, page, function (error,notifications) {
        should.not.exist(error);
        should.exist(notifications);
        
        //console.log("notification=" + js.pp(notifications));

        notifications.should.have.property('paging');
        notifications.should.have.property('data').with.lengthOf(1);
        notifications.should.have.property('channels').with.lengthOf(2);
        notifications.should.have.property('blips').with.lengthOf(1);
        
        assert(notifications.channels[0]._id.toString() === alice._id.toString());
        assert(notifications.channels[1]._id.toString() === bob._id.toString());
        
        assert(notifications.data[0].userId.equals(alice._id));
        assert(notifications.data[0].likerId.equals(bob._id));
        notifications.data[0].should.have.property('isNew', true);

        done();
      });
    });
  });
});
