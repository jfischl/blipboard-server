var assert = require('assert');
var winston = require('winston');
var fs = require('fs');

var config = require('../config');
var js = require('../lib/javascript');
var mongo = require('../lib/mongo');
var definitions = JSON.parse(fs.readFileSync(__dirname + '/../data/topics.json', 'ascii'));
var factualTaxonomy = JSON.parse(fs.readFileSync(__dirname + '/../data/factual_taxonomy.json', 'ascii'));

var categoryTests = [
  {category: "yoga",       topic: "health",   matches: "facebook.categories.name", regex:/\byoga\b/i },
  {category: "food truck", topic: "food",     matches: "facebook.categories.name", regex:/\bfood trucks?\b/i},
  {category: "antiques",   topic: "shopping", matches: "facebook.categories.name", regex:/\bantiques?\b/i} ,
  {category:"art gallery", topic: "culture",  matches: "facebook.categories.name", regex:/\bart gallery\b/i },
  {category:"ice cream",   topic: "food",     matches: "facebook.categories.name", regex:/\bice cream\b/i },
  {category:"jewelry",     topic: "shopping", matches: "facebook.categories.name", regex:/\bjewelry\b/i },
  {category:"landmark",    topic: "culture",  matches: "facebook.categories.name", regex:/\b(landmark)|(historic)\b/i },
  {category:"museum",      topic: "culture",  matches: "facebook.categories.name", regex:/^museum$/i },
  {category:"zoo",         topic: "culture",  matches: "facebook.categories.name", regex:/\bzoo\b/i },
  {category:"aquarium",    topic: "culture",  matches: "facebook.categories.name", regex:/\baquarium\b/i },
  {category:"spa",         topic: "health",   matches: "facebook.categories.name", regex:/\b(spas?)\b/i },
  {category:"beauty salon",topic: "health",   matches: "facebook.categories.name", regex:/\b(salon)\b/i },
  {category:"wine",        topic: "drinks",   matches: "facebook.categories.name", regex:/\bwine\b/i },
  {category:"bar",         topic: "drinks",   matches: "facebook.categories.name", regex:/(bar)|(lounge)|(pub)|(tavern)/i },
  {category:"gay bar",     topic: "drinks",   matches: "facebook.categories.name", regex:/(\bgay bar\b)/i },
  {category:"bicycle shop",topic: "shopping", matches: "facebook.categories.name", regex:/(\bbicycle shop\b)/i },
  {category:"restaurant",  topic: "food",     matches: "facebook.categories.name", regex:/(deli)|(restaurant)|(steak house)|(steakhouse)|(food)/i },
  {category:"bakery",      topic: "food",     matches: "facebook.categories.name", regex:/bakery/i },
  {category:"restaurant",  topic: "food",     matches: "facebook.categories.name", regex:/\bcandy\b/i },
  {category:"beer garden", topic: "drinks",   matches: "facebook.categories.name", regex:/\bbeer garden\b/i },
  {category:"beer",        topic: "drinks",   matches: "facebook.categories.name", regex:/\b(beer)|(brewery)|(pub)\b/i },
  {category:"coffee",      topic: "coffee",   matches: "facebook.categories.name", regex:/\b(coffee shop)|(cafe)\b/i },
  {category:"tea",         topic: "coffee",   matches: "name", regex:/\btea\b/i },
  {category:"park",        topic: "nature",   matches: "facebook.categories.name", regex:/\b(park)|(playground)\b/i },
  {category:"dance club",  topic: "nightlife",matches: "facebook.categories.name", regex:/^(night club)|(dance club)$/i },
  {category:"movie theater",topic: "entertainment", matches: "facebook.categories.name", regex:/^movie theat(er|re)$/i },
  {category:"tours",       topic: "culture",  matches: "facebook.categories.name", regex:/tours\/sightseeing/i },
  {category:"movie theater",topic:"entertainment",  matches: "facebook.categories.name", regex:/^movie theater$/i },
  {category:"performance venue", topic: "music",    matches: "facebook.categories.name", regex:/(performance venue)|(theat(er|re))|(comedy club)/i },
  {category:"music venue", topic: "music",    matches: "facebook.categories.name", regex:/(music venue)|(concert venue)/i },
  {category:"restaurant",  topic: "food",     matches: "facebook.categories.name", regex:/\b(restaurant)|(pizza)\b/i },
  {category:"antiques",    topic: "shopping", matches: "name", regex:/\bantiques?\b/i },
  {category:"shopping",    topic: "shopping", matches: "facebook.categories.name", regex:/\bgrocery\b/i },
  {category:"shopping",    topic: "shopping", matches: "facebook.categories.name", regex:/\b(retail)|(shopping)|(clothing)|(book)|(hardware)|(toy)|(home decor)|(shoe store)\b/i },
  {category:"gym",         topic: "health",   matches: "facebook.categories.name", regex:/^(fitness center)|(gym)$/i },
  {category:"gym",         topic: "health",   matches: "name", regex:/\bgym\b/i },
  {category:"restaurant",  topic: "food",     matches: "name", regex:/\brestaurant\b/i },
  {category:"sports",      topic: "sports",   matches: "facebook.categories.name", regex:/^(sports\/recreation\/activities)|(sports \& recreation)|(sports venue)|(sports bar)|(golf course)$/i },
  {category:"bar",         topic: "drinks",   matches: "name", regex:/\b((bar)|(cocktail)|(tavern)|(pub))\b/i },
  {category:"wine",        topic: "drinks",   matches: "name", regex:/\bwine\b/i },
  {category:"yoga",        topic: "health",   matches: "name", regex:/\byoga\b/i },
  {category:"museum",      topic: "culture",  matches: "name", regex:/\bmuseum\b/i },
  {category:"art gallery", topic: "culture",  matches: "name", regex:/\bart gallery\b/i },
  {category:"bakery",      topic: "food",     matches: "facebook.categories.name", regex:/\bbakery\b/i },
  {category:"dance club",  topic: "nightlife",matches: "facebook.categories.name", regex:/^club$/i } ,
  {category:"startup",     topic: "culture", matches: "facebook.categories.name", regex:/\bstartup\b/i },
  {category:"neighborhood",topic: "shopping", matches: "facebook.categories.name", regex:/^neighborhood$/i },
  {category:"transit stop",topic: "nature",   matches: "facebook.categories.name", regex:/^transit stop$/i },
  {category:"hotel",       topic: "drinks",   matches: "facebook.categories.name", regex:/^hotel$/i} 
];

