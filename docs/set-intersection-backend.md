
NOTE: THIS SPEC IS NOT USED - PROVIDED FYI ONLY

Set Intersection Method
=====================================================
This documents the set intersection method for finding relevant blips for a user at a location.



Redis
-----
Redis is used to speed queries by storing derivative data (which can be reconstructed from Non-derivative data) in various useful structures.

### Notation ###

#### Key Structure ####
Redis keys are structured literately, such that the meaning of the key can be infered from its name.  Specifically, the mapping that the key represents is part of the name.  

For example, if we wish to map the list of Blips for a Channel at a particular GeoHexCode, given:
 
    tc	     	= z  
    chid  	= 9
    blid    	= 1
    
The key would be structured:
    
    tc,chid=> blips<{tc},{chid}>

We could add Blip 1 to a list of Blips for Channel 9 at tileCode z as follows

    LPUSH tc,chid=>blips<z,9> 1

#### REDIS structures ####

Redis supports Lists, Sets, Ordered Sets, HashTables.  We will refer to Redis structures using the following syntax:

    LIST(objType) - a List which stores object of type objType
    SET(objType) - a Set which stores object of type objType
    ZSET(weightType,objType) - an Ordered Set which stores objects of type objType ordered by weightType
    HASH(keyStructure,objType) - a HashTable which stores objects of type objType with keys having structure keyStructure

### Redis Keys ###

    tc:uid=>lastVisitTime<{tc}:{uid}> ===> integer
Description: The last time (as an integer epoch time) a user was at a tileCode 

    uid=>currentTile<{tc}> ===> tc
Description: Users current tile

    tc:chid=>blips<{tc}:{chid}> ===> ZSET(blipTime,blid)
Description: The blips in the order they were made by a channel at a tileCode

    uid=>myChannels<{uid}> ===> SET(chid)
Description: The channels that a user is tuned in to

    chid=>myListeners<{chid}> ===> SET(uid)
Description: The users that are TunedIn to chid

    tc=>visitingUsers<{tc}> ===> SET(uid)
Description: The users that are currently reported in at a tileCode

	tc:uid=>seenChannelsAtTile<{tc:uid}> ===> SET(chid)
Description: Channels in the set have been seen by the user (uid) at the
lastVisitTime (any more recent blips at this tile have not been seen
by the user)

    tc=>activeChannels<{tc}> ===> ZSET(time,chid)
Description: Channels which have active blips at the tile are ordered
in the ZSET according to the epoch time of the last blip at this tile.

    uid=>incomingBlips<{uid}> ===> LIST(blid)
Description: incoming blips that haven't been seen by the user. 

    expiringBlips ===> ZSET(expiration,[blid,tc,chid_1,...,chid_n])
Description: blids ordered by expiry time.

Algorithms
----------
### User Tunes In/Out ###
    
	tuneIn(uid,chid):
        REDIS: 
	    SADD chid to uid=>myChannels<{uid}>
		SADD uid to chid=>myListeners<{chid}>

        MONGO: add {user:uid, channel:cid} to the tune in network
	                   if REDIS returns True, increment the myListenersCount for chid
	
	tuneOut(uid,chid):
        REDIS: 
		SREMOVE chid from uid=>myChannels<{uid}>
	    SREMOVE uid from chid=>myListeners<{chid}>

        MONGO: remove {user:uid, channel:cid} from the tune in network
	                   if REDIS returns True, decrement the myListenersCount for chid
	
### User Reports Location ###

    reportLocation(tc,uid)
		lastVisitTime = lastVisitTime<tc:uid>
		updatedChannels = SELECT(activeChannels<tc> SINCE lastVisitTime)
		blips = SET({})
		FOREACH (channel in updatedChannels)
			blips += SELECT(blips<tc:channel> SINCE lastVisitTime) 

	    newChannels = SETDIFFERENCE(activeChannels<tc>, seenChannelsAtTile<tc:uid>)
		FOREACH (channel in newChannels)		
			blips += blips<tc:channel>

	    PUSH(blips, ONTO incomingBlips<uid>)
	    TRUNCATE(incomingBlips<uid>, xxx)
		
	    previousTile = currentTile<{uid}>
		SREMOVE(uid, visitingUsers<{previousTile}>)
		SADD(uid,visitingUsers<{tc}>)

		lastVisitTime<tc:uid> = now

### Broadcast ###

	broadcast(blid,expiration,tc,chid_1,...,chid_n)
	    ZADD(expiration,[blid,tc,chid_1,...,chid_n)

		listeners = SUNION(chid=>myListeners<{chid_1}>, ..., chid=>myListeners<{chid_n}>)
	    visitors = tc=>visitingUsers<{tc}>
		usersToNotify = SINTERSECTION(listeners, visitors)

	    FOR (chid from chid_1 to chid_n)
		   ZADD (blips<tc:chid>, now, blid)
		   ZADD(activeChannels<tc>, now, chid)
	    
	    FOREACH (user in usersToNotify)
		   reportLocation(tc,user)

### Expiration ###

	expire()  // run every n minutes
		expiredBlips = ZRANGEBYSCORE(expiringBlips, -inf, now)
		FOREACH ([blid,tc,chid_1,...,chid_n] in expiredBlips)
		    FOREACH(chid in chid_1...chid_n)
   		    	ZREM(blips<{tc}:{chid}>, blid)
			    IF ZREVRANK(blips<{tc}:{chid}>)==0:
				    newTopTime = ZREVRANGE(blips<{tc}:{chid}>,0,1,WITHSCORES)
					activeChannels<{tc}>


    tc=>popularChannels<{tc}> ===> ZSET(popularity,chid) 
Description: The list of channels in order of popularity (TBD - for now, # of TuneIns) at a tileCode

    tc=>lastChannelTime<{tc}> ===> ZSET(lastBlipTime,chid) 
Description: Orders channelIds by latest Blip times, so that all channels which have been modified past a certain date can be retrieved.  



Questionable:
    tc=>lastFBUpdate<{tc}> ===> integer
Description: The last time the Facebook Place data at a particular tileCode was updated
