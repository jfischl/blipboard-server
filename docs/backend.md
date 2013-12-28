# Overview #

This document explains the design of datastructures and algorithms for
Blipboard, a mobile application that alerts users when
they are nearby messages of interest. 

The **channel** is a fundamental data type which represents users and places
**Blips** are messages broadcast at a location by a channel. Users may **tune
in** (subscribe) to channels.  Users carry mobile devices that occasionally
report their location to the system.  When the user is near a blip associated
with a channel he has tuned into, his phone notifies him.  All channels share
the same id space.

Both user and place channels can create blips.  The creator of a blip is
referred to as a **source**.  The blip may optionally be associated with zero or
more **topics**.  A user is alerted when he is nearby a blip and has tuned into
its source channel. 

All channels can have **listeners** - users who "tune in" to the
channel. For a user channel, there is a corresponding list of channels
the user **listens to**.  This is captured by the ChannelListensTo
document; the channel (for now) is always a user channel.

**Tiles** are contiguous geographic regions named by unique strings called
**tileIndexes**.  They provide an efficient means of organizing data around
geographical regions.

# Nomenclature #
        
        id                value which uniquely identifies a document
        channelId    id of a channel
        tileIndex     a string representing a geographic region
        blipId         unique Id of a blip

#### Nomenclature for types of Channel Ids. ####

We refer to channel ids of a certain type by specific names.  This is
only a convenience to specify the role or type of a channel in certain
contexts.  Channel Ids are unique and are guaranteed never to collide
with another channel of a different type.

        listenerId - unique Id of a channel which represents a listener
        userId - unique Id of a channel which represents a user
        placeId - unique Id of a channel which represents a place


        
# Schema #

This section describes MongoDB document structures and indexes.

 * Channels - data structures representing channels:

> **Channel, UserChannel, PlaceChannel

 * TuneIn Network - data structures representing who is tuned into
   what:

> **ChannelListener, ChannelListensTo**

 * Messages and Notification - data structures for saving blips, and indexing
   them with respect to location:

> **Blip, ReceivedBlips**

## Channel ##
All channels share these properties:

    {   
        _id:            channelId, // mongo _id
        name:           string, // name to be displayed when showing channel 
        description:    string, 
        type:           string, // type of channel {user|place}
        picture:        url,    // url of picture representing the channel
        ignore:         bool,   // this channel should not be returned when searching

        stats: {
            score:      number,  // used to rank channels. note: places and user scores are not necessarily comparable
            blips:      number,
            followers:  number,
            following:  number
        },

        facebook:       {   // optional 
                            id:            number, // facebook id of the user/place/etc.
                            categories:    string, // array of category strings
                            likes:         number, // number of facebook likes
                            checkins:      number, // number of facebook checkins
                            talking_about_count: number
                            accessToken:   string, // facebook access token (USER only)
                            lastRefresh:   Date    // last time we retrieved posts
                        }
    }

## UserChannel ##
A channel representing a real human user of the system.

    Channel properties plus:
    {
        password:       string, // hash of password in form "{hash-string}${salt}${hash-method}"
        email:          string, // optional email
        firstName:      string // is firstname/lastname culturally neutral?
        lastName:       string // " " " 
        lastReadNotificationId: ObjectId,
        recommended:  boolean // indicator that this user is recommended
        currentLocation:        {
                                      tileIndex:   ti,
                                      city:        string,
                                      coordinates: {
                                                         latitude:  number,
                                                         longitude:     number
                                                   }
                                },
    }
             
## PlaceChannel ##
A channel representing messages from a physical, named place.

    Channel properties plus:
    {
            
        location:        {
                                      tileIndex:   ti,
                                      latitude:    number,
                                      longitude:   number
                                      street:      string, // address (not including city) as a string
                                      city:        string, // city name (not including state)
                                      state:       string, // full state name
                                      zip:         string, // zip code
                                      country:     string, // normalized country name
        
                         }
        website:  string,
        phone:    string,
        defaultTopicId: string,
        factual:  [crosswalkRecord, ...]
        }
    }