var badMatch = { category: "bad category", topic: "food"};

// cache the topics - call loadTopicIds to load them
var topics = [];

var findTopicId = function findTopicId(test) 
{
  for (var i=0; i<topics.length; i++) { 
    if (topics[i].identifier === test.topic) { 
      test.topicId = topics[i]._id;
      return;
    }
  }
}

// load in the topic ids
// note: this needs to be done anytime the definitions are reloaded or at app start
var loadTopicIds = exports.loadTopicIds = function loadTopicIds(callback) 
{
  assert(callback);
  mongo.topics.find({}).toArray(function(error, records) { 
    if (error) { 
      winston.info("Couldn't load topics from db " + js.pp(error)); 
      callback(error);
    }
    else {
      topics = records;
      findTopicId(badMatch);
      categoryTests.forEach(function (test) { 
        findTopicId(test); 
      });

      for (var key in factualTaxonomy) { 
        findTopicId(factualTaxonomy[key]);
        if (factualTaxonomy[key].topic) { 
          //winston.debug(key + ": " + factualTaxonomy[key].topic + " -> " + factualTaxonomy[key].topicId);
        }
      }
      callback();
      //winston.debug("tests: " + js.pp(categoryTests));
    }
  });
};

exports.lookupTopicByName = function lookupTopicByName(name) 
{
  for (var i=0; i<topics.length; i++) { 
    if (topics[i].identifier === name) { 
      return topics[i];
    }
  }
  return undefined;
};

exports.lookupFactual = function lookupFactual(factual) 
{
  assert(factual);
  assert(factual.factual_id);
  assert(factual.category_ids.length > 0);

  var fid = factual.factual_id;
  var cid = factual.category_ids[0];
  assert(cid);
  
  if (factualTaxonomy[fid]) { 
    var category = factualTaxonomy[fid];
    if (category && category.topicId && category.topic) { 
      return {topic: category.topic, topicId: category.topicId };
    }
    else {
      return badMatch;
    }
  }
  else {
    return badMatch;
  }
};

exports.matchPlaceCategory = function matchPlaceCategory(place)
{ 
  //assert(categoryTests[0].topicId);
    
  for (var i=0; i<categoryTests.length; i++) { 
    var line = categoryTests[i];
    if (line.matches === 'facebook.categories.name' && place.facebook && place.facebook.categories) {
      for (var j=0; j<place.facebook.categories.length; j++) { 
        var category = place.facebook.categories[j];
        if (category.name.match(line.regex)) { 
          return line;
        }
      }
    }
    else if (line.matches === 'name' && place.name) {
      if (place.name.match(line.regex)) {
        return line;
      }
    }
  }
  return badMatch;
}

var blackCats = js.pathValue(config, ['BLACKLIST', 'place', 'facebook.categories.name']);
var blackIds = js.pathValue(config, ['BLACKLIST', 'place', 'facebook.id']);

if ( typeof blackCats !== 'object' ) blackCats = { }
if ( !(blackCats.regex instanceof Array) ) blackCats.regex = [ ];
if ( typeof blackCats.values !== 'object' ) blackCats.regex = { }

if ( typeof blackIds !== 'object' ) blackIds = { }
if ( !(blackIds.regex instanceof Array) ) blackIds.regex = [ ];
if ( typeof blackIds.values != 'object' ) blackIds.regex = { }

exports.isBlacklisted = function isBlacklisted ( place ) {
  if ( place.category == 'bad category' ) return true;
  var id = js.pathValue(place, ['facebook', 'id']);
  if ( blackIds.values[id] != undefined ) return true;
  return false;
};

