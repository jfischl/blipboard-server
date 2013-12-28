var Tile = require('./tile').Tile;

function Bounds(input) {
  // if forgot to put new
  if ( !(this instanceof Bounds) ) {
    return new Tile(input);
  }
  
  var north,south,east,west,southwest,northeast;
  if (input) {
    try {
      var splitBounds = input.split("|");
      southwest = splitBounds[0].split(',');
      northeast = splitBounds[1].split(',');
      south = southwest[0];
      west = southwest[1];
      north = northeast[0];
      east = northeast[1];
    }
    catch (e) {
      return this;
    }
  }

  if (north && south && east && west) {
    var fNorth = parseFloat(north);
    var fEast = parseFloat(east);
    var fSouth = parseFloat(south);
    var fWest = parseFloat(west);

    if (isNaN(fNorth) || isNaN(fSouth) || isNaN(fEast) || isNaN(fWest)) {
      return this;
    }
    
    this.southwest = { latitude: fSouth, longitude: fWest };
    this.northeast = { latitude: fNorth, longitude: fEast };
  }
  return this;
}

Bounds.prototype.contains = function contains(latitude, longitude) {
  if (!this.southwest || !this.northeast) { 
    return false;
  }
  else {
    return (latitude >= this.southwest.latitude && 
            latitude <= this.northeast.latitude &&
            longitude >= this.southwest.longitude &&
            longitude <= this.northeast.longitude);
  }
};

Bounds.prototype.tileIndexes = function tileIndexes() {
  return Tile.fromContainedBounds(this.southwest.latitude, this.southwest.longitude, this.northeast.latitude, this.northeast.longitude, 16).map(function ( t ) {return t.toIndex();});
};

exports.Bounds = Bounds;