## TileInfo
Various statistics and data pertaining to a tile
 { 
     tileIndex:   ti,
     lastFacebookUpdateTime: Date, 
     refreshTime: Date

     log: 
     [ 
         { 
             query:  
             { 
                 tileIndex: ti,  // should be relatively constant
                 date: Date,
                 radius: number  // radius used 
                 coordinates: {
                     latitude:  number,
                     longitude: number
                 },
             }, 
             result: 
             {
                 itemCount: Number, 
                 error: String
             }
         }*
     ]
    }
    
    index: {tileIndex:1}
    
    
## ChannelListener ##
Records a user who is tuned in ("listening to") a channel.  Note that the doc
can be retreived via a covered index, and will be sharded by the channelId.

    {
        _id:         string, // mongo _id
        channel:     channelId, 
        listener:    userId, // user who has tuned into channelId
    }

    index: {channel:1,listener:1} - retrieve all listeners of a channel
                                   or a particular listener of the channel
    
## ChannelListensTo ##
Records the channel a user is tuned in to.  This is the converse
relation to ChannelListener, needed for the reverse index.  A second
document type is needed in order to shard based on user (rather than
the tuned in channel as for ChannelListener)

    {
        _id:         id, // mongo _id
        channel:     userId,
        listensTo:   channelId // channel that channelId tuned into
    }

    index: {channel:1,listensTo:1} - retrieve all channels a user tunes into
 
Note: !am! *Why have both ChannelListener and ChannelListensTo?*
This is an optimization to enable sharding by both source and listener.  
     
## Liker ##
    {
        id: userId, 
        name: string
        createdTime: Date
    }

## Comment ##
    {
        id:             String,
        author:         Channel
        text:           String  // should be message
        createdTime:    ISODate
    };

CommentId is composed of two objectIds: {blipId}_{ObjectId}.  The
first ObjectId represents the blip that the comment was made on, and
the second is a new unique ObjectId that distinguishes the comment.
The reason for this 2-part structure is so that clients can recover
all of the necessary information for interacting with the comment
(e.g., deleting, (eventually) liking, etc.) simply from the comment Id.
    


## Topic ##
 {
    _id: ObjectID,           // unique identifier
    parentId: ObjectID,      // identifier that refers to parent topic-id, may be undefined (no parent)
    identifier: String       // unique string identifier
    name: String             // string label
    description: String      // detailed description of the category
    picture: String          // url pointing to image server
    picture2x: String        // url pointing to image server
 }

## TopicDefinition ##
 {
    identifier: String       // unique string identifier
    parentIdentifier: String // string identifier for parent topic (may be undefined)
    name: String             // string label
    description: String      // detailed description of the category
    pictureFile: String      // path to local file containing picture image (png)
    pictureFile2x: String    // path to local file containing picture image @2x(png)
 }

## Blip ##
A location-based message containing text, pictures, annotated with topics and possibly in reply to another such message.

    {
        _id:            ObjectId, // unique blip id
        message:        string, // text to be displayed
        author:         UserChannel,  // remove listenersCount
        place:          PlaceChannel,
        createdTime:    ISODate, 
        expiryTime:     ISODate, 
        likes:          [Liker*],  // list of likers of this blip
        comments:       [Comment*], // list of comments
        topicIds:       [ObjectId*], // optional list of topic ids
        popularity:     number,    
        facebook { 
            postid:     facebook id,
            likeCount:  number,
            commentCount: number
        }


        // POST-MVP:
        //pictures:       list<string> // optional url of associated photos
        //replyTo:        blipId, // id blip to which we’re replying ← need to discuss this 
    }

    indexes: 
             {author:1,createdTime:-1} - ordered broadcast history for the source channel, recent first
             {place.location.tileIndex:1,popularity:-1} // popular blips by tile
             {expiryTime:1} - blips ordered in terms by earliest expiration date
             {facebook.postid:1}

             // POST-MVP:
             {location.place:1,time:-1} - ordered history of blips at a place, recent first
             {location.tileIndex:1,time:-1} - ordered history of blips at a tile, recent first

Note: !am! The current indexing scheme is not shardable: do blips get
sharded on author, topic, location, time, or expires fields?  There's
a use case for each.  We need to revisit this part of the design, but
various strategies are possible: separate documents storing lists or
separate small relational documents in the style of ChannelListensTo
and ChannelListener.

## Notification ##
Keeps a record of all notifications sent to a user

  {
      // Base Notification
      _id:      ObjectId, // the notification unique id
      userId:   ObjectId, // the user who was notified
      time:     Date,     // time notification was sent
      type:     String,   // one of "tunein", "like","blip","comment"
      title:    String, 
      subtitle: String, 
      picture:  String, 

      
      // one and only one of the following fields must be provided:

      // Listener Notification
      listenerId:     ObjectID
      
      // Like Notification
      likerId: ObjectId, // user who liked
      blipId:  ObjectId, // blip which was liked

      // Blip Notification
      blipId:  ObjectId, // the blip that was sent

      // Comment Notification
      blipId:  ObjectId
      commentId:  ObjectId, // the comment id

      // New Channel Notification
      channelId:  ObjectId
      
      // New Top Users Notification
      
      // New Web Notification
      url:  String

      // No Action Notification
      
      // Create Blip 
      placeId: ObjectId
      
      // Profile Editor Notification
  }
    
## ReceivedBlips ##
Stores the history of received blips for a user. 

    {
         _id:           id,         // mongo _id
         user:          userId,     // mongo id, remove listenersCount
         author:        channelId,  // mongo id
         authorType:  String       // type of channel {user|place} 
         tileIndex:     tileIndex,
         placeId:       channelId,
         location: {
            latitude: Number,
            longitude: Number
         },
         notified:      Bool        // has been sent to the user in an alert
         isRead:        Bool        // has been read by the user
         createdTime:   Date
         expiryTime:    Date
         effectiveDate: Date,
         popularity:    Number,
         blip:          blipId
    }

    indexes:  (proposed - examples of how this document type enables useful views)
        {user:1, tileIndex:1, topicIds: 1, blip:-1} - retrieve documents for a user at a tile, most recent blips first
        {user:1, _id:-1} - retrieves documents for a user, most recently received first
        {user:1, placeId:1} - used for mark-read for a user's received blips at a placeId
        
## ReportedLocationHistory ##
Stores the history of all reported locations
    { 
        _id:           id,            // mongo id
        user:          userId,        // mongo id
        tileIndex:     tileIndex,
        latitude:      number,
        longitude:     number,
        reason:        string,
        age:           number,
        accuracy:      number,
        speed:         number
    }

# Algorithms #
We use a fan-out on broadcast method that distributes blips to location-specific queues (IncomingBlipQueues) for each of a channel's listeners.  This method is simple and similar to fan-out methods of other publish-subscribe systems.  The main difference is that Blipboard maintains a set of location-specific queues for each user, and Blips are delivered to the user in the form of alerts when he is nearby.  

The key operations are:

  * Tune In - the user subscribes to a channel to receive alerts
  * Tune Out -  the user unsubscribes from a channel
  * Broadcast a blip - the user or place publishes a message on his
    channel as well as zero or more topic channels, and sets an expiry time
  * Expire Blips - system ensures that users will not receive alerts about
    expired messages
  * Delete Blip - the source deletes a blip, ensuring others will not be alerted by it or see it
  * Retrieve Blips For User Near Location - quickly obtain any blips
    available for a user at a tile
  * List popular channels - list most popular people,
    places and topics within a geographical region or globally


An alternative approach, which we do not use, is the "set-intersection method" which involves dynamically computing which messages are relevant to a particular user at the time a user visits a geographical location.  It involves a computing set-intersection between the user's channels and the channels which have new messages when the user visits a geographical location.  It is discussed in [this document](./set-intersection-design.md).

