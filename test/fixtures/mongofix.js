/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview Mongo fixture
 * @author vladimir@blipboard.com
 *
 * @created Tue, Mar 06 2012 - 18:12:11 -0800
 * @updated Tue, Jul 03 2012 - 13:59:21 -0700
 */

var async = require('async');
var mongoskin = require('mongoskin');

var fake = require('./fake');
var ND = require('./distribution').NormalDistribution;

var config = require('../../config');
var password = require('../../lib/password');

var random = function random ( length ) {
  var result = '';

  for ( var i = 0; i < length; i++ ) {
    result += Math.floor(Math.random() * 10 % 10);
  }

  return result;
}

var ensureMinWidth = function ensureMinWidth ( string, width ) {
  var result = '' + string;
  for ( var i = result.length; i < width; i++ ) result += ' ';
  return result;
}

var makeStack = function makeStack ( prereqs, worker ) {
  var stack = [ ];

  for ( var key in prereqs ) if ( prereqs[key] == true ) stack.push(key);

  stack.push(worker);

  return stack;
}

var VERBOSE = false;

var MongoFix = exports.MongoFix = function MongoFix ( ) {
  var name = typeof arguments[0] == 'string' ? arguments[0] : 'fix-' + new Date().getTime();
  var mongo = typeof arguments[1] == 'string' ? arguments[1] : process.env.MONGO_URL;
  var args = [ ];

  for ( var i = 0; i < arguments.length; i++) {
    if ( typeof arguments[i] == 'object' ) args.push(arguments[i]);
  }

  if ( !(this instanceof MongoFix) ) return new MongoFix(name, mongo, args);

  this.name = name;
  this.mongo = mongo;

  console.log( 'MONGO: ' + mongo );

  this.autosave = true;
  this.isVerbose = VERBOSE;

  this.state = { }
  this.script = { };

  this.add(args);
}

MongoFix.verbose = function verbose ( isVerbose ) {
  VERBOSE = isVerbose == null ? !VERBOSE : isVerbose != false;
}

MongoFix.prototype.baseKey = function baseKey ( key ) {
  var parts = this.key(key).split('-');

  var base = [ ];

  for ( var i = 0; i < parts.length; i++ ) {
    base.push(parts[i]);
    var key = this.key(base);
    if ( this.script[key] ) return key;
  }
}

MongoFix.prototype.isBaseKey = function isBaseKey ( key ) { return this.script[key]; }

MongoFix.prototype.key = function key ( parts ) {
  var key = [ ];

  if ( parts instanceof Array ) key = parts;
  else {
    for ( var i = 0; i < arguments.length; i++ ) key.push(arguments[i]);
  }

  return key.join('-');
}

MongoFix.prototype.isKey = function isKey ( key ) { return this.state[key] != null; }

MongoFix.prototype.get = function get ( ) {
  var key = [ ];

  for ( var i = 0; i < arguments.length; i++ ) key.push(arguments[i]);

  return this.state[this.key(key)];
}

MongoFix.prototype.set = function set ( key, args ) {
  this.isModified = true;

  args.key = key;

  var action = 'make' + args.make[0].toUpperCase() + args.make.substring(1);

  this.script[key] = { action: action, key: key, args: args }
}

MongoFix.prototype.extract = function property ( value, path ) {
  var obj = this.isKey(value) ? this.get(value) : value;
  var path = typeof path == 'string' ? path.split('.') : path;

  if ( path instanceof Array ) {
    while ( obj && path.length > 0 ) obj = obj[path.shift()];
  }

  return obj;
}

MongoFix.prototype.parse = function parse ( args, prereqs ) {
  var result = [ ];

  if ( !args ) return result;

  if ( args instanceof Array ) {
    for ( var i = 0; i < args.length; i++ ) {
      var arg = args[0];

      if ( typeof arg == 'string' || arg instanceof Array ) {
        var key = this.key(arg);
        var base = this.baseKey(key);
        
        if ( base ) {
          if ( prereqs ) prereqs[base] = true;
          arg = key;
        }
      }

      result.push(arg);
    }
  }
  else {
    var instruction = this.script[this.key(args)];
   
    for ( var i = 0; i < instruction.args.quantity; i++ ) {
      result.push(this.key(instruction.key, i));
    }

    if ( prereqs && result.length > 0 ) prereqs[instruction.key] = true;
  }

  return result;
}

MongoFix.prototype.ensureDbConnection = function ensureDbConnection ( callback ) {
  this.db = this.db || mongoskin.db(this.mongo);
  var self = this;

  var onCreated = function onCreated ( error, collection ) {
    collection.ensureIndex([{ name: 1 }], callback);
  }

  var collection = this.db.collection('MongoFix');
  if ( !collection ) this.db.createCollection('MongoFix', onCreated);
  else onCreated(null, collection);
}

MongoFix.prototype.make = function make ( key, collection, fields, callback ) {
  var doc = this.get(key) || { isFixture: true, fixture: { name: this.name, key: key } };
  for ( var i in fields ) doc[i] = fields[i]

  var self = this;
  var onMade = function onMade ( error, result ) {
    if (error) return callback(error);

    var result = result && result[0] && result[0]._id ? result[0] : doc;

    self.state[key] = result;

    callback();
  }

  var options = { safe: true }

  if ( doc._id ) {
    var selector = { _id: doc._id }
    this.db.collection(collection).update(selector, doc, options, onMade);
  }
  else {
    this.db.collection(collection).insert(doc, options, onMade);
  }
}

MongoFix.prototype.add = function add ( ) {
  this.isModified = true;
  for ( var i = 0; i < arguments.length; i++ ) {
    var args = arguments[i];

    if ( args instanceof Array ) this.add.apply(this, args);
    else if ( typeof args == 'object' ) {
      var key = args.key || ['key', new Date().getTime(), random(5)].join('-');
      var action = 'make' + args.make[0].toUpperCase() + args.make.substring(1);
      this.script[key] = { action: action, key: key, args: args }
    }
  }
}

MongoFix.prototype.remove = function remove ( ) {
  this.isModified = true;
  for ( var i = 0; i < arguments.length; i++ ) {
    var key = arguments[i];

    if ( key instanceof Array  ) this.remove.apply(this, key);
    else if ( typeof key == 'string' ) {
      delete this.script[key];
    }
  }
}

MongoFix.prototype.save = function save ( callback ) {
  if ( this.isVerbose ) {
    var action = [ ensureMinWidth('Saving', 25), ensureMinWidth(this.name, 45) ].join(' - ');
    var finished = [ action, 'Done' ].join(' - ');
    console.log( action );
    console.time( finished );
  }
  var self = this;

  var onSaved = function onSaved ( error ) {
    if ( self.isVerbose ) console.timeEnd( finished );
    self.isModified = false;
    callback(error);
  }

  var selector = { name: this.name }
  var options = { safe: true, upsert: true }
  var fix = {
    name: this.name,
    script: this.script
  }

  this.ensureDbConnection(function ( error ) {
    if ( error ) return callback(error);
    self.db.collection('MongoFix').update( selector, fix, options, onSaved );
  });
}

MongoFix.prototype.load = function load ( callback ) {
  if ( this.isVerbose ) {
    var action = [ ensureMinWidth('Loading', 25), ensureMinWidth(this.name, 45) ].join(' - ');
    var finished = [ action, 'Done' ].join(' - ');
    console.log( action );
    console.time( finished );
  }
  var self = this;

  var onLoaded = function onLoaded ( error, fix ) {
    if ( self.isVerbose ) console.timeEnd( finished );
    if ( error ) return callback(error);
    
    var fix = fix && fix[0] ? fix[0] : { };
    self.script = fix.script || { };

    self.getState(callback);

    self.isModified = false;
  }

  this.ensureDbConnection(function ( error ) {
    if ( error ) return callback(error);
    self.db.collection('MongoFix').find({ name: self.name }).toArray(onLoaded);
  });
}

MongoFix.prototype.getState = function getState ( callback ) {
  if ( this.isVerbose ) {
    var action = [ ensureMinWidth('Getting State', 25), ensureMinWidth(this.name, 45) ].join(' - ');
    var finished = [ action, 'Done' ].join(' - ');
    console.log( action );
    console.time( finished );
  }
  this.state = { }
  var self = this;

  var selector = { isFixture: true, 'fixture.name': this.name }

  var worker = function worker ( collection, callback ) {
    self.db.collection(collection.mongoName).find(selector).toArray(function ( error, docs ) {
      for ( var i = 0; i < docs.length; i++ ) {
        var key = docs[i].fixture.key;
        if ( key ) self.state[key] = docs[i];
      }

      callback();
    });
  }

  var finalCallback = function finalCallback ( error ) {
    if ( self.isVerbose ) console.timeEnd( finished );
    callback(error, self.state);
  }

  this.ensureDbConnection(function ( error ) {
    if ( error ) return finalCallback(error);
    async.forEach(config.MONGO.collections, worker, finalCallback);
  });
}

