exports.name = [ process.env.NAME || 'Load Testing', 'Agent' ].join(' ');

exports.port = process.env.PORT || 3001;

exports.mongo = process.env.MONGO_URL;

exports.target = process.env.LT_TARGET;

// region under test
exports.region = {
  southwest: {
    latitude: +process.env.LT_REGION_SOUTH || 37.707,
    longitude: +process.env.LT_REGION_WEST || -122.52
  },
  northeast: {
    latitude: +process.env.LT_REGION_NORTH || 37.81,
    longitude: +process.env.LT_REGION_EAST || -122.375
  }
}

// number of simulated users
exports.users = +process.env.LT_USERS || 1000;

// number of report location requests per single user per hour
exports.reportLocation = (+process.env.LT_REPORT_LOCATION || 0) / 3600;
