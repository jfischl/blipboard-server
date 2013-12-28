Backend Validation
==================
Manager functions must validate data before storing it in the
database.  This document covers how to use the validation methods.


validate
--------

The core method is validate, which has the following form:

    validate( forms, errorCallback, successCallback);
    
Process the forms, call errorBack(error) with the first error 
or if all succeed, call successBack
    
**Forms**  is structured as:
       { paramName1: [ value, [undefinedOK,] test* ... ]
         paramName2: [ value, [undefinedOK,] test* ... ]
       }
 
Each **test** is a function of the form test(value,callback),
where callback is called callback(failure, result)
 
**Failure** is a string describing the failure

**Result** should be set to a new value to replace value
           or should be left as undefined

**undefinedOK** is a special signal that ignores the remaining tests
                if the value is undefined.

**errorCallback(error)** where error is an error object representing
  the failure. It will be of type validationError
    
!am! note, in the future, we'll want to do all the validations,
and return a combined error, but that's for later.

**successCallback(prepared)**} successBack where prepared is a dictionary mapping
             paramnames to the correctly prepared values (or the original values)


    function myManagerAction(foo,location, callback) {
      validate({ foo:      [foo, isClass(String)], // tests foo is a String
                 location: [location, isLocation, addLocationTileCode] }}
               callback, // called if errors occur
               function doMyManagerAction(prepared) {
                 console.log(prepared.foo);
                 console.log(pepared.location);
               })
    });
    myManager(123,"abc",{latitude:100,longitude:100},  // pass invalid arguments, get an error
             function (error) { console.log(error); }, 
             function (prepared) {
               console.log(prepared.foo); // never gets called
               console.log(prepared.bar);
             });
    => Error: 'foo', expecting String but received Number


    myManager("123",{latitude:100,longitude:100}, 
             function (error) { console.log(error); }, 
             function (prepared) {
               console.log("Yay! foo is a "+className(prepared.foo));
               console.log("location is "+prepared.location);
             });
    => 
    "foo is a String"
    "bar is {latitude:100,longitude:100, tileCode:'1200123012312'}" // or some such

Tests
-----
Tests are given as arguments in the forms argument to validate.  

Here are the currently available tests, and an example of usage:

### isEqual ###
Takes an argument and returns a test which typecasts, and checks that
the value == argument:

    { myVal: [myVal, isEqual('a')] } 
    
### isStrictlyEqual ###
Takes an argument and returns a test which checks that the value ===
argument:

    { myVal: [myVal, isStrictlyEqual('a')] }
    
### isClass ###
Takes a class as argument, and returns a test which checks whether
isClass(value) is the class.

    { mystring: [mystring, isClass(String)] }
    
### areAllClass  ###
Takes a classname as argument, and returns a test which checks a list
to ensure all elements are of the named class. 
    
    { mystrings: [[foo,bar,baz], areAllClass('String')] }
    
### idsExist ###
Takes a collection, and returns a test which checks a list of ids to
ensure the database contains all of the ids in the list.

    { myIds: [[id1,id2,id3], idsExist('mycollection')] }
    

### isLocation ###
Tests whether an object represents a valid location of the form:
{ coordinates: { latitude: Number, longitude: Number} } 
    
    { mylocation: [mylocation, isLocation] }
    
### addLocationTileCode ###
Adds a tileCode property to the location.  Should be used after an
isLocation test.  May optionally take a zoom parameter.

Uses a default tileCodeZoom (given in config.MONGO.tileCodeZoomLevel)

    { myLocation: [myLocation, isLocation, addLocationTileCode] } 
    
Tile code at zoom level 15:

    { myLocation: [myLocation, isLocation, addLocationTileCode(15)] }
    
    

Tests are functions, but it's not important to understand their parameters
and return values since the validate function handles the details for
you.  

However, it is useful to understand them if you wish to write new
tests.  Tests are functions that have the form:

    function test(value, callback) {
       ... 
    }
    
The test callback has the form:

    function callback(failure,preparedValue) {
    }
    
The validate function calls each test on the value being tested.  If
the test fails, it calls:

    callback(failure)
    
Where failure is a human-readable string describing why the test
failed. 

On success, the test calls

    callback()

Or

    callback(preparedValue)

This allows the test to provide a replacement for the test value.  One
example is the addLocationTileCode test, which takes a value
representing a location, and adds a tileCode property; the
preparedValue is the modified location object.
