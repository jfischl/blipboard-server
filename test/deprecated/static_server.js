// example url: http://localhost:3000/channels/search?latitude=37.7603&longitude=-122.4346
// This file is for testing client RestKit responses.

/*jslint sloppy:true */

var config = require("../config");
var express = require('express');

var app = express.createServer(express.logger());

app.get('/channels/search', function (request, response) {
        response.send(
                      {data:
                          {channels:[
                              {_id:'aZ1298q2187Mn',
                              name: "Memphis Minnies", // name to be displayed when showing channel 

                              // additional data for all channels:
                              type: "place", // type of channel {user|place|topic}
		              picture: "https://fbcdn-profile-a.akamaihd.net/hprofile-ak-snc4/372962_174163792898_1367637060_q.jpg", // url of picture representing the channel

		              // data stored for user channels:
		              facebook_id: "174163792898", // facebook id of the user
                	      // facebook_access_token:  null,  // not present for auto-loaded FB place
                	      // password:           string, // hash of password in form "{hash-string}${salt}${hash-method}"
                	      // email:          string, // optional email
                	      // first_name:         string // is firstname/lastname culturally neutral?
                	      // last_name:      string // " " " 

                	      // data stored for place channels:
                	      location: {
		              "street": "576 Haight St.",
		              "city": "San Francisco",
		              "state": "CA",
		              "country": "United States",
		              "zip": "94117",
		              "latitude": 37.772026042807,
		              "longitude": -122.43166999682
		              },

		              category:       "Restaurant/cafe" // business category?
		              }]
                          }
                      });
});

app.listen(config.SERVER.port, function() { console.log("Listening on " + config.SERVER.port); });


