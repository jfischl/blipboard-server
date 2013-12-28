/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview facebook functions 
 * @author jason@blipboard.com
*/
var assert = require('assert');
var async = require('async');
var http = require('http');
var qs = require('querystring');
var limitfn = require('function-rate-limit');
var restler = require('restler');
var sprintf = require('sprintf').sprintf;
var winston = require('winston');

var developer = require('../config').FACEBOOK.developer;
var graphite = require('./graphite');
var js = require('./javascript');
var BBError = require('./error').BBError;

/*
 *   Added getAccessToken - given Facebook Client Id and Secret, returns the access token for the Client
 */
function getAccessToken(client_id,client_secret,callback) {
  var params = { 'client_id':client_id,
                 'client_secret':client_secret,
                 'grant_type':'client_credentials'};
  //winston.log('info', "facebook.getAccessToken: " + 'https://graph.facebook.com/oauth/access_token' + "?" + (params ? decodeURIComponent(qs.stringify(params)) : ''));
  var request = restler.get('https://graph.facebook.com/oauth/access_token', { query:params });
  
  request.once('fail', function(failure, response) {
    winston.log('info',"facebook.getAccessToken: can't retrieve access_token from facebook: " + failure);
    callback(BBError.facebookError({message: "Can't retrieve access_token from facebook", cause: failure}));
  });

  request.once('error', function(err, response) { 
    winston.log('info','facebook.getAccessToken: error retrieving access_token from facebook ' + err.message);
    callback(BBError.facebookError({message: 'Error retrieving access_token from facebook', cause: err}));
  });
  
  request.once('success', function(data, response) {
    //winston.log('info',"access_token=" + qs.parse(data).access_token);
    callback(null, qs.parse(data).access_token);
  });
}

// use this as a cache of the access token 
var accessToken = null;

var loadDeveloperAccessToken = exports.loadDeveloperAccessToken = function loadDeveloperAccessToken(callback) { 
  getAccessToken(developer.id, developer.secret, function(error, token) {
    if (token) {  // cache and use it
      accessToken = token;
      winston.info("facebook: developer access_token=" + accessToken);
      callback();
    }
    else { // request failed
      winston.error("facebook: couldn't get initial developer access token " + js.pp(error));
      callback(error);
    }
  });
};

var limitedGet = limitfn(600, 600000, function get(uri, params, result, callback) {
  var limit = params.limit ? params.limit : 2500; // !jcf! note: limit the results from fb
  var useDeveloperToken = params.access_token ? false : true;
  var debugRequest = uri + "?" + (params ? decodeURIComponent(qs.stringify(params.query)) : '');
  winston.log ("info", "facebook.get: " + debugRequest);
  
  params.parser = restler.parsers.json;
  
  var start = new Date();
  var request = restler.get(uri, params);

  function stats(metric) { 
    var duration = new Date() - start;
    graphite.set(metric + ".ms", duration);
  }
  
  request.once('fail', function(failure, response) {
    stats("facebook.api.fail");
    winston.info('facebook.get failed: ' + response.statusCode + ' ' + debugRequest +" -->  " + js.pp(failure));
    //winston.debug("response=" + response.raw);
    if (result.length > 0) { 
      winston.log('info', "facebook.get: retrieved " + result.length + " results so far");
      callback(null, result); // return results so far
    }
    else {
      callback(BBError.facebookError({message: "Failure with facebook graph API", cause: failure }));
    }
  });

  request.once('error', function(err, response) { 
    stats("facebook.api.error");
    winston.info('facebook.get error on request ' + debugRequest + ' --> ' + js.pp(err));
    //winston.debug("response=" + response.raw);
    if (result.length > 0) { 
      winston.info("facebook.get: retrieved " + result.length + " objects so far");
      callback(null, result); // return results so far
    }
    else {
      callback(BBError.facebookError({message: 'Error retrieving data from facebook', cause: err}));
    }
  });
  
  request.once('success', function(body, response) {
    if (body && body.error_code) { 
      stats("facebook.api.fail");
      winston.info(sprintf("facebook.get: graph API call failed (%d): %s error: %s(code=%d)", response.statusCode, debugRequest, body.error_msg, body.error_code));
      return callback(BBError.facebookError({message: "facebook FQL API failed", cause: response }));
    }

    stats("facebook.api.success");
    
    //var body = JSON.parse(data);
    result = result.concat(body.data);
    //winston.log('info',"200 OK: response " + body.data.length + " / " + result.length + " limit: " + limit);
    if (result.length < limit && body.paging && body.paging.next) {
      var split = body.paging.next.split('?');
      var next = split[0];
      var nextParams = qs.parse(split[1]);
      if (params.query.since) { 
        nextParams.since = params.query.since;
      }
      limitedGet(next, { limit: limit, query: nextParams }, result, callback);
    }
    else {
      callback(null, result);
    }
  });
});

