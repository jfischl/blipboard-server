Scripts
=====

A set of scripts for testing the api against your local mongo instance
is provided in the scripts/ directory. 

dnode 
-----
Ensures node-inspector is running, starts a script with --debug and
opens a debugging window in a WebKit-based browser (you need Chrome or
Safari as your default browser for this to work). Use just like node.

usage: 
  dnode  [options] [ -e script | script.js ] [arguments] 

dsupervisor
-----------
Just like dnode, but uses node-supervisor instead of node to run
script.  Use just like node-supervisor.

usage: 
  dsupervisor [options] <program>
  dsupervisor [options] -- <program> [args ...]
  
dmocha            
------
Starts mocha with --debug-brk flag, and sets up the debugging
environment just like dnode and dsupervisor.  Use just like mocha.

usage:
  dmocha [debug] [options] [files]
  
pairwise_mocha.py
------------------

wsd
---
Creates a .svg file from a wsd file (web sequence diagram) using the
websequencediagram.com API.  Saves the .svg file to the same location
as the input file if not provided.  Also automatically opens the SVG file.

usage:
  wsd input.wsd [outputfile]

Blipboard Scripts
-----------------
### .user.login ###
Hidden file in scripts/ which holds the userId:password of the current
logged in user, a default value used by various bXXXX.sh scripts.

### bsetupusers.sh ###
Creates N anonymous users using the REST API.  Writes a script
buservars.sh (see below).  Sets the current logged in user by saving
the first user id/pwd into the file .user.login, which is used by
other bscripts. 

usage:
  bsetupusers.sh N

### buservars.sh ### 
Load user ids and passwords into environment variables.  Named
user1,pwd1...userN,pwdN.  

usage:
  . buservars.sh

### bcreateuser.sh ### 
Calls the localhost:3000 API to create a single anonymous user.

usage:
  bcreateuser.sh
  
### blogin.sh ### 
Sets the current logged in user.  (Saves the user id and password for the default user into .user.login.)

usage:
  blogin.sh userId password
  
### blogout.sh ###
Forgets the current logged in user. (I.e., rm .user.login)

usage:
  blogout.sh
  
### btunein.sh ### 
Tunes a user into a channel.  If no --user is provided, current logged
in user is assumed.

usage:
  btunein.sh [-u userId] channelId
  
### btuneout.sh ### 
Tunes a user out of a channel.  If no --user is provided, current logged
in user is assumed.

usage:
  btuneout.sh [-u userId] channelId

### bgetchannels.sh ### 
Searches for channels of a type near a location.  Many defaults are
provided: 
   -c = lat,lng (default = a location near Castro St, SF, CA)
   -u = current logged in user
   -t = channel type (default place)
usage: bgetchannels.sh [-c latitude,longitude] [-u username:password] [-t type]

### bfind.js ### 
A thin wrapper around mongodb's collection.find:

usage:
  bfind.js collection \"criterion\"
  
e.g., 
  bfind.js channels \"{type:\'place\'}\"
  bfind.js channels \"{type:\'ObjectId('111111111111111111111111')\'}\"


