/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview Channel manager unit test
 * @author vladimir@blipboard.com
 *
 * @created Tue, Mar 20 2012 - 15:30:08 -0700
 * @updated Tue, Mar 20 2012 - 15:30:08 -0700
 */

var sinon = require('sinon');
var should = require('should');
var fs = require('fs');

var channelManager = require('../../../managers/channelManager');
var topicManager = require('../../../managers/topicManager');
var channelEvents = require('../../../managers/channelEvents');
var events = require('../../../lib/events');
var js = require('../../../lib/javascript');

var mongo = require('../../../lib/mongo');
var mongoFaker = require('../mongoFaker');
var ObjectID = require('../../../lib/mongo').ObjectID;

var user = {
  id: mongo.ObjectID('000000000000000000000000')
};

var sandbox, author,channels, blips, allChannels, listensTos;

describe('channelManager getChannel', function() {
  it('should yield an error when passed an undefined id for my channel', function(done) { 
    channelManager.getChannel(undefined, "foo", function (error, channel) {
      should.not.exist(channel);
      should.exist(error);
      done();
    });
  });

  it('should yield an error when passed an unknown channelId', function(done) { 
    channelManager.getChannel(user.id, "foo", function (error, channel) {
      should.not.exist(channel);
      should.exist(error);
      done();
    });
  });

  it('should yield a valid channel', function(done) { 
    sandbox = sinon.sandbox.create();
    sandbox.add(mongoFaker.fake());
    sandbox.mock(mongo.channels).expects('findOne').once().yields(null, {_id: user.id, name: "foo"});
    sandbox.mock(mongo.channelListensTos).expects('find').once().returns(mongoFaker.toArrayWithArgs(null, []));

    sandbox.stub(topicManager, 'decorateChannelsWithTopics', function (callback) { 
      function decorate(channels) { 
        callback(undefined, channels);
      }
      return mongo.mongoHandler("decorateChannelsWithTopics", callback, decorate);
    });

    channelManager.getChannel(user.id, user.id, function (error, channel) {
      should.exist(channel);
      channel.should.have.property('_id', user.id);
      channel.should.have.property('name', "foo");
      should.not.exist(error);
      sandbox.verify();
      sandbox.restore();
      done();
    });
  });
});

describe('channelManager decorate channels', function ( ) {
  beforeEach(function ( ) {
    author = { _id: user.id };
    channels = JSON.parse(fs.readFileSync([__dirname, 'castro.bb.json'].join('/'), 'ascii'));
    channels = channels.map(function(channel) { 
      channel._id = ObjectID(channel._id);
      return channel;
    });
    allChannels = channels.slice(0);
    allChannels.push(author);

    listensTos = [ ];
    sandbox = sinon.sandbox.create();
    sandbox.add(mongoFaker.fake());
  });

  afterEach(function ( ) {
    sandbox.verify();
    sandbox.restore();
  });

  describe('#decorateWithIsListening(error, channels)', function ( ) {
    it ('should not decorate channels when listenerId is null - user is not logged in', function ( done ) {
      var decorate = channelManager.isListeningDecoratorCallback(null, function ( error, channels ) {
        should.not.exist(error);
        channels.forEach(function (channel) {
          channel.should.not.have.property('isListening');
        });
        done();
      });

      decorate(null, channels);
    });

    it ('should not throw when user is not listening to any of the channels', function ( done ) {
      sandbox.mock(mongo.channelListensTos).expects('find').once().returns(mongoFaker.toArrayWithArgs(null, listensTos));
      var decorate = channelManager.isListeningDecoratorCallback(user.id, function ( error, channels ) {
        should.not.exist(error);
        channels.forEach(function (channel) {
          channel.should.have.property('isListening', false);
        });
        done();
      });

      decorate(null, channels);
    });

    it ('should decorate channels when everything is done correctly', function ( done ) {
      sandbox.mock(mongo.channelListensTos).expects('find').once().returns(mongoFaker.toArrayWithArgs(null, listensTos));

      // randomly tune in user into channels, ensure that there is at least one tunein
      var lookup = { }, chance = 1;
      channels.forEach(function (channel) {
        var tunein = Math.random() < chance;
        lookup[channel._id] = tunein;
        if ( tunein ) listensTos.push({ listensTo: channel._id });
        chance += ((tunein ? 0 : 1) - chance) / 2;
      });

      var decorate = channelManager.isListeningDecoratorCallback(user.id, function ( error, channels ) {
        should.not.exist(error);
        channels.forEach(function (channel) {
          channel.should.have.property('isListening', lookup[channel._id]);
        });

        done();
      });

      decorate(null, channels);
    });
  });
});

