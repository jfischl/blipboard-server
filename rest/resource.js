/**
 * @fileoverview Manages RESTful resource documents
 * @author aneil@blipboard.com
 */

/**
 * converts a manager-provided document (usually the second argument of a manager function's callback)
 * to a resource representation (by stripping out the _ fields, and converting _id to id)
 *
 */

var assert = require('assert');
var moment = require('moment');
var sprintf = require('sprintf').sprintf;
var winston = require('winston');
var URI = require('URIjs');

var capabilities = require('../config').CAPABILITIES;
var channelType = require('../config').MONGO.channelType;
var className = require('../lib/javascript').className;
var classOf = require('../lib/javascript').classOf;
var highlightPeriod = require('../config').HIGHLIGHT.period;
var js = require('../lib/javascript');
var webUrl = require('../config').SERVER.web;
var ObjectID = require('../lib/mongo').ObjectID;


function picture(request, pictureUrl) { 
  var version = request.clientVersion;
  if (version === "1.0.1" || version === "1.0.2" || version === undefined) { 
    return pictureUrl;
  }
  else {
    var uri = URI(pictureUrl);
    uri.query("type=normal");
    return uri.toString();
  }
}

function userDocumentToAccount(request, document) {
  assert(document);
  assert(document._id);
  if (!document.stats) { 
    document.stats = { score: 0, 
                       blips: 0, 
                       followers: 0, 
                       following: 0};
  }

  var isDeveloper = false;
  if (request.user && request.user.isDeveloper) { 
    winston.debug("Enabling sharing for developer account");
    isDeveloper = true;
  }
  return { id: document._id.toString(), 
           name: document.name, 
           description: document.description,
           picture: picture(request, document.picture), 
           email: document.email, 
           listenersCount: document.stats.followers || 0,  // DEPRECATED
           score: document.stats.score || 0, // DEPRECATED
           capabilities: { 
             disableSharing: request.clientBuild < capabilities.disableSharingBelowClientBuildNumber, // disables sharing for older builds
             disableStartupNotifications: capabilities.disableStartupNotifications
           },
           stats: {
             score: document.stats.score || 0,
             blips: document.stats.blips || 0,
             followers: document.stats.followers || 0,
             following: document.stats.following || 0
           },
           facebookId : (document.facebook ? document.facebook.id : undefined)
         };
}

function addressToResource(request, document) { 
  return { latitude: document.latitude,
           longitude: document.longitude,
           street: document.street,
           city: document.city,
           state: document.state,
           zip: document.zip,
           country: document.country };
} 

function addressToBriefResource(request, document) { 
  return { latitude: document.latitude,
           longitude: document.longitude, 
           street: document.street };
} 

function locationToResource(request, document) {
  return { latitude: document.latitude,
           longitude: document.longitude };
}

function baseChannelToResource(request, document) { 
  assert(document);
  assert.ok(className(document._id) === 'ObjectID');
  if (!document.stats) { 
    document.stats = { score: 0, 
                       blips: 0, 
                       followers: 0, 
                       following: 0};
  }

  return { id: document._id.toString(),
           name: document.name,
           description: document.description,
           type: document.type,
           picture: picture(request, document.picture),
           isListening: document.isListening,
           listenersCount: js.pathValue(document, ['stats', 'followers']), // DEPRECATED
           score: js.pathValue(document, ['stats', 'score']), // DEPRECATED
           stats: {
             score: document.stats.score || 0,
             blips: document.stats.blips || 0,
             followers: document.stats.followers || 0,
             following: document.stats.following || 0
           }
         };
}

function baseChannelToBriefResource(request, document) { 
  assert(document);
  assert.ok(className(document._id) === 'ObjectID');

  if (!document.stats) { 
    document.stats = { score: 0, 
                       blips: 0, 
                       followers: 0, 
                       following: 0};
  }

  return { id: document._id.toString(),
           name: document.name,
           type: document.type,
           picture: picture(request, document.picture),
           isListening: document.isListening,
           listenersCount: js.pathValue(document, ['stats', 'followers']), // DEPRECATED
           score: js.pathValue(document, ['stats', 'score']), // DEPRECATED
           stats: {
             score: document.stats.score || 0,
             blips: document.stats.blips || 0,
             followers: document.stats.followers || 0,
             following: document.stats.following || 0
           }
         };
}
 
function channelToResource(request, document) {
  var resource = baseChannelToResource(request, document);
  if (document.type === channelType.place) {
    resource.location = addressToResource(request, document.location);
    resource.category = document.category;
    if (document.defaultTopic) { 
      resource.defaultTopic = topicToResource(request, document.defaultTopic);
    }
    resource.website = document.website;
    resource.phone = document.phone;
  }
  else if (document.type === channelType.user) { 
    resource.name = document.displayName;
  }
  return resource;
}

