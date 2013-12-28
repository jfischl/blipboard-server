__Paging - lib/page.js__

# Server Side
Paging can be easily added to a particular request in a few steps.
1. Define paging index that can be used to sort the documents in a unique way.
It is important to notice that paging index does not necesserily correspond to the index used by MongoDB.

Paging index consists of a series of document field descriptors which specify:
    * field name
    * sorting order: 1 - ascending; -1 - descending
    * (optional) field type conversion function

        var index = [
          { name: 'weight',  order: -1, type: function (value) { return parseFloat(value); } },
          { name: 'channel', order: 1,  type: objectId },
          { name: '_id',     order: 1,  type: objectId }
        ];

2. Add `requirePage(index)` to the middleware stack for the request.

3. Use `request.page.retrieve` to get paged results

        // selector for retrieving data from a collection without paging
        var selector = {
          field1: <value1>,
          field2: <value2>,
          field3: <value3>
        }

        // additional options for the query: limit, sort, ...
        var options = { }
        
        request.page.retrieve(mongo.<collection>, selector, options, function onRetrieved (error, documents) {
          if ( error ) return callback(error);

          // documents correspond to the structure expected by the client
          should.exist(documents.data);   // not more than one page of documents retrieved from MongoDB
          should.exist(documents.paging); // paging object for referencing next and previous pages

          callback(null, documents);
        });

# Client Side
Paging model contains __next__ and __prev__ properties that contain URIs referencing next and previous pages.
These URIs are used by __loadNextPage__ and __loadPrevPage__ to retrieve data from the server.
