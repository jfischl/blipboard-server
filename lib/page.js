/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview Class for automated page generation
 * @author vladimir@blipboard.com
 *
 * @created Tue, Apr 10 2012 - 12:53:56 -0700
 * @updated Tue, Apr 10 2012 - 17:40:03 -0700
 */

var mongoskin = require('mongoskin');
var winston = require('winston');
var pagingConfig = require('../config').PAGING;
var ObjectID = (new mongoskin.SkinDb('')).ObjectID;
var js = require('../lib/javascript');

/**
 * @desc Page constructor
 * @param {string}
 * @param {array<name, order, isObjectID>} indexes for ordering records
 * @param {string} start values for the indexed fields
 * @param {string} end values
 * @param {number} maximum amount of elements
 */
var Page = function Page (uri, index, since, until, limit, hasPrev, hasNext) {
  if ( !(this instanceof Page) ) {
    return new Page(index, since, until, limit, hasPrev, hasNext);
  }
  
  this.uri = uri || 'http://localhost:3000';
  this.uri += this.uri.indexOf('?') == -1 ? '?' : '&';

  this.hasPrev = hasPrev;
  this.hasNext = hasNext;

  this.index = index || [ ];

  this.since = since == null || since == '' ? [ ] : since.split('|');
  this.until = until == null || until == '' ? [ ] : until.split('|');

  for (var i in this.index) {
    var type = this.index[i].type;
    switch ( typeof type ) {
      case 'string': {
        switch ( type ) {
          case 'objectID': {
            if ( i in this.since ) {
              this.since[i] = ObjectID(this.since[i]);
            }
            if ( i in this.until ) {
              this.until[i] = ObjectID(this.until[i]);
            }
          } break; // objectID
          default: break;
        } // switch type
      } break;
      case 'function': {
        if ( i in this.since ) {
          this.since[i] = type(this.since[i]);
        }
        if ( i in this.until ) {
          this.until[i] = type(this.until[i]);
        }
      } break;
      default: break;
    } // switch typeof type
  }

  this.limit = typeof limit == 'number' && limit > 0 ? limit : pagingConfig.limit;
  this.limit = this.limit > pagingConfig.maxLimit ? pagingConfig.maxLimit : this.limit;

  this.order = this.since.length > 0 || this.until.length == 0 ? 1 : -1;
}

/**
 * @desc Retrieve records from a collection
 * @param {MongoDBCollection}
 * @param {object}
 * @param {object} 
 * @param {function(error, data)}
 */
Page.prototype.retrieve = function retrieve ( collection, selector, options, callback ) {
  var self = this;
  
  var pageSelector = self.selector();
  var sel = selector != null && pageSelector != null ? { $and: [ selector, pageSelector ] } : selector || pageSelector;

  var moptions = { }
  for (var k in options) { moptions[k] = options[k]; }
  var poptions = self.options();
  for (var k in poptions) { moptions[k] = poptions[k]; }
  
  var cursor = collection.find(sel, moptions);
  for (var i = self.index.length - 1; i >= 0; i--) {
    var sort = { }
    sort[self.index[i].name] = self.order * self.index[i].order;
    cursor = cursor.sort(sort);
  }

  // cursor.explain(function explained ( error, explanation ) {
  //   if ( error ) winston.debug("page.explain: error: " + js.pp(error));
  //   else winston.debug("page.explain: " + js.pp(explanation));
  // });

  cursor.limit(self.limit).toArray(function (error, data) {
    if ( error ) return callback(error);
    var paging = {
      next: self.next(data) || null,
      prev: self.prev(data) || null
    }
    //winston.debug("page.retrieve: " + js.pp(sel) + " -> " + js.pp(data));
    callback(null, { data: data, paging: paging });
  });
}

/**
 * @desc Generate MongoDB selector for the page
 */
Page.prototype.selector = function selector ( ) {
  var since = [ ];
  var until = [ ];

  for (var i in this.index) {
    if ( this.since[i] != null && this.since[i] != '' ) {
      var and = { }

      and[this.index[i].name] = { }
      and[this.index[i].name][this.index[i].order > 0 ? '$gt' : '$lt'] = this.since[i];

      for (var j = 0; j < i; j++) if ( this.since[j] != '' ) {
        and[this.index[j].name] = this.since[j];
      }

      since.push(and);
    }

    if ( this.until[i] != null && this.until[i] != '' ) {
      var and = { }

      and[this.index[i].name] = { }
      and[this.index[i].name][this.index[i].order > 0 ? '$lt' : '$gt'] = this.until[i];

      for (var j = 0; j < i; j++) if ( this.until[j] != '' ) {
        and[this.index[j].name] = this.until[j];
      }

      until.push(and);
    }
  }

  since = since.length > 1 ? { $or: since } : since[0];
  until = until.length > 1 ? { $or: until } : until[0];

  return since != null && until != null ? { $and: [ since, until ] } : since || until;
}

/**
 * @desc Generate MongoDB options for the page
 */
Page.prototype.options = function options ( ) {
  return {}
}

/**
 * @desc Construct next page query
 * @param {array} data corresponding to the page
 */
Page.prototype.next = function next ( data ) {
  var self = this;
  if ( self.hasNext && self.until.length > 0 ) {
    return ['since', self.until.join('|')].join('=');
  }
  if ( self.order == 1 && data.length == self.limit ) {
    var record = self.index.map(function (index) { return data[self.limit - 1][index.name]; });
    var since = ['since', record.join('|')].join('=');
    var limit = ['limit', self.limit].join('=');
    var prev = ['prev', 'true'].join('=');
    //console.log( self.uri + [since, limit, prev].join('&') );
    return self.uri + [since, limit, prev].join('&');
  }
}

/**
 * @desc Construct previous page query
 * @param {array} data corresponding to the page
 */
Page.prototype.prev = function prev ( data ) {
  var self = this;
  if ( self.hasPrev && self.since.length > 0 ) {
    return ['until', self.until.join('|')].join('=');
  }
  if ( self.order == -1 && data.length == self.limit ) {
    var record = self.index.map(function (index) { return data[self.limit - 1][index.name]; });
    var until = ['until', record.join('|')].join('=');
    var limit = ['limit', self.limit].join('=');
    var next = ['next', 'true'].join('=');
    //console.log( self.uri + [until, limit, next].join('&') );
    return self.uri + [until, limit, next].join('&');
  }
}

exports.Page = Page;
