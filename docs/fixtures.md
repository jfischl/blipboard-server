__MongoFix - test/integration/mongofix.js__

# Using MongoFix in tests
1. Define a sequence of steps used for creating a state in the database
  
        var fix = mongofix.MongoFix(
          // create user channels
          { key: 'me',        make: 'user',   name: 'me' },                            // create user me
          { key: 'alice',     make: 'user',   name: 'alice' },                         // create user alice
          { key: 'bob',       make: 'user',   name: 'bob' },                           // create user bob
          { key: 'carl',      make: 'user',   name: 'carl' },                          // create user carl
          { key: 'doug',      make: 'user',   name: 'doug' },                          // create user doug
    
          // create place channels
          { key: 'place_a',   make: 'place',  name: 'place_a' },                       // create place place_a
          { key: 'place_b',   make: 'place',  name: 'place_b' },                       // create place place_b
    
          // tunein people into places
          { key: 'me_a',      make: 'tunein', listener: 'me', listensTo: 'place_a' },  // tune me into place_a
          { key: 'bob_a',     make: 'tunein', listener: 'bob', listensTo: 'place_a' }, // tune bob into place_a
          { key: 'bob_alice', make: 'tunein', listener: 'bob', listensTo: 'alice' },   // tune bob into alice
          { key: 'bob_carl',  make: 'tunein', listener: 'bob', listensTo: 'carl' },    // tune bob into carl
          { key: 'bob_doug',  make: 'tunein', listener: 'bob', listensTo: 'doug' }     // tune bob into doug
        );


2. Execute the defined steps to create a clean state in the database

        beforeEach(function ( done ) {
          fix.reset(done);
        });


3. Access execution results for particular steps (in most cases the results of executed steps are created documents)

        var a = fix.get('place_a');
        var bob = fix.get('bob');
        var carl = fix.get('carl');
        var doug = fix.get('doug');
        var options = { username: bob._id, password: bob.name };


4. Clean up all documents created by MongoFix

        after(function(done) {
          mongofix.cleanup(done);
        });


# Mongo Fixtures
1. Make User - `{ key: '<uniqueId>', make: 'user', name: '<username>' }`  
Make user creates a user channel document with name and password equal to the specified <username>.
<uniqueId> references the user channel document created by MongoDB.

        var fix = mongofix.MongoFix({ key: '<uniqueId>', make: 'user', name: '<username>' });
        fix.reset(function ( ) {
          var createdUserDoc = fix.get('<uniqueId>');
          createdUserDoc.name.should.equal('<username>');
          should.exist(createdUserDoc._id);
          should.exist(createdUserDoc.facebook.likes);
        });


2. Make Place - `{ key: '<uniqueId>', make: 'place', name: '<placename>', location: <location> }`  
Make place creates a place channel document with the provided name <placename> and location <location>. If location is not provided a fake location is generated.
<uniqueId> references the place channel document created by MongoDB.

        var someLocation = { latitude: <lat>, longitude: <lon>, tileIndex: <tileIndex> }
        var fix = mongofix.MongoFix({ key: '<uniqueId>', make: 'place', name: '<placename>', location: someLocation });
        fix.reset(function ( ) {
          var createdPlaceDoc = fix.get('<uniqueId>');
          createdPlaceDoc.name.should.equal('placename');
          createdPlaceDoc.location.latitude.should.equal(<lat>);
          createdPlaceDoc.location.longitude.should.equal(<lon>);
          createdPlaceDoc.location.tileIndex.should.equal(<tileIndex>);
          should.exist(createdPlaceDoc._id);
          should.exist(createdPlaceDoc.facebook.likes);
        });


3. Make Tunein - `{ key: '<user>_<place>', make: 'tunein', listener: '<user>', listensTo: '<place>' }`  
Make tunein tunes listener into listensTo, where both listener and listensTo are keys to the predefined user and place channel fixtures.

        var fix = mongofix.MongoFix(
          { key: '<user>', make: 'user', name: '<username>' },
          { key: '<place>', make: 'place', name: '<placename>' },
          { key: '<user>_<place>', make: 'tunein', listener: '<user>', listensTo: '<place>' }
        );


# Adding custom fixtures to MongoFix
1. Simply add the following code to the mongofix.js file:

        MongoFix.prototype.makeNewCustomFixture = function makePlace ( args, callback ) {
          // creating a document object using provided arguments
          var doc = fixdoc({
            arg1: args.arg1,
            arg2: args.arg2,
            arg3: args.arg3,
            location: fakeLocation(),        // using location generator
            facebook: { likes: fakeLikes() } // using likes generator
          });
    
          mongo.<collection>.save(doc, callback);
        }


2. Use the new custom fixture in a test file:

        var fix = mongofix.MongoFix({ key: '<uniqueId>', make: 'newCustomFixture', arg1: <arg1>, arg2: <arg2>, arg3: <arg3> });
        fix.reset(function ( ) {
          var createdNewCustomFixtureDoc = fix.get('<uniqueId>');
          createdNewCustomFixtureDoc.arg1.should.equal(<arg1>);
          createdNewCustomFixtureDoc.arg2.should.equal(<arg2>);
          createdNewCustomFixtureDoc.arg3.should.equal(<arg3>);
          should.exist(createdNewCustomFixtureDoc._id);
          should.exist(createdNewCustomFixtureDoc.location.latitude);
          should.exist(createdNewCustomFixtureDoc.location.longitude);
          should.exist(createdNewCustomFixtureDoc.location.tileIndex);
          should.exist(createdNewCustomFixtureDoc.facebook.likes);
        });