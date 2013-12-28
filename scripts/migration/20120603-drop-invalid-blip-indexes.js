#!/usr/local/bin/node
var mongo = require('../../lib/mongo');
var async = require('async');
var done = function done(message,callback) {
  return function doneCallback(error,result) {
    if (error) {
      console.log(error);
    }
    else {
      console.log(message);
    }
    callback(error,result);
  };
}
if (process.argv[2]!=="-f") {
  console.log("This script modifies the Blip collection. ");
  console.log("  * drops index: {author:1,time:-1}");
  console.log("  * drops index: {expires:1}");
  console.log("\nTo perform these actions, run this script with option -f.");
  process.exit();
}
else {
  mongo.initialize(function () {
    async.series(
      [
        function (callback) { mongo.blips.dropIndex({author:1,time:-1},
                                                    done("Dropped {author:1,time:-1} from Blip",callback)); },
        function (callback) { mongo.blips.dropIndex({expires:1},
                                                    done("Dropped {expires:1} from Blip",callback)); } 

      ],
      function () {
        process.exit(); 
      });
  });
}