MongoFix.prototype.refresh = function refresh ( fresh, callback ) {
  if ( this.isVerbose ) {
    var action = [ ensureMinWidth('Refreshing', 25), ensureMinWidth(this.name, 45) ].join(' - ');
    var finished = [ action, 'Done' ].join(' - ');
    console.log( action );
    console.time( finished );
  }
  var self = this;

  var callback = callback || fresh;
  var fresh = typeof fresh == 'object' ? fresh : { };

  var save = function save ( callback ) {
    if ( self.autosave ) self.save(callback);
    else callback();
  }

  var run = function run ( callback ) {
    var workers = { }

    for ( var key in self.script ) {
      var step = self.script[key];

      if ( typeof self[step.action] == 'function' ) {
        if ( !fresh[key] ) {
          workers[key] = self[step.action](step.key, step.args);
        }
        else {
          workers[key] = function ( callback ) { callback(); }
        }
      }
      else {
        return callback('unknown action: ' + step.action);
      }
    }

    console.log( 'Workers: ' + JSON.stringify(workers, null, 2) );
    async.auto(workers, function ( ) { callback(); });
  }

  var finalCallback = function finalCallback ( error ) {
    if ( self.isVerbose ) console.timeEnd( finished );
    callback(error, self.state);
  }

  this.ensureDbConnection(function ( error ) {
    if ( error ) return callback(error);
    async.series([save, run], finalCallback);
  });
}

MongoFix.prototype.cleanup = function cleanup ( callback ) {
  if ( this.db ) {
    this.db.close();
    this.db = null;
  }
  callback('cleanup is not implemented yet');
}

// user
MongoFix.prototype.makeUser = function makeUser ( key, args ) {
  console.log( 'preparing make user' );
  var self = this;

  var makeUserWorker = function makeUserWorker ( callback ) {
    console.log( 'making user' );
    var fields = {
      name: args.name || fake.name(),
      type: config.MONGO.channelType.user,
      password: password.makeSaltedHash(name)
    }

    self.make(key, 'Channel', fields, callback);
  }

  return [ makeUserWorker ];
}

MongoFix.prototype.makeUsers = function makeUsers ( key, args ) {
  console.log( 'preparing make users' );
  var self = this;

  var users = [ ];
  var quantity = args.quantity > 1 ? args.quantity : 1;

  for ( var i = 0; i < quantity; i++ ) {
    var name = [ fake.name() ];
    if (args.name ) name.unshift(args.name);

    name = name.join(' ');

    var user = {
      key: self.key(key, i),
      name: name,
      type: config.MONGO.channelType.user,
      pswd: password.makeSaltedHash(name)
    }

    users.push(user);
  }

  var makeUsersWorker = function makeUsersWorker ( callback ) {
    console.log( 'making users' );
    var worker = function worker ( user, callback ) {
      var fields = {
        name: user.name,
        type: user.type,
        password: user.pswd
      }

      self.make(user.key, 'Channel', fields, callback);
    }

    async.forEach(users, worker, callback);
  }

  return [ makeUsersWorker ];
}

// place
MongoFix.prototype.makePlace = function makePlace ( key, args ) {
  console.log( 'preparing place' );
  var self = this;

  var makePlaceWorker = function makePlaceWorker ( callback ) {
    console.log( 'making place' );
    var fields = {
      name: args.name || fake.string(15),
      type: config.MONGO.channelType.place,
      description: args.description || fake.string(60),
      location: fake.location(args.latitude, args.longitude, args.latSpan, args.lonSpan),
      facebook: {
        id: facebookId || ('99999' + fake.string(10, '0123456789')),
        likes: (args.likes || 0) + fake.integer(args.likesMin, args.likesMax),
        checkins: 0,
        talking_about_count: 0,
        lastRefresh: 0
      }
    }

    self.make(key, 'Channel', fields, callback);
  }

  return [ makePlaceWorker ];
}

