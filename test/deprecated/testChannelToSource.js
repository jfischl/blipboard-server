/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @author aneil@blipboard.com
 * @fileoverview This will contain unit tests for listenerToChannel one day
 */
var mongo = require('../lib/mongo');
var async = require('async');
var assert = require('assert');
var channels = mongo.channels();
var channelToSource = mongo.channelToSource();

// This tests 
//   * create 3 anonymous users
//   * create listenerToChannel objects for (u1,u2) and (u1,u3)
//   * ensure that listenerToChannel.allChannelIdsForUser(u1.id) retrieves the ids for u2 and u3

async.parallel(
    {
        user1: function (callback) { mongo.channels().createAnonymousUser(callback); },
        user2: function (callback) { mongo.channels().createAnonymousUser(callback); },
        user3: function (callback) { mongo.channels().createAnonymousUser(callback); }
    },
    function (err,users) {
        console.log(users);
        if (!err) {
            async.parallel(
                { u2c1:function(callback) 
                  {
                      channelToSource.create(users.user1._id,users.user2._id,callback); 
                  },
                  u2c2:function(callback) 
                  {
                      channelToSource.create(users.user1._id,users.user3._id,callback); 
                  }
                },
                function (err,results) {
                    //ignore results
                    mongo.channelToSource().allSourceIdsForChannel(users.user1._id,function(err,chids) {
                        console.log("testChannelToSource->async result:"+JSON.stringify({err:err,chids:chids}));
                        assert.deepEqual(chids.sort(),[users.user2._id,users.user3._id].sort());
                        console.log("tests passed successfully");
                        mongo.connect().close();
                });
            });
        }
        else {
            mongo.connect().close();
        }

    }
);