## User Tunes In/Out ##
    
    tuneIn(userId,channelId):
        ListenerToChannel.findOrCreate(user=userId,channel=channelId)
        ChannelListener.findOrCreate(channel=channelId,listener=userId)
        // copy unexpired blips onto user's location-queues
    
        unexpiredBlips = {} // map of tileIndexs=>unexpired blips
        for blip in Blips[source=channelId,expiry>now]:
            unexpiredBlips[blip.tileIndex] += blip 

        for ti,blips in unexpiredBlips:
            blipQueue = IncomingBlipQueues.findOrCreate(tileIndex=ti,user=userId)
            blipQueue.blips = blips + blipQueue.blips // add new blips to the top of the queue

    tuneOut(userId,channelId):
        DELETE ListenerToChannels[user=userId,channel=channelId]
        DELETE ChannelListeners[channel=channelId,listener=userId]

        // remove the channel's blips from ALL of the user's location-queues
        unexpiredBlips = Blips[source=channelId,expiry>now]
        FOREACH blipQueue IN IncomingBlipQueues[blips $CONTAINS unexpiredBlips]:
            PULLALL unexpiredBlips from blipQueue.blips

## User Reports Location ##
User's mobile phone reports the location. The system computes matching messages and alerts the user.

    reportLocation(userId,ti):
        // update user location
        Channel[type='user',_id=userId].tileIndex = ti 
        
        // copy queued Blips to User's Incoming
        newBlips = IncomingBlipQueues[user=userId,tileIndex=ti].blips
        if (newBlips):            
            // copy new Blips to user's received list:
            receivedBlips = ReceivedBlips.findOrCreate[user=userId]
            receivedBlips.blips = newBlips + receivedBlips.blips

            // clear the queue - 
            // !am! note: if server fails after prev call, 
            //            user will receive these blips again(!)
            IncomingBlipQueues[user=userId,tileIndex=ti].blips = [] 

            if receivedBlips.blips is too long (ie., reaching Mongo 16Mb doc limit):
                pruneIt!
            
            // send alert to user's mobile phone
            sendAlert(userId,newBlips) 
        
## Broadcast ##
Broadcast a Blip (blipId) at the tileIndex.  Listeners currently at the location are notified immediately; for the rest, blips are put in a queue (the IncomingBlipQueues) specific to that tileIndex.  

    broadcast(blipId,channelId,[topicId*],ti):
        listeners = SET([ctl.listener for ctl in ChannelListener[channel in channelId,topicId*]])
        usersAtTile = [u._id for u in User[tileIndex=ti]]
        currentListeners = SETINTERSECTION(listeners,usersAtTile)
        queuedListeners = SETDIFFERENCE(listeners,usersAtTile)
        
        // notify current listeners
        FOREACH user IN ReceivedBlips[user IN currentListeners] 
           PUSH( blipId ONTO user.blips )
        sendAlert(userId,blipId)
        
        FOREACH userId in queuedListeners:
           PUSH blipId ONTO ReceivedBlips[user=userId].blips


        
## Expiration ##
Garbage collect expired blips

    monitorExpiringBlips():
        while true:
            sleep(kWait)
            expiring = Blips[expiry<now]
            REMOVEALL$ expiring IncomingBlipQueues[blips CONTAINS expiring].blips

## Delete Blip ##
Source deletes a blip which it broadcast.
Indexes aid efficient retrieval of documents containing the blip to be deleted.

    deleteBlip(channelId,blipId):
        // make sure the channel is the creator of the blip
        assert Blip[_id=blipId].source == channelId
        
        // delete all references to the blip
        for blipQueue in IncomingBlipQueues[blips CONTAINS blip]:
            REMOVE blipId FROM blipQueue.blips
        for rb in ReceivedBlips[blips=blipId]:
            REMOVE blipId FROM rb
        DELETE Blip[_id = blipId]
         
## Retrieve Popular Channels ##
The real work is all handled by the indexes.

    popularPlaces(ti):
        PlaceChannel[location.tileIndex=ti].orderBy(listenersCount)
        
    popularPeople(city):
        UserChannel[currentLocation.city=city].orderBy(listenersCount)
        
    popularTopics():
        TopicChannel.orderBy(listenersCount)
        
        