MongoFix.prototype.makePlaces = function makePlaces ( key, args ) {
  console.log( 'preparing places' );
  var self = this;

  var places = [ ];
  var quantity = args.quantity > 1 ? args.quantity : 1;

  for ( var i = 0; i < quantity; i++ ) {
    var name = [ fake.string(15) ];

    if ( args.name ) name.unshift(args.name);
    name = name.join(' ');

    var description = [ fake.string(60) ];

    if ( args.description ) description.unshift(args.description);
    description = description.join(' ');

    var place = {
      key: self.key(key, i),
      name: name,
      type: config.MONGO.channelType.place,
      description: description,
      location: fake.location(args.latitude, args.longitude, args.latSpan, args.lonSpan),
      facebook: {
        id: ('99999' + fake.string(10, '0123456789')),
        likes: (args.likes || 0) + fake.integer(args.likesMin, args.likesMax),
        checkins: 0,
        talking_about_count: 0,
        lastRefresh: 0
      }
    }

    places.push(place);
  }

  var makePlacesWorker = function makePlacesWorker ( callback ) {
    console.log( 'making places' );
    var worker = function worker ( place, callback ) {
      var fields = {
        name: place.name,
        type: place.type,
        description: place.description,
        location: place.location,
        facebook: place.facebook
      }

      self.make(place.key, 'Channel', fields, callback);
    }

    async.forEach(places, worker, callback);
  }

  return [ makePlacesWorker ];
}

// blip
MongoFix.prototype.makeBlip = function makeBlip ( key, args ) {
  console.log( 'preparing blip' );
  var self = this;

  var prereqs = { }
  var place = this.parse([args.place], prereqs)[0];
  var author = this.parse([args.author], prereqs)[0];

  var created = (args.created || new Date ( ).getTime()) + fake.integer(args.createdMin, args.createdMax);
  var expires = (args.expires || (created + 1000 * 60 * 60 * 24)) + fake.integer(args.expiresMin, args.expiresMax);

  var makeBlipWorker = function makeBlipWorker ( callback ) {
    console.log( 'making blip' );
    var fields = {
      text: args.text || fake.string(6 * ((args.words || 0) + fake.integer(args.wordsMin, args.words.Max))),
      author: self.extract(author),
      place: self.extract(place),
      createdTime: new Date (created),
      expiryTime: new Date (expires),
      likes: [ ] 
    }

    self.make(key, 'Blip', fields, callback);
  }

  return makeStack(prereqs, makeBlipWorker);
}

MongoFix.prototype.makeBlipsAtPlaces = function makeBlipsAtPlaces ( key, args ) {
  console.log( 'preparing blips at places' );
  var self = this;

  var prereqs = { }
  var places = this.parse(args.places, prereqs);
  var quantity = args.quantity > 1 ? args.quantity : places.quantity;

  var blips = [ ];

  for ( var i = 0; i < quantity; i++ ) {
    var place = places[i % places.length];
    var text = [ fake.string(6 * ((args.words || 0) + fake.integer(args.wordsMin, args.wordsMax))) ];

    if ( args.text ) text.unshift(args.text);

    var created = (args.created || new Date ( ).getTime()) + fake.integer(args.createdMin, args.createdMax);
    var expires = (args.expires || (created + 1000 * 60 * 60 * 24)) + fake.integer(args.expiresMin, args.expiresMax);

    var blip = {
      key: self.key(key, i),
      text: text.join(' '),
      author: place,
      place: place,
      created: created,
      expires: expires,
    }
    
    blips.push(blip);
  }

  var makeBlipsAtPlacesWorker = function makeBlipsAtPlacesWorker ( callback ) {
    console.log( 'making blips at places' );
    var worker = function worker ( blip, callback ) {
      var fields = {
        text: blip.text,
        author: self.extract(blip.author),
        place: self.extract(blip.place),
        createdTime: blip.created,
        expiryTime: blip.expires,
        likes: [ ]
      }

      self.make(blip.key, 'Blip', fields, callback);
    }

    async.forEach(blips, worker, callback);
  }

  return makeStack(prereqs, makeBlipsAtPlacesWorker);
}

