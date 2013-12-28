#!/usr/local/bin/node
var mongo = require('../../lib/mongo');
mongo.initialize(function () {
  mongo.blips.findItems(function (error,blips) {
    blips.forEach(function (blip) {
      if (blip) {
        var expiryTime = blip.expiry || blip.expiryTime || new Date();
        blip.expiryTime = new Date(expiryTime);
        blip.createdTime = new Date(blip.createdTime);
        mongo.blips.update({_id:blip._id},blip,function() {});
        process.stdout.write(".");
      }
    });
    console.log("\ndone");
    process.exit();
  });
});