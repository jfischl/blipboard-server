#!/usr/local/bin/node
var mongo = require('../../lib/mongo');
var async = require('async');

mongo.initialize(function () {
  mongo.receivedBlips.findItems({} , function (error,rblips) {
    console.log("Processing "+rblips.length+" receivedBlips documents");
    if (error) {
      throw error;
    }
    async.map(rblips,
              function(rblip,callback) {
                mongo.blips.findOne({_id:rblip.blip},function (error,blip) {
                  console.log("Processing: "+JSON.stringify(rblip));
                  if (error) {
                    console.log(error);
                  }
                  else {
                    mongo.receivedBlips.update({_id:rblip._id},
                                               {$set:{createdTime:new Date(blip.createdTime),
                                                      expiryTime: new Date(blip.expiryTime),
                                                      isRead: !!rblip.isRead }},
                                               {safe:true,multi:true,upsert:false},
                                               function (e,result) {
                                                 if (error) {
                                                   console.log("Error while updating receivedBlips._id="+rblip._id);
                                                   console.log(JSON.stringify(error));
                                                 }
                                                 else {
                                                   process.stdout.write(result===0 ? "-" : ".");
                                                 }
                                                 callback(e,result);
                                               });
                  }
                });
              },
              function (error,results) {
                if (error) {
                  console.log(JSON.stringify(error));
                }
                else {
                  console.log("\ndone");
                }
                
                process.exit();

              });

  });
});