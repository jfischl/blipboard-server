Blipboard Server README
=======================

NOTE: these are probably a bit out of date

Requirements
------------

Install
-------
    git clone --recursive git@github.com:jfischl/blipboard-server.git
    cd blipboard
    npm install 

Then, add the Blipboard API keys to your environment:

    FACEBOOK_BLIPBOARD_ID = {admin will give you this value}
    FACEBOOK_BLIPBOARD_SECRET = {admin will give you this value}
    
    WEB = server.js
Run
---
    node server.js

Directory Structure
-------------------

    config.js              - pure JSON config file (no fns!)
    server.js              - main entry point   
    Makefile               - run tests ( !am! is this working? )
    Procfile               - heroku processes
    package.json           - npm packages
    docs/        
        backend.md         - backend data structures & algorithms
        api.md             - REST API 
        error.md           - errors used throughout
    controllers/           - REST API functions grouped by resource
        blipController.js
        channelController.js
        developerController.js
        resource.js        - converts a backend object to resource format
    managers/              - backend functions grouped by document type 
        validate.js        - common validation for args to managers 
        channelEvents.js   - exports.channelEvents is an EventEmitter 
        channelManager.js  - common functionality to all channels
        userManager.js
        placeManager.js
        topicManager.js
        blipManager.js
    lib/                   - common functionality
        error.js           - Error object
        middleware.js      - Express middleware
        password.js        - hash-salt password fns
        mongo.js           - mongo initialization
        javascript.js      - language-level utilities
    support/               - external libraries not available by npm
        GlobalMapTiles.js  - external lib for quadtree tileCodes 

Debug
-----

Get detailed debugging information in the API responses by setting these
environment variables:

    BLIPBOARD_API_RESPONSE_SHOW_STACK=1
    BLIPBOARD_API_RESPONSE_SHOW_INTERNAL_ERRORS=1

Deploy
------

To deploy into heroku onto our staging environment: 

    edit package.json and update the version to a new number and
    commit. At a minimum increment the build number. e.g. from 1.0.1-1
    to 1.0.1-2. If you do not do this, nothing will happen when you push

    % git push staging master
    
To monitor the logs on heroku: 
    
    % git logs -d
    

Style
-------------

* We use Felix's node style guide.  http://nodeguide.com/style.html
* Callbacks versus Events:
  * We use callbacks to calculate results which must be delivered as a
    response to a client request (e.g., client requests a new user object,
    and returning the id to the client)
  * We use events to respond to events that require further background
    processing, but do not need to return a response to the client's
    HTTP request.  (e.g., client reports its location)