describe('channelManager decorate blips', function ( ) {
  beforeEach(function ( ) {
    blips = [{ _id: mongo.ObjectID("111111111111111111111111"), 
               text: "test blip",
               author: author,
               place: channels[0]
             }];
    
    listensTos = [ ];
    sandbox = sinon.sandbox.create();
    sandbox.add(mongoFaker.fake());
    sandbox.mock(mongo.channels).expects('findItems').once().yieldsAsync(null, allChannels);
    sandbox.stub(topicManager, 'decorateChannelsWithTopics', function (callback) { 
      function decorate(channels) { 
        callback(undefined, channels);
      }
      return mongo.mongoHandler("decorateChannelsWithTopics", callback, decorate);
    });
  });

  afterEach(function ( ) {
    sandbox.verify();
    sandbox.restore();
  });

  describe('#decorateChannelsForBlipsCallback(error, blips)', function ( ) {
    it ('should not decorate blips when listenerId is undefined - user is not logged in', function ( done ) {
      var decorate = channelManager.decorateChannelsForBlipsCallback(undefined, function ( error, blips ) {
        should.not.exist(error);
        blips.forEach(function (blip) {
          blip.should.not.have.property('isListening');
        });
        done();
      });

      decorate(null, blips);
    });

    it ('should not throw when user is not listening to any of the channels', function ( done ) {
      sandbox.mock(mongo.channelListensTos).expects('find').once().returns(mongoFaker.toArrayWithArgs(null, []));
      
      var decorate = channelManager.decorateChannelsForBlipsCallback(user.id, function ( error, blips ) {
        should.not.exist(error);
        blips.forEach(function (blip) {
          blip.author.should.have.property('isListening', false);
          blip.place.should.have.property('isListening', false);
        });
        done();
      });

      decorate(null, blips);
    });

    it ('should decorate channels when everything is done correctly', function ( done ) {
      var listensTos = [];
      listensTos.push({ listensTo: channels[0]._id});
      listensTos.push({ listensTo: user.id});
      sandbox.mock(mongo.channelListensTos).expects('find').once().returns(mongoFaker.toArrayWithArgs(null, listensTos));

      var decorate = channelManager.decorateChannelsForBlipsCallback(user.id, function ( error, blips ) {
        //console.log("blips=" + js.pp(blips));
        should.not.exist(error);
        blips.forEach(function (blip) {
          blip.author.should.have.property('isListening', true);
          blip.place.should.have.property('isListening', true);
        });

        done();
      });

      decorate(null, blips);
    });
  });
});


describe("channelManager.scheduleNextRefresh", function() {
  var date1 = new Date(2012,1,1,0,0,0),// 1/1/12 00:00
  date2 = new Date(2012,1,1,0,0,0),    // 1/1/12 00:00
  date3 = new Date(2012,1,1,0,0,3),    // 1/1/12 00:00:01
  now =   new Date(2012,1,2,0,0,2),    // 1/2/12 00:00:02
  place1 = { 
    _id: mongo.ObjectID('111111111111111111111111'),
    facebook: { lastRefresh: date1 }
  }, 
  place2 = { 
    _id: mongo.ObjectID('222222222222222222222222'),
    facebook: { lastRefresh: date2 }
  },
  place3 = { 
    _id: mongo.ObjectID('333333333333333333333333'),
    facebook: { lastRefresh: date3 }
  };

  beforeEach(function() { 
    sandbox = sinon.sandbox.create();
    sandbox.add(mongoFaker.fake());
    sandbox.useFakeTimers(now.getTime());
  });

  afterEach(function() {
    sandbox.restore();
  });

  it("should schedule another refresh in 15 seconds if no data", function(done) {
    this.timeout(16000);

    sandbox.mock(mongo.channels).expects('findOne').once().yields(null, null); // no results 
    sandbox.mock(channelEvents).expects('refreshChannelBlips').once().withExactArgs(undefined);
    channelManager.scheduleNextRefresh(function() {
      sandbox.clock.tick(15000);
      sandbox.verify();
      done();
    });
  });

  it("should schedule another refresh in 15 seconds if mongo returns error", function(done) {
    this.timeout(16000);

    sandbox.mock(mongo.channels).expects('findOne').once().yields("error", null); // no results 
    sandbox.mock(channelEvents).expects('refreshChannelBlips').once().withExactArgs(undefined);
    channelManager.scheduleNextRefresh(function() {
      sandbox.clock.tick(15000);
      sandbox.verify();
      done();
    });
  });

  it("should schedule another refresh if channel is still fresh until stale", function(done) {
    this.timeout(2000);
    sandbox.mock(mongo.channels).expects('findOne').once().yields(null, place3); // no results 
    sandbox.mock(channelEvents).expects('refreshChannelBlips').once().withExactArgs(place3._id);
    channelManager.scheduleNextRefresh(function() {
      sandbox.clock.tick(1000);
      sandbox.verify();
      done();
    });
  });
  
  it("should refresh (1x) if 1 stale channel", function(done) {
    sandbox.mock(mongo.channels).expects('findOne').once().yields(null, place1); // no results 
    sandbox.mock(channelEvents).expects('refreshChannelBlips').once().withExactArgs(place1._id);
    channelManager.scheduleNextRefresh(function() {
      sandbox.verify();
      done();
    });
  });
  
  it("should refresh (2x) if 2 stale channels", function(done) {
    sandbox.mock(mongo.channels).expects('findOne').once().yields(null, place1); // no results 
    sandbox.mock(channelEvents).expects('refreshChannelBlips').once().withExactArgs(place1._id);
    channelManager.scheduleNextRefresh(function() {
      sandbox.verify();

      sandbox.mock(mongo.channels).expects('findOne').once().yields(null, place2); // no results 
      sandbox.mock(channelEvents).expects('refreshChannelBlips').once().withExactArgs(place2._id);
      
      channelManager.scheduleNextRefresh(function() {
        sandbox.verify();
        done();
      });
    });
  });
});

