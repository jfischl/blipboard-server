/**
 * @fileoverview Listen network manager unit tests
 * @author aneil@blipboard.com
 */

var sinon = require('sinon');
var assert = require('assert');
var listenNetworkManager = require('../../../managers/listenNetworkManager');
var blipManager = require('../../../managers/blipManager');
var channelEvents = require('../../../managers/channelEvents');
var mongo = require('../../../lib/mongo');
var mongoFaker = require('../mongoFaker');
var toArrayWithArgs = require('../mongoFaker').toArrayWithArgs;
var BBError = require('../../../lib/error').BBError;

describe("listenNetworkManager", function () {
  var user1 = mongo.ObjectID('111111111111111111111111');
  var user2 = mongo.ObjectID('222222222222222222222222');
  var user3 = mongo.ObjectID('333333333333333333333333');
  var user4 = mongo.ObjectID('444444444444444444444444');
  var user5 = mongo.ObjectID('555555555555555555555555');
  var sandbox, channelEventsMock;

  beforeEach(function () {
    sandbox = sinon.sandbox.create();
    sandbox.add(mongoFaker.fake());
    channelEventsMock = sandbox.mock(channelEvents);
  });
  
  afterEach(function() {
    sandbox.restore();
  });

  /** programs fixed results from the channelListeners and channelListensTos collections */
  var listenNetworkCalls =function listenNetworkCalls(method,listenersResult,listenTosResult) {
    sandbox.mock(mongo.channelListeners).expects(method)
      .once()
      .yields(listenersResult[0],listenersResult[1]);
    
    sandbox.mock(mongo.channelListensTos).expects(method)
      .once()
      .yields(listenTosResult[0],listenTosResult[1]);
  }

  /** ensures that the listen network isn't accessed */
  var listenNetworkDoesNotCall = function listenNetworkDoesNotCall(method) {
    sandbox.mock(mongo.channelListeners).expects(method).never();
    sandbox.mock(mongo.channelListensTos).expects(method).never();
  }

  /**  programs fixed results for the validation step */
  var validateIdsChannelsFind = function validateIdsChannelsFind(error,result) {
    // mongo is called to verify the Ids are present
    sandbox.stub(mongo.channels,'find')
      .returns(toArrayWithArgs(error,result));
  }

  var callbackExpects = function callbackExpects(done,expectedError,expectedValue) {
    var expectation = sandbox.add(sinon.expectation.create('callback'));
    expectation.withExactArgs(expectedError,expectedValue);
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
    var callback = function (error,ignore) {
      assert(error.type===errorType);
      sandbox.verify();
      done();
    };
    return callback;
  }

  var channelEventsFiresAddedChannelListener = function channelEventsFiresAddedChannelListener(channelId,listenerId) {
    channelEventsMock.expects('addedChannelListener')
      .withExactArgs(channelId,listenerId)
      .once();
  }
  
  var channelEventsDoesNotFireAddedChannelListener = function channelEventsDoesNotFireAddedChannelListener() {
    channelEventsMock.expects('addedChannelListener')
      .never();
  }

  var channelEventsFiresRemovedChannelListener =function channelEventsFiresRemovedChannelListener(channelId,listenerId) {    channelEventsMock.expects('removedChannelListener')
      .withExactArgs(channelId,listenerId)
      .once();
  }

  var channelEventsDoesNotFireRemovedChannelListener = function channelEventsDoesNotFireRemovedChannelListener() {
    channelEventsMock.expects('removedChannelListener')
      .never();
  }

  var channelEventsFiresListenNetworkInconsistency=function channelEventsFiresListenNetworkInconsistency() {
    channelEventsMock.expects('listenNetworkInconsistency')
      .once();
  };

  var channelEventsDoesNotFireListenNetworkInconsistency=function channelEventsDoesNotFireListenNetworkInconsistency() {
    channelEventsMock.expects('listenNetworkInconsistency')
      .never();
  };

  var listenNetworkFinds =function listenNetworkFinds(collection, callbackResults) {
    sandbox.mock(collection).expects('find')
      .once()
      .returns(toArrayWithArgs(callbackResults));
  }
  ////////////////////////////////////////////////////////////////////////////////
  // TESTS BEGIN HERE
  describe("#listen(user1,user2)", function () {

    it("should callback(null,true) when user1 is not listening to user2", function (done) {
      validateIdsChannelsFind(null,[{_id:user1},{_id:user2}]);
      listenNetworkCalls('save',
                         [null,"value doesn't matter"],
                         [null,"value doesn't matter"]);
      listenNetworkDoesNotCall('remove');
      channelEventsFiresAddedChannelListener(user2,user1);
      channelEventsDoesNotFireRemovedChannelListener();
      channelEventsDoesNotFireListenNetworkInconsistency();
      sandbox.mock(mongo.channelListeners).expects('findOne').once().yields(null, null);
      channelEventsMock.expects('firstListenerToChannel').once().withExactArgs(user2);
      sandbox.mock(blipManager).expects('distributeBlipsOnTuneIn').once().yields(null);
      
      listenNetworkManager.listen(user1,user2,
                                  callbackExpects(done,null,true));
    });

    it("should callback(null,false) when user1 is already listening to user2", function (done) {
      validateIdsChannelsFind(null,[{_id:user1},{_id:user2}]);
      listenNetworkCalls('save',
                         [{code:mongo.errors.duplicateKeyError},null],
                         [{code:mongo.errors.duplicateKeyError},null]);
      listenNetworkDoesNotCall('remove');
      channelEventsDoesNotFireAddedChannelListener();
      channelEventsDoesNotFireRemovedChannelListener();
      channelEventsDoesNotFireListenNetworkInconsistency();
      sandbox.mock(mongo.channelListeners).expects('findOne').once().yields(null, {_id: user1});
      channelEventsMock.expects('firstListenerToChannel').never();
      sandbox.mock(blipManager).expects('distributeBlipsOnTuneIn').once().yields(null);

      listenNetworkManager.listen(user1,user2,
                                  callbackExpects(done,null,false));
    });

    it("should callback(BBError.validationError()) when  user1 is missing", function (done) {
      validateIdsChannelsFind(null,[{_id:user2}]);
      listenNetworkDoesNotCall('save');
      channelEventsDoesNotFireAddedChannelListener();
      channelEventsDoesNotFireRemovedChannelListener();
      channelEventsDoesNotFireListenNetworkInconsistency();

      listenNetworkManager.listen(user1,user2,
                                  callbackExpectsErrorType(done,BBError.validationError.type));
    });

    it("should callback(BBError.validationError()) when user2 is missing", function (done) {
      validateIdsChannelsFind(null,[{_id:user1}]);
      listenNetworkDoesNotCall('save');
      channelEventsDoesNotFireAddedChannelListener();
      channelEventsDoesNotFireRemovedChannelListener();
      channelEventsDoesNotFireListenNetworkInconsistency();

      listenNetworkManager.listen(user1,user2,
                                  callbackExpectsErrorType(done,BBError.validationError.type));
    });

    it("should callback(null,true) and fire listenersCountInvalid when database is inconsistent", function (done) {
      validateIdsChannelsFind(null,[{_id:user1},{_id:user2}]);
      listenNetworkCalls('save',
                         [{code:mongo.errors.duplicateKeyError},null],
                         [null,null]);
      listenNetworkDoesNotCall('remove');

      //
      // !am! we should fire a networkIsInvalid event or some such,
      //      not listenersCount invalid... TODO
      //
      channelEventsDoesNotFireAddedChannelListener();
      channelEventsDoesNotFireRemovedChannelListener();
      channelEventsFiresListenNetworkInconsistency();

      sandbox.mock(mongo.channelListeners).expects('findOne').once().yields(null, {_id: user1});
      channelEventsMock.expects('firstListenerToChannel').never();
      sandbox.mock(blipManager).expects('distributeBlipsOnTuneIn').once().yields(null);

      listenNetworkManager.listen(user1,user2,
                                  callbackExpects(done,null,true));
    });

    it("should callback(returnedError) when channelListener.save returns an error", function (done) {
      validateIdsChannelsFind(null,[{_id:user1},{_id:user2}]);

      sandbox.mock(mongo.channelListeners).expects('findOne').once().yields(null, {_id: user1});
      channelEventsMock.expects('firstListenerToChannel').never();
      sandbox.mock(blipManager).expects('distributeBlipsOnTuneIn').once().yields(null);

      var err = new Error("test Error");
      sandbox.mock(mongo.channelListensTos).expects('save')
        .once()
        .yields(null,true);

      sandbox.mock(mongo.channelListeners).expects('save')
        .once()
        .yields(err);

      listenNetworkDoesNotCall('remove');
      channelEventsDoesNotFireAddedChannelListener();
      channelEventsDoesNotFireRemovedChannelListener();
      
      listenNetworkManager.listen(user1,user2,
                                  callbackExpects(done,err,null));

    });

  //   it("should callback(returnedError) when channelListener.save returns an error", function (done) {
  //     validateIdsChannelsFind(null,[{_id:user1},{_id:user2}]);
  //     var err = new Error("test Error");
  //     listenNetworkCalls('save',
  //                        [null,null],
  //                        [err,null]);
      
  //     // listenNetworkDoesNotCall('remove');
  //     // channelEventsDoesNotFireAddedChannelListener();
  //     // channelEventsDoesNotFireRemovedChannelListener();

  //     listenNetworkManager.listen(user1,user2,
  //                                 callbackExpects(done,err,null));
  //   });

  });

  describe("#unlisten(user1,user2)", function () {
    it("should callback(null,true) when user1 is listening to user2", function (done) {
      validateIdsChannelsFind(null,[{_id:user1},{_id:user2}]);
      listenNetworkCalls('remove',
                         [null,1],
                         [null,1]);
      listenNetworkDoesNotCall('save');
      channelEventsFiresRemovedChannelListener(user2,user1);
      channelEventsDoesNotFireAddedChannelListener();
      channelEventsDoesNotFireListenNetworkInconsistency();

      sandbox.mock(mongo.receivedBlips).expects('remove').once().yields(null, true);

      listenNetworkManager.unlisten(user1,user2,
                                    callbackExpects(done,null,true));
    });

    it("should callback(null,false) when user1 is not listening to user2", function (done) {
      validateIdsChannelsFind(null,[{_id:user1},{_id:user2}]);
      listenNetworkCalls('remove',
                         [null,0],
                         [null,0]);
      listenNetworkDoesNotCall('save');
      channelEventsDoesNotFireRemovedChannelListener();
      channelEventsDoesNotFireAddedChannelListener();
      channelEventsDoesNotFireListenNetworkInconsistency();

      listenNetworkManager.unlisten(user1,user2,
                                    callbackExpects(done,null,false));
    });

    it("should callback(null,true) and fire listenersCountInvalid when database is inconsistent", function (done) {
      validateIdsChannelsFind(null,[{_id:user1},{_id:user2}]);
      listenNetworkCalls('remove',
                         [null,0],
                         [null,1]);
      listenNetworkDoesNotCall('save');
      channelEventsDoesNotFireRemovedChannelListener();
      channelEventsDoesNotFireAddedChannelListener();
      channelEventsFiresListenNetworkInconsistency();

      sandbox.mock(mongo.receivedBlips).expects('remove').once().yields(null, true);

      listenNetworkManager.unlisten(user1,user2,
                                    callbackExpects(done,null,true));
    });

    it("should callback('failed') and do not remove received blips when tune out fails", function ( done ) {
      validateIdsChannelsFind(null, [ { _id: user1 }, { _id: user2 } ]);

      listenNetworkCalls('remove', [ 'failed' ], [ 'failed' ]);

      listenNetworkDoesNotCall('save');

      channelEventsDoesNotFireRemovedChannelListener();
      channelEventsDoesNotFireAddedChannelListener();
      channelEventsDoesNotFireListenNetworkInconsistency();

      listenNetworkManager.unlisten(user1, user2, callbackExpects(done, 'failed'));
    });

    it("should callback('failed') when tune out succeeds but remove received blips fails", function ( done ) {
      validateIdsChannelsFind(null, [ { _id: user1 }, { _id: user2 } ]);

      listenNetworkCalls('remove', [ null, 1 ], [ null, 1 ]);
      
      listenNetworkDoesNotCall('save');

      channelEventsFiresRemovedChannelListener(user2,user1);
      channelEventsDoesNotFireAddedChannelListener();
      channelEventsDoesNotFireListenNetworkInconsistency();

      sandbox.mock(mongo.receivedBlips).expects('remove').once().yields('failed');

      listenNetworkManager.unlisten(user1, user2, callbackExpects(done, 'failed'));
    });
  });

  describe("#findListenTos(user1,channelIds,callback)", function (done) {
    it("should callback with all listenedTo channels when channelIds is null", function (done) {

      listenNetworkFinds(mongo.channelListensTos, 
                         [null,[{listensTo:user2},{listensTo:user3},{listensTo:user4}]]);

      listenNetworkManager.findListensTos(user1,
                                          callbackExpects(done,null,[user2,user3,user4]));

      
    });

    it("should callback with subset of listenedTo channelIds", function (done) {
      // !am! is this really testing anything??
      listenNetworkFinds(mongo.channelListensTos,
                         [null,[{listensTo:user2},{listensTo:user3}]]);

      listenNetworkManager.findListensTos(user1,
                                          [user2,user3,user5],
                                          callbackExpects(done,null,[user2,user3]));
      
    });

  });

  describe("#findListeners(user1,channelIds,callback)", function () {
    it("should callback with all listeners when channelIds is null", function (done) {

      listenNetworkFinds(mongo.channelListeners, 
                         [null,[{listener:user2},{listener:user3},{listener:user4}]]);

      listenNetworkManager.findListeners(user1,
                                         callbackExpects(done,null,[user2,user3,user4]));

      
    });

    it("should callback with subset of listeners when channelIds provided", function (done) {

      listenNetworkFinds(mongo.channelListeners,
                         [null,[{listener:user2},{listener:user3}]]);

      listenNetworkManager.findListeners(user1,
                                         [user2,user3,user5],
                                         callbackExpects(done,null,[user2,user3]));
      
    });

  });
});