function channelToBriefResource(request, document) {
  var resource = baseChannelToBriefResource(request, document);
  if (document.type === channelType.place) {
    resource.location = addressToBriefResource(request, document.location);
    resource.category = document.category;
    if (document.facebook)  {
      resource.facebook = {
        id: document.facebook.id
      };
    }
    resource.website = document.website;
    resource.phone = document.phone;
  }
  else if (document.type === channelType.user) { 
    resource.name = document.displayName;
  }
  return resource;
}

function likerToResource(request, document) { 
  return { 
    id: document.id.toString(),
    name: document.name,
    createdTime: document.createdTime
  };
}

function likesToResource(request, document) {
  function isMe(liker) {
    return liker.id.equals(request.user._id);
  }

  var result = {isLiker: false,
                likers: [],
                likeCount: 0 };
  if (document) { 
    result.isLiker = request.user._id && document.some(isMe);
    result.likers = document.map(likerToResource.curry(request));
    result.likeCount = document.length;
  }
    
  return result;
}
function commentToResource(request, comment) {
  return { id: comment.id,
           author: channelToBriefResource(request, comment.author),
           text:comment.text,
           createdTime:comment.createdTime };
}

function blipToResource(request, document) {
  var comments = (document.comments || []).map(commentToResource.curry(request)), diff, blip;

  blip = { id: document._id.toString(),
           author: channelToBriefResource(request, document.author),
           place: channelToBriefResource(request, document.place),
           message: document.message,
           createdTime: document.createdTime,
           expiryTime: document.expiryTime,
           effectiveDate: document.effectiveDate,
           likes: likesToResource(request, document.likes),
           popularity: document.popularity, 
           isRead: document.isRead,
           comments: comments
         };

  if (webUrl) { 
    var link = webUrl.clone();
    link.path(sprintf("/%s", blip.author.id));
    link.query(URI.buildQuery({blip: blip.id}));
    blip.link = link.toString();
  }

  if (document.topics) { 
    blip.topics = document.topics.map(topicToResource.curry(request));
  }

  if (document.facebook) {
    blip.photo = document.facebook.picture;
    blip.sourcePhoto = document.facebook.source;
    blip.sourceWidth = document.facebook.sourceWidth;
    blip.sourceHeight = document.facebook.sourceHeight;

    blip.facebook = { created_time: document.createdTime,
                      objectId: document.facebook.objectId,
                      likeCount: document.facebook.likeCount,
                      commentCount: document.facebook.commentCount
                    }; 
  }

  return blip;
}

var notificationToResource = function notificationToResource(request, document) 
{
  assert(document._id);
  assert(document.userId);

  var notification = {
    id: document._id.toString(),
    isNew: document.isNew,

    userId: document.userId.toString(),
    time: document.time,
    type: document.type,
    title: document.title,
    subtitle: document.subtitle,
    picture: document.picture,
    url: document.url
  };

  if (document.channelId) {
    notification.channelId = document.channelId.toString();
  }

  if (document.placeId) {
    notification.placeId = document.placeId.toString();
  }

  if (document.listenerId) {
    assert.ok(className(document.listenerId) === 'ObjectID');
    notification.listenerId = document.listenerId.toString();
  }

  if (document.likerId) { 
    notification.likerId = document.likerId.toString();
  }

  if (document.blipId) { 
    notification.blipId = document.blipId.toString();
  }

  if (document.commentId) { 
    notification.commentId = document.commentId.toString(); 
  }

  return notification;
};

var topicToResource = function topicToResource(request, document) 
{
  var topic = {
    id: document._id.toString(),
    parentId: document.parentId ? document.parentId.toString() : undefined,
    name: document.name,
    description: document.description,
    picture: document.picture,
    picture2x: document.picture2x
  };
  
  return topic;
};

// e.g. arrayToDictionary(notifications, 'blips', blips);
// assumes each entry in the array has a unique key 'id'
var arrayToDictionary = function arrayToDictionary(document, key, array) 
{ 
  // convert from result.channels array to dictionary
  array.forEach(function (item) { 
    js.setPathValue(document, [key, item.id], item);
  });
};

var topicIdsFromResource = function topicIdsFromResource(resource) 
{
  var topicIds = [];
  if (resource) { 
    if (classOf(resource) !== Array) { 
      topicIds = [resource];
    }
    else { 
      topicIds = resource;
    }
  }
  return topicIds.map(ObjectID);
};

exports.userDocumentToAccount = userDocumentToAccount;
exports.channelToResource = channelToResource;
exports.likesToResource = likesToResource;
exports.blipToResource = blipToResource;
exports.locationToResource = locationToResource;
exports.addressToResource = addressToResource;
exports.commentToResource = commentToResource;
exports.notificationToResource = notificationToResource;
exports.topicToResource = topicToResource;
exports.arrayToDictionary = arrayToDictionary;
exports.topicIdsFromResource = topicIdsFromResource;
