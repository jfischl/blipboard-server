/**
 * Copyright (c) 2012 Blipboard. All rights reserved.
 *
 * @fileoverview Tool for generating google api requests that plot lists of lat lon coordinates
 * @author vladimir@blipboard.com
 *
 * @created Tue, Mar 20 2012 - 14:09:07 -0700
 * @updated Tue, Mar 20 2012 - 14:09:07 -0700
 */

function all ( coords ) {
  var base = 'maps.google.com/maps/api/staticmap';
  var markers = coords.map(function (coord) { return toMarker(coord); }).join('&');
  var query = ['size=512x512', markers, 'sensor=false'].join('&');
  return [base, query].join('?');
}


function toMarker ( lat, lon, color ) {
  if ( lat instanceof Array ) return toMarker.apply(this, lat);
  if ( typeof lat === 'object' ) return toMarker(lat.lat, lat.lon, lat.color); 

  var marker = 'markers=';
  if ( color ) marker += ['color:','|'].join(color);
  marker += [lat, lon].join(',');

  return marker;
}

exports.all = all;