// access_token can be passed in to params or alternatively, it will
// retrieve the developer access_token and cache it if one is not
// provided.
var get = function get(path, params, callback) {
  assert(callback);

  if (!params.access_token) { 
    params.access_token = accessToken;
    limitedGet('https://graph.facebook.com' + path, { limit: params.limit, query: params }, [ ], callback);
  }
  else {
    limitedGet('https://graph.facebook.com' + path, { limit: params.limit, query: params }, [], callback);
  }
};

var limitedFql = limitfn(600, 600000, function run(uri, callback) { 
  winston.debug("facebook.fql: " + uri);
  callback(restler.get(encodeURI(uri), {parser: restler.parsers.json}));
});

var fql = function fql(uri, callback) {
  var offset=0,limit=25,nitems=0,results=[];
  async.doWhilst(
    function doRequest(callback) { 
      var limitedUri = sprintf("https://api.facebook.com/method/fql.query?format=json&access_token=%s&query=%s LIMIT %d OFFSET %d", 
                               accessToken, uri, limit, offset);
      limitedFql(limitedUri, function(request) { 
        assert(request);
        var start = new Date();
 
        function stats(metric) { 
          var duration = new Date() - start;
          graphite.set(metric + ".ms", duration);
        }
        
        request.once("complete", function (result, response) { 
          if (result instanceof Error) { 
            winston.info("facebook.fql: error on FQL API call: " + limitedUri);
            winston.debug("facebook.fql: raw-response: " + response.raw);
            stats("facebook.api.error");
            callback(BBError.facebookError({message: "facebook FQL API error", cause: result }));
          }
          else {
            if (response.statusCode >= 400) {
              winston.info(sprintf("facebook.fql: FQL API call failed (%d): %s", response.statusCode, limitedUri));
              winston.debug("facebook.fql: raw-response: " + response.raw);
              stats("facebook.api.fail");
              callback(BBError.facebookError({message: "facebook FQL API failed", cause: result }));
            }
            else if (result && result.error_code) { 
              winston.info(sprintf("facebook.fql: FQL API call failed (%d): %s error: %s(code=%d)", 
                                   response.statusCode, limitedUri, result.error_msg, result.error_code));
              stats("facebook.api.fail");
              callback(BBError.facebookError({message: "facebook FQL API failed", cause: result }));
            }
            else {
              assert (response.statusCode / 100 === 2);
              assert(result);
              nitems = result.length; 
              offset += limit;
              results = results.concat(result);
              //winston.debug(sprintf("facebook.fql: success: %s %d/%d", response.statusCode, nitems, results.length));
              stats("facebook.api.success");
              callback(); 
            }
          }
        });
      });
    },
    function test() {
      return nitems === limit; 
    },
    function onDone(err) {
      if (err) {
        callback(err);
      } 
      else {
        callback(null, results);
      }
    });
};

exports.getSourcePhoto = function getSourcePhoto(objectId, callback) { 
  assert(callback);
  //http://graph.facebook.com/object_id?fields=source,height,width

  // !jcf! it isn't necessary to provide a developer access_token but this seems to be rate limited otherwise. 
  getDocument("/" + objectId, { 'access_token': accessToken, 
                                'fields': 'source,height,width' }, 
              callback);
};

exports.getPlaces = function getPlaces ( latitude, longitude, distance, callback ) {
  //winston.debug("facebook.getPlaces: " + latitude + "," + longitude);
  var query = sprintf('SELECT checkins,name,location,talking_about_count,description,website,phone,categories,page_id FROM page WHERE page_id IN (SELECT page_id FROM place WHERE distance(latitude,longitude,\"%f\", \"%f\") < %d)',
                      latitude, longitude, distance);
  fql(query, callback);
};

exports.getPlace = function getPlace ( fbid, callback ) { 
  winston.debug("facebook.getPlace: " + fbid);
  var query = sprintf('SELECT checkins,name,location,talking_about_count,description,website,phone,categories,page_id FROM page WHERE page_id=%s',
                      fbid);
  fql(query, callback);
};

exports.getPosts = function getPosts(facebookId, lastRefreshTime, callback) {
  winston.debug("facebook.getPosts: " + facebookId + " since " + lastRefreshTime);
  //https://developers.facebook.com/docs/reference/api/post/
  var since = lastRefreshTime ? Math.round(lastRefreshTime.getTime()/1000) : '-30day';
  get("/" + facebookId + "/posts", { 'fields': 'id,object_id,message,picture,story,link,type,created_time',
                                     'since': since,
                                     'limit': '5',
                                     'type': 'status'
                                   }, 
      function onReceivedPosts(error, posts) { 
        if (error) { 
          callback(error); 
        }
        else {
          async.map(posts, retrievePhotos, function onReceivedPhotos(err, postsWithPhotos) {
            //winston.debug("with sources: " + js.pp(postsWithPhotos));
            callback(null, postsWithPhotos);
          });
        }
      });

  function retrievePhotos(post, callback) { 
    switch (post.type) { 
    case 'photo': 
      exports.getSourcePhoto(post.object_id, function onReceivedPhoto(error, result) { 
        if (!error && result && result.source) {
          assert(!error);
          post.source = result.source;
          post.sourceWidth = result.width;
          post.sourceHeight = result.height;
        }
        assert(callback);
        callback(null, post);
      });
      break;
      
    case 'link':
      callback(null, post);
      break;
      
    default: 
      callback(null, post);
      break;
    }
  }
};

var getDocument = function getDocument(path, params, callback) { 
  var uri = 'https://graph.facebook.com' + path;
  var debugRequest = uri + "?" + decodeURIComponent(qs.stringify(params));
  winston.log ("info", "facebook.getDocument: " + debugRequest);

  var start = new Date();
  var request = restler.get(uri, { query: params, parser: restler.parsers.json });
 
  function stats(metric) { 
    var duration = new Date() - start;
    graphite.set(metric + ".ms", duration);
  }
  
  request.once('fail', function(failure, response) {
    stats("facebook.api.fail");
    winston.info("facebook.getDocument: " + debugRequest + ' fail: ' + js.pp(failure));
    callback(BBError.facebookError({message: "Failed to retrieve document from facebook", cause: failure }));
  });
  
  request.once('error', function(err, response) { 
    stats("facebook.api.error");
    winston.info("facebook.getDocument: " + debugRequest + ' error: ' + js.pp(err));
    callback(BBError.facebookError({message: 'Error retrieving document from facebook', cause: err}));
  });

  request.once('abort', function onAborted ( ) {
    stats("facebook.api.abort");
    winston.info('facebook.getDocument: abort');
    callback(BBError.facebookError({ message: 'Request to facebook has been aborted' }));
  });
    
  request.once('success', function(data, response) {
    stats("facebook.api.success");
    callback(null, data); //JSON.parse(data));
  });
};

exports.getMe = function getMe(accessToken, callback) {
  if (!accessToken) {
    return callback(BBError.missingParameter("accessToken"));
  }
  var begin = new Date();
  getDocument("/me", { 'access_token': accessToken, 
                       'fields': 'id,email,location,name,first_name,last_name' 
                     },
              function onDone ( error, result ) {
                callback(error, result);
              });
};

exports.getMySocialNetwork = function getMySocialNetwork ( accessToken, callback ) {
  var network = [ ];

  var getFriends = function getFriends ( callback ) {
    var expandNetwork = function expandNetwork ( error, subnet ) {
      if ( subnet && subnet.data ) {
        winston.log('info', subnet.data.length + ' friends');
        for ( var i = 0; i < subnet.data.length; i++ ) network.push(subnet.data[i].id);
      }

      if ( subnet && subnet.paging && subnet.paging.next ) {
        var request = restler.get(subnet.paging.next, { parser: restler.parsers.json });
        var ignore = function ignore ( ) { callback ( ) }

        request.once('fail', ignore);
        request.once('error', ignore);
        request.once('abort', ignore);

        request.once('success', function proceed ( data ) { expandNetwork(null, data) });
      }
      else callback(error);
    }

    getDocument("/me/friends", { 'access_token': accessToken, 'fields': 'id' }, expandNetwork);
  }

  var getPlaces = function getPlaces ( callback ) {
    var expandNetwork = function expandNetwork ( error, subnet ) {
      if ( subnet && subnet.data ) {
        winston.log('info', subnet.data.length + ' places');
        for ( var i = 0; i < subnet.data.length; i++ ) network.push(subnet.data[i].id);
      }

      if ( subnet && subnet.paging && subnet.paging.next ) {
        var request = restler.get(subnet.paging.next, { parser: restler.parsers.json });
        var ignore = function ignore ( ) { callback ( ) }

        request.once('fail', ignore);
        request.once('error', ignore);
        request.once('abort', ignore);

        request.once('success', function proceed ( data ) { expandNetwork(null, data) });
      }
      else callback(error);
    }

    getDocument("/me/likes", { 'access_token': accessToken, 'fields': 'id' }, expandNetwork);
  }

  var finalCallback = function finalCallback ( error ) {
    callback(error, network);
  }

  async.parallel([ getFriends, getPlaces ], finalCallback);
}
