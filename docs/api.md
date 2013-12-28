# Overview #

This document describes the Blipboard API.  Blipboard is a mobile
application that alerts users when they are nearby messages of
interest. 

The **channel** is a fundamental data type which represents users, places
onand topics.  **Blips** are messages broadcast at a location by a
channel. Users may **listen** (subscribe) to channels.  Users carry
mobile devices that occassionally report their location to the system.
When the user is near a blip associated with a channel he has tuned
into, his phone notifies him.

Both user and place channels can create blips.  The creator of a blip
is referred to as the **author**.  The blip may optionally be associated
with one or more **topics**, enabling users who are tuned in to
the topic channel to receive the blip.  A user is alerted when he is
nearby a blip and has tuned into its source channel or one of the
associated topics.   

Users who tune in to a channel are refered to as the channel's
**listeners**.  We also refer to the channels that a user **listensTo**.


# API Structure #

    GET /accounts/me             - retrieve the current account 
       returns accountfor authenticated user

    POST /accounts               - create a new user account
       returns account
       parameters: 
         password=string        - mandatory: user specified (plain-text password)
         fbtoken=string         - optional: oauth access token , if not specified, create anonymous user

    PUT /accounts/me  - update the profile. only the description is editable
        account
        returns account

    GET /accounts/me/notifications
        returns notifications

    POST /accounts/me/notifications/acknowledge
       returns notifications
       parameters:
        id=string                  - id of the last notification that was received by the client. 

    PUT /accounts/me/access_token  - update the access token, updates the user's data from facebook 
        returns account
        parameters: 
         fbtoken=string         - mandatory: facebook oauth access token 
        
    GET  /channels                         - search for channels
        parameters:
         q=string query text
         recommended=bool           - indicate to return only recommended
         latlng=string                      - "latitude,longitude"
         bounds=string                      - "south(lat),west(lng)|north(lat),east(lng)"
         start=number (default 0)
         limit=number (count)
        returns channels

    GET /channels/:chid                    - gets public info about channel :chid

    GET  /blips/:blid                      - return blip data

    POST /blips/:blid/comments             - create a comment
         parameters:
          text=string
         returns:
          { comment: Comment }
         
    DELETE /blips/comments/:commentId      - delete a comment
    
    GET /id

    GET /topics                            - gets all topic objects
        returns topics
        
# API Reference #

The Blipboard API returns hierarchically structured JSON objects with
a uniform format.  It is intended that the same interpretation may be
applied to the result from any API call. 

## I. Data Types ##

A.Account: an actor in the system who can authenticate. 

    account
    {
        id: string,              // unique identifier  
        name: string,            // name to be displayed when showing channel 
        description: string,     // user's description // editable
        picture: url,            // url of picture of the user
        email: string,

        facebook : { 
            id: string
        }, 

        capabilities: {
            disableStartupNotifications: bool,
            disableSharing: bool
        }
        
        operations: { 
            update-location: {method: POST, uri: URI}, // returns: region
              parameters: 
                latlng="lat,lng" 

            received-blips: {method: GET, uri: URI} returns blips
              parameters: 
                latlng="lat,lng" 
                bounds=string                      - "south(lat),west(lng)|north(lat),east(lng)"
                limit=number (count)

            popular-blips: {method: GET, uri: URI} returns blips
              parameters: 
                type=string                        - type=user or type=place. if absent, return both
                limit=number                       - max results to return
                latlng="lat,lng" 
                bounds=string                      - "south(lat),west(lng)|north(lat),east(lng)"
                topics=t1,t2,..                    - topics

            channel-search: {method: GET, uri: URI} returns channels
              parameters:
                q=string query text
                latlng=string                      - "latitude,longitude"
                bounds=string                      - "south(lat),west(lng)|north(lat),east(lng)"
                limit=number (count)
         
            notifications: {method: GET, uri: URI} returns notifications
              parameters: 
                limit=number (count)
        }
    }

B. Channel: a stream of location based messages, called Blips. Users
may tune in to channels to receive notifications of nearby Blips .

Channels have this structure:

    channel 
    {
        id:   string,            // unique identifier  
        name: string,            // name to be displayed when showing channel 
        description: string, 
        type: string,            // type of channel {user|place}
        picture: url,            // url of picture representing the channel 
        score: number            // DEPRECATED
        listenersCount: number,  // DEPRECATED: count of how many users are tunedin
        isListening: string      // true if the authenticated user is listening

        stats: { 
            score: number,
            blips: number,
            followers: number,
            following: number
        },
        
        operations: { 
            tunein:      { method: POST, uri: URI},   // returns nothing
            tuneout:     { method: DELETE, uri: URI}, // returns nothing
            blip-stream: { method: GET, uri: URI},    // returns blips
            listeners:   { method: GET, uri: URI},    // returns channels
        }
    }
    
    userChannel INHERITS channel =
    {
        operations: {
            listensTo:  {method: GET, uri: URI}, // returns channels
            broadcasts: {method: GET, uri: URI}, // returns blips
        }
    }

    placeChannel INHERITS channel = 
    {
        operations: {
            broadcastAt: {method: POST, uri: URI, params: dictionary},  
                returns blip
                dictionary = {
                    authorid: string,
                    placeid: string,
                    topicids: [string*],
                    message: string,
                    expiry: ISOdate
                }

            broadcasts: {method: GET, uri: URI} returns blips
        }

        website: string,
        phone: string,
        category: string,
        defaultTopic: string,

        location: {
                      latitude: number,
                      longitude: number,
                      street: string,  
                      city: string, 
                      state: string, 
                      zip: string, 
                      country: string
                  }
    }

    CHANNELS = 
    {
      channels: {
        data: [channel, ... ]
        operations: {
        }
        paging: {
            next: URI,
            prev: URI
        }
      }
    }

C. Liker / Likes 

    liker
    {
        id:   string,            // unique identifier  
        name: string,            // name to be displayed when showing channel 
        created_time: string     // ISODATE
    }

    likes
    {
        likers: [liker,...]     
        isLiker:   boolean       // true if the authenticated user likes this blip
        likeCount: number
    }

D. Blip: 
  
    { 
      blip:  {
        id:          string,       // unique identifier
        author:      channel,
        place:       placeChannel,
        message:     string,
        expiryTime:  string,       // ISO time
        createdTime: string,       // ISO time  
        likes:       likes,
        isRead:      bool,

        photo:       string,       // URL pointing to picture...
        sourcePhoto: string,       // URL pointing to picture in source resolution. 
        sourceWidth: number,       // resolution in pixels of the sourcePhoto (may be undefined)
        sourceHeight: number,      // resolution in pixels of the sourcePhoto (may be undefined)

        link:        string        // blip may contain a URL. may be undefined. 

        topics: [ Topic* ]        // associated topicids with the Blip

        comments: { 
            data: [Comment*]
            paging: {
                next: URI,
                prev: URI
            }
        },
        operations: {
            like:      { method: POST, uri: URI },   // returns likes - likers
            unlike:    { method: DELETE, uri: URI }, // returns likes - likers
            mark-read: { method: POST, uri: URI },
            reblip:    { method: POST, uri: URI },
            comment:   { method: POST, uri: URI },
            delete:    { method: POST, uri: URI },
        }
      }
    }

    { 
      blips: {
        data: [ blip, ... ]
        operations: {
            mark-read: { method: POST, uri: URI }, 
              params: 
                latlng=string                      - "latitude,longitude"
                bounds=string                      - "south(lat),west(lng)|north(lat),east(lng)"
        }
        paging: {
            next: URI,
            prev: URI
        }
      }
    }

E. Region
    
    { 
        region: {
            latitude: number,
            longitude: number,
            radius: number
        }
    }

F. Notification

    {
       id:   String, // unique identifier
       userId: String, // receiver's channel id
       time: Date, // time notification was sent
       title: String, // short < 25 char title to be displayed in notification center
       subtitle: String // medium < 60 char message to be displayed below the title
       picture: String // optional URI pointing to an image. URN or URL
       type: String, // one of 'comment', 'like','tunein','blip'
                     // 'channel','top-users','web','no-action', 'create-blip', 'profile-editor'
       isNew: Bool, // true or false (if notification Id)
       
       // like     - default message,title provided by client
       likerId: String, // user id who liked the blip
       blipId:  String, // blip id which was liked

       // tunein   - default message,title provided by client
       listenerId: String, // the user id who tunedIn
        
       // blip     - default message,title provided by client
       blipId: String, // the blip id that was sent

       // comment  - default message,title provided by client
       commentId:   String, // comment id 
       commenterId: String  // commenter channel id

       //
       // the following types MUST provide a title and subtitle:
       //
       // channel - shows a user channel
       channelId: String, // the user Id to be displayed
       display: 'blips','followers','following'  // optional
       
       // web - shows a web page
       url:       String, // the url to show
       
       // top-users - on tap, show the list of top users
       // (no params yet)
          
       // create-blip - on tap show the create blip dialog
       placeId:   String, // optional - id of the place to blip at
       
       // no-action - as name implies, does nothing when user taps
       // no additional data

       // profile-editor - invokes the profile editor dialog.
       // no additional data
    }
    

    notifications: {
       data: [Notification*], 

       // dictionary mapping blipIds to Blips:
       blips: {  ObjectId: Blip, * }

       // dictionary mapping blipIds to Blips:
       channels: {  ObjectId: Channel, * }
       
       operations: {
            acknowledge: { method: POST, uri: URI, params: dictionary }, 
       },

       paging: {
            next: URI,
            prev: URI
       }
    }