// received
MongoFix.prototype.makeReceivedBlip = function makeReceivedBlip ( key, args ) {
  console.log( 'preparing received blip' );
  var self = this;

  var prereqs = { }

  var user = this.parse([args.user], prereqs)[0];
  var blip = this.parse([args.blip], prereqs)[0];

  var makeReceivedBlipWorker = function makeReceivedBlipWorker ( callback ) {
    console.log( 'making received blip' );
    var fields = {
      user: self.db.toObjectID(self.extract(user, '_id')),
      blip: self.db.toObjectID(self.extract(blip, '_id')),
      createdTime: self.extract(blip, 'createdTime'),
      expiryTime: self.extract(blip, 'expiryTime'),
      tileIndex: self.extract(blip, 'place.location.tileIndex'),
      location: {
        latitude: self.extract(blip, 'place.location.latitude'),
        longitude: self.extract(blip, 'place.location.longitude')
      },
      isRead: args.isRead == true
    }

    self.make(key, 'ReceivedBlip', fields, callback);
  }

  return makeStack(prereqs, makeReceivedBlipWorker);
}

MongoFix.prototype.makeReceivedBlips = function makeReceivedBlips ( key, args ) {
  console.log( 'preparing received blips' );
  var self = this;
  
  var prereqs = { }
  var users = this.parse(args.users, prereqs);
  var blips = this.parse(args.blips, prereqs);
  var quantity = args.quantity > 1 ? args.quantity : users.quantity;

  var received = [ ];

  for ( var i = 0; i < quantity; i++ ) {
    received.push({
      key: self.key(key, i),
      user: users[i % users.length],
      blip: blips[i % blips.length]
    });
  }

  var makeReceivedBlipsWorker = function makeReceivedBlipsWorker ( callback ) {
    console.log( 'making received blips' );
    var worker = function worker ( received, callback ) {
      var fields = {
        user: self.db.toObjectID(self.extract(received.user, '_id')),
        blip: self.db.toObjectID(self.extract(received.blip, '_id')),
        createdTime: self.extract(received.blip, 'createdTime'),
        expiryTime: self.extract(received.blip, 'expiryTime'),
        tileIndex: self.extract(received.blip, 'place.location.tileIndex'),
        location: {
          latitude: self.extract(received.blip, 'place.location.latitude'),
          longitude: self.extract(received.blip, 'place.location.longitude')
        },
        isRead: args.isRead == true
      }

      self.make(received.key, 'ReceivedBlip', fields, callback);
    }

    async.forEach(received, worker, callback);
  }

  return makeStack(prereqs, makeReceivedBlipsWorker);
}

// tunein
MongoFix.prototype.makeTunein = function makeTunein ( key, args ) {
  console.log( 'preparing tunein' );
  var self = this;

  var prereqs = { }
  var user = this.parse([args.user], prereqs)[0];
  var channel = this.parse([args.channel], prereqs)[0];

  var makeTuneinWorker = function makeTuneinWorker ( callback ) {
    console.log( 'making tunein' );
    var listenerWorker = function listenerWorker ( callback ) {
      console.log( 'making listener' );
      var fields = {
        channel: self.db.toObjectID(self.extract(channel, '_id')),
        listener: self.db.toObjectID(self.extract(user, '_id'))
      }

      self.make(self.key(key, 'listener'), 'ChannelListener', fields, callback);
    }

    var listensToWorker = function listensToWorker ( callback ) {
      console.log( 'making listens to' );
      var fields = {
        channel: self.db.toObjectID(self.extract(user, '_id')),
        listensTo: self.db.toObjectID(self.extract(channel, '_id'))
      }

      self.make(self.key(key, 'listensTo'), 'ChannelListensTo', fields, callback);
    }

    async.parallel([ listenerWorker, listensToWorker ], callback);
  }

  return makeStack(prereqs, makeTuneinWorker);
}

MongoFix.prototype.makeTuneins = function makeTuneins ( key, args ) {
  console.log( 'preparing tuneins' );
  var self = this;

  var prereqs = { }
  var users = this.parse(args.users, prereqs);
  var channels = this.parse(args.channels, prereqs);
  var quantity = args.quantity > 1 ? args.quantity : 0;

  var tuneins = [ ];

  if ( args.distribution && args.distribution.isNormal ) {
    var nd = new ND(channels.length, args.distribution.expectation, args.distribution.deviation);
    for ( var i = 0; i < quantity; i++ ) {
      var tunein = {
        key: self.key(key, i),
        channel: channels[nd.next()],
        user: users[i % users.length]
      }

      tuneins.push(tunein);
    }
  }
  else {
    for ( var i = 0; i < quantity; i++ ) {
      var tunein = {
        key: self.key(key, i),
        channel: channels[i % channels.length],
        user: users[i % users.length]
      }

      tuneins.push(tunein);
    }
  }

  var makeTuneinsWorker = function makeTuneinsWorker ( callback ) {
    console.log( 'making tuneins' );
    var listenerWorker = function listenerWorker ( callback ) {
      console.log( 'making listeners' );
      var worker = function worker ( tunein, callback ) {
        var fields = {
          channel: self.db.toObjectID(self.extract(tunein.channel, '_id')),
          listener: self.db.toObjectID(self.extract(tunein.user, '_id'))
        }

        self.make(self.key(tunein.key, 'listener'), 'ChannelListener', fields, callback);
      }

      async.forEach(tuneins, worker, callback);
    }

    var listensToWorker = function listensToWorker ( callback ) {
      console.log( 'making listens tos' );
      var worker = function worker ( tunein, callback ) {
        var fields = {
          channel: self.db.toObjectID(self.extract(tunein.user, '_id')),
          listensTo: self.db.toObjectID(self.extract(tunein.channel, '_id'))
        }

        self.make(self.key(tunein.key, 'listensTo'), 'ChannelListensTo', fields, callback);
      }

      async.forEach(tuneins, worker, callback);
    }

    async.parallel([ listenerWorker, listensToWorker ], callback);
  }

  return makeStack(prereqs, makeTuneinsWorker);
}

//MongoFix.prototype.makeTunein = function makeTunein ( args, callback ) {
//  var listener = this.get(args.listener);
//  var listensTo = this.get(args.listensTo);
//
//  require('../../managers/listenNetworkManager').listen(listener._id, listensTo._id, callback);
//}

//function cleanup ( callback ) {
//  mongo.channels.find({isFixture:true},{fields:['_id']}).toArray(function (error,results) {
//    function removeWorker(collection,criterion) {
//      return function removeFixtures(callback) {
//        collection.remove(criterion,callback);
//      };
//    }
//    var fixtureIds = results.map(function(r) {return r._id});
//    //console.log("mongofix.cleanup " + js.ppc(fixtureIds));
//    async.parallel([removeWorker(mongo.channels,{_id: {$in:fixtureIds}}),
//                    removeWorker(mongo.channelListeners,
//                                 {$or:[{'channel':{$in:fixtureIds}},
//                                       {'listener':{$in:fixtureIds}}]}),
//                    removeWorker(mongo.channelListensTos,
//                                 {$or:[{'channel':{$in:fixtureIds}},
//                                       {'listensTo':{$in:fixtureIds}}]}),
//                    removeWorker(mongo.blips,
//                                 {$or:[{'author':{$in:fixtureIds}},
//                                       {'topics':{$in:fixtureIds}}]}),
//                    removeWorker(mongo.receivedBlips,
//                                 {'user':{$in:fixtureIds}}),
//                    removeWorker(mongo.channelRanks,
//                                 {'channel':{$in:fixtureIds}}),
//                    removeWorker(mongo.receivedBlips,
//                                 {'user':{$in:fixtureIds}})],
//                   callback);
//  });
//}
//exports.MongoFix = MongoFix;
//exports.cleanup = cleanup;


var test = exports.test = function test ( ) {
  var fix = new MongoFix('test', { make: 'user', name: 'vladimir', key: 'me' }, { make: 'user', key: 'random' });
  fix.add([[{ make: 'user', key: 'r1' }], [{ make: 'user', key: 'r2' }, { make: 'user', key: 'r3' }], { make: 'user' }]);
  fix.remove('r3', ['r2', 'r1']);

  async.series(
    [
      function ( callback ) { fix.load(callback); },
      function ( callback ) {
        fix.refresh(function (error, state) {
          callback(error);
        });
      }
    ],
    function ( ) {
      var obj = {
        name: fix.name,
        mongo: fix.mongo,
        state: fix.state,
        script: fix.script,
        isModified: fix.isModified
      }
      console.log( JSON.stringify(obj, null, 2) );
      fix.cleanup(function ( error ) { console.log( error || 'success' ); });
    }
  );
}

//test();
