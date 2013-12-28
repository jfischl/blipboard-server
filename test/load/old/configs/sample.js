exports.sequence = [ 1, /*2,*/ 3, /*5,*/ 8, /*13,*/ 21, /*34,*/ 55, /*89,*/ 144 ];
exports.iterate = {
  actions: true,
  received: true,
  broadcasted: true
}

// test name
var name = exports.name = 'SF Simple Behaviour';

// connection string to the mongo db used by the targeted system
exports.mongo = process.env.LOAD_MONGOHQ_URL;

// host, and port of the target
exports.host = 'blipboard-load.herokuapp.com';
exports.port = 80;

// statistics to gather
exports.stats = [ 'latency', 'result-codes' ];

// duration of the test in seconds
exports.duration = 10;

exports.fixtures = {
  users: [name, 'Users'].join(' '),
  places: [name, 'Places'].join(' '),
  tuneins: [name, 'Tuneins'].join(' '),
  blips: [name, 'Blips'].join(' '),
  received: [name, 'Received'].join(' '),
  facebook: [name, 'Facebook'].join(' ')
}

// USER MODEL
// quantity * times >= 3600
exports.users = {
  areFresh: true,
  quantity: 3600,                    // amount of generated users - user range
  receivedBlips: 1,                  // amount of received blips
  behaviour: {
    reportLocation: {
      times: 1,                      // how many times a single user reports location every hour
      locations: [
        {
          latitude: 37.774929,
          longitude: -122.419415,
          latSpan: 0.0001,
          lonSpan: 0.0001
        }
      ]
    }
  }
}

// PLACE MODEL
exports.places = {
  areFresh: true,
  quantity: 100,
  broadcastedBlips: 1,            // amount of broadcasted blips
  locations: [
    {
      latitude: 37.774929,
      longitude: -122.419415,
      latSpan: 0.0001,
      lonSpan: 0.0001
    }
  ],
  behaviour: {
    broadcast: {
      times: 10                    // how many times a single place broadcasts a message every day
    }
  }
}

// INITIAL TUNEIN MODEL
exports.tuneins = {
  areFresh: true,
  users: {
    quantity: 50,                  // how many users each user is tuned into
    distribution: {
      isNormal: true,              // use normal distribution model across user range: default - random
      expectation: null,           // expected position of the most popular user: default - middle of the range
      deviation: null              // number of users containing 50% of tuneins: default - one eighth of the range
    }
  },
  places: {
    quantity: 10,                  // how many places each user is tuned into
    distribution: {
      isNormal: true,              // use normal distribution model across place range: default - random
      expectation: null,           // expected position of the most popular place: default - middle of the range
      deviation: null              // number of places containing 50% of tuneins: default - one eighth of the range
    }
  }
}

// FACEBOOK UPDATES
exports.facebook = {
  places: {
    quantity: 100,                 // how many places facebook should play with
    locations: [
      {
        latitude: 37.774929,
        longitude: -122.419415,
        latSpan: 0.0001,
        lonSpan: 0.0001
      }
    ],
    post: {
      times: 1                     // how many times a day a single place posts messages on facebook
    },
    update: {
      likes: 10                    // how many times a day a single place updates its likes
    }
  }
}
