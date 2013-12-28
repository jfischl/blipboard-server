var NormalDistribution = exports.NormalDistribution = function NormalDistribution ( range, expectation, deviation ) {
  if ( !(this instanceof NormalDistribution) ) return new NormalDistribution(range, expectation, deviation);

  this.range = range > 1 ? range : 1;

  this.expectation = expectation || this.range / 2;
  this.deviation = deviation > 0 ? deviation : this.range / 8;

  this.PDF = this.pdf(0);
  this.CDF = this.cdf(range - 1);
}

NormalDistribution.prototype.argument = function argument ( x ) {
  return (x - this.expectation) / (Math.sqrt(2) * this.deviation);
}

NormalDistribution.prototype.pdf = function pdf ( x ) {
  var arg = this.argument(x);

  return Math.exp(- arg * arg) / (this.deviation * Math.sqrt(2 * Math.PI));
}

NormalDistribution.prototype.cdf = function cdf ( x ) {
  var arg = this.argument(x);

  var taylor = arg / Math.sqrt(Math.PI);
  var result = 0.5 + taylor;

  for ( var i = 1; Math.abs(taylor) > 1 / this.range; i++ ) {
    taylor *= - arg * arg * (2 * i - 1) / i / (2 * i + 1);
    result += taylor;
  }

  return result;
}

NormalDistribution.prototype.next = function next ( ) {
  var number = Math.random();
  
  var low = 0;
  var high = this.range - 1;

  var n = Math.floor(high / 2);

  while( low != high ) {
    if ( this.cdf(n) < number ) low = n+1;
    else if ( this.cdf(n) > number ) high = n;
    else return n;

    n = Math.floor((low + high) / 2);
  }

  return n;
}

var nd = new NormalDistribution(10, -1, -1);