G. Comment
    {
        id:          String, //two ObjectIds separated by "_"
        author:      Channel,
        text:        String, // the comment message
        createdTime: Date
    }
        
H. Topic: 
    {
        id: String
        parentId: String
        name: String
        description: String
        picture: String
        picture2x: String
    }
    
    topics: {
       data: [Topic*],
       paging: {
          next: URI,
          prev: URI
       }
    }
        
Implementation Details: 

    POST /users/:id/location              - update user's current location
    parameters:                           - returns region
        latlng=string                     - "latitude,longitude"

    GET /channels/:chid                   - gets public info about channel :chid
    PUT /channels/:chid                   - set various bits of data

    GET /channels/:uid/broadcasts         - returns the blips broadcast by the channel :id 
        parameters:                        - id can be user or place channel. 
        topicids=t1,t2,..                  - topics
        limit=number (count)

    GET /channels/:id/stream               - returns the channel's stream. (id can be any type of channel)
        parameters:                        - the stream is the list of blips that a user would receive if he is tuned in.
        topicids=t1,t2,..                  - topics
        limit=number (count)
        
    POST /channels/:uid/received/mark-read - marks blips received at latlng  as read for a 
                                              as read for a particular user :uid
       parameters:  
       latlng=string "latitude,longitude"
       bounds=string                      - "south(lat),west(lng)|north(lat),east(lng)"

       
    GET /channels/:uid/received            - history of read blips for user
        topicids=t1,t2,..                  - topics
        limit: number (count)
        latlng=string "latitude,longitude"
        bounds=string                      - "south(lat),west(lng)|north(lat),east(lng)"
        type=string                        - type=user or type=place. if absent, return both

    GET  /blips                            - search for blips posted by any users
        parameters:
        !am! TBD
        
    GET  /blips/popular                    - return popular blips near latlng
        limit: number (count)
        type=string                        - type=user or type=place. if absent, return both
        latlng=string                      - "latitude,longitude"
        bounds=string                      - "south(lat),west(lng)|north(lat),east(lng)"
        topicids=t1,t2,..                    - topics
        
    POST /blips/:blid/received/mark-read   - marks the specified blip as read

    POST /channels/me/received/place/:id/mark-read    - marks the blips for "me" at place=:id as read
    POST /channels/me/received/blip/:id/mark-read    -  marks the blip with blipId=:id as read by my

    GET  /blips/:blid                      - return blip data
    DELETE /blips/:blid                    - delete the blip

    POST /blips/:blid/likes                 - return user channels that like this blip
    DELETE /blips/:blid/likes               - unlike a blip

## Abbreviated Channel URLs ##

It is preferable to use the following short form for referring to
channels urls when an :id is provided

    GET  /:uid                 == /channels/:uid
    GET  /:uid/blips           == /channels/:uid/blips
    GET  /:uid/incoming        == /channels/:uid/incoming
    PUT  /:uid/location        == etc.
    

## TuneIn/TuneOut ##

    POST    :uid/listensTo/:chid  - tunes in user :uid to channel :chid
    DELETE  :uid/listensTo/:chid  - tunes out user :uid from channel :chid
    GET     :uid/listensTo/       - returns channels tuned into by user :uid
    GET     :chid/listeners       - returns who has tuned in to the channel
    
## Personalization ##

In many places, the API can return, if requested a response personalized to the current user.
The client can request this behavior by providing a "me" GET param.

    e.g.,
        GET /channels?me=1234 // for user id=1234
     or GET /channels?me=true // for current user
        returns output of /channels, where data is decorated with a listeningTo boolean attribute.

## The special "me" id ##

Wherever a :uid appears as the first element of a URL, the API user may substitute "me".  The
server substitutes "me" with the id of the logged in user.
The "me" shortcut is not supported for PUT.
    
    e.g., if current user id is 123,
       
       GET /me/blips   => same result as GET /123/blips
       POST /me/blips  => same result as POST /123/blips
