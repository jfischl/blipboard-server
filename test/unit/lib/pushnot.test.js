var should = require('should');
var sinon = require('sinon');
var UrbanAirship = require('urban-airship');

var js = require('../../../lib/javascript');
var mongo = require('../../../lib/mongo');
var pushnot = require('../../../lib/pushnot');

var oid = mongo.ObjectID("000000000000000000000000");

describe('pushnot.sendPushNotification()', function() {
  var sandbox = sinon.sandbox.create();
  
  beforeEach(function() { 
  });

  afterEach(function() { 
    sandbox.verify();
    sandbox.restore();
  });

  var ensurePayloadLength = sinon.match(function(value) { 
    return JSON.stringify(value).length < 10;
  }, "ensurePayloadLength");

  it("short string basic pushnot", function(done) { 
    var pushmock = sandbox.mock(UrbanAirship.prototype);
    pushmock.expects("pushNotification").once().withArgs(sinon.match.string, sinon.match.has("aps", sinon.match.has("alert", "hi there"))).yieldsAsync(null);
    pushnot.sendPushNotification("userid", 1, "hi there", {id: oid}, function(error,payload) { 
      should.not.exist(error);
      should.exist(payload);
      JSON.stringify(payload).length.should.be.within(0,256);
      done();
    });
  });

  it("long string pushnot", function(done) { 
    var longm = "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.";
    var trunc = "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since...";

    var pushmock = sandbox.mock(UrbanAirship.prototype);
    pushmock.expects("pushNotification").once().withArgs(sinon.match.string, sinon.match.has("aps", sinon.match.has("alert", trunc))).yieldsAsync(null);
    pushnot.sendPushNotification("userid", 1, longm, {id: oid}, function(error,payload) { 
      should.not.exist(error);
      should.exist(payload);
      JSON.stringify(payload).length.should.be.within(0,256);
      console.log("payload length = " + JSON.stringify(payload).length);
      done();
    });
  });

});


