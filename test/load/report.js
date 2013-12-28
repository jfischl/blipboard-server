var fs = require('fs');

var Report = exports.Report = function Report ( name ) {
  console.log( 'new Report' );

  this.name = name;

  this.buffer = 3600;

  this.origin = Math.floor(new Date().getTime() / 1000);

  this.latencies = [ ];

//  this.latency = {
//    reportLocation: {
//      min: Infinity, max: -Infinity,
//      count: 0, total: 0, average: 0,
//      values: [ ]
//    },
//    getPopular: {
//      min: Infinity, max: -Infinity,
//      count: 0, total: 0, average: 0,
//      values: [ ]
//    }
//  }

  this.latency = { time: this.origin }
}

Report.prototype.toJSON = function toJSON ( ) {
  var latency = { }

  for ( var i = 0; i < this.latencies.length; i++ ) {
    var current = this.latencies[i];

    for ( var key in current ) {
      if ( current[key] instanceof Object ) {
        if ( !latency[key] ) {
          latency[key] = {
            min: Infinity, max: -Infinity,
            count: 0, total: 0, average: 0
          }
        }

        latency[key].total += current[key].total;
        latency[key].count += current[key].count;

        latency[key].average = Math.round(latency[key].total / latency[key].count);

        latency[key].min = Math.min(latency[key].min, current[key].min);
        latency[key].max = Math.max(latency[key].max, current[key].max);
      }
    }
  }

  var json = { latency: latency, latencies: this.latencies, origin: this.origin }

  return JSON.stringify(json);
}

Report.prototype.toHTML = function ( ) {
  var template = fs.readFileSync(__dirname + '/templates/report.html').toString();

  var html = template.replace('$TITLE', this.name);

  return html;
}

Report.prototype.update = function update ( ) {
  var time = Math.floor(new Date().getTime() / 1000);

  if ( time > this.latency.time ) {
    this.latencies.push(this.latency);

    for ( var t = this.latency.time + 1; t < time; t++ ) {
      this.latencies.push({ time: t });
    }

    this.latency = { time: time }
  }

  while ( this.latencies.length > this.buffer ) {
    this.latencies.shift();
  }
}

Report.prototype.stats = function stats ( request, user, latency, data, response ) {
  this.update();

  if ( !this.latency[request.name] ) {
    this.latency[request.name] = {
      min: Infinity, max: -Infinity,
      total: 0, count: 0, average: 0,
    }
  }

  var current = this.latency[request.name];

  current.total += latency;
  current.count += 1;
  current.average = Math.round(current.total / current.count);

  current.min = Math.min(current.min, latency);
  current.max = Math.max(current.max, latency);
}
