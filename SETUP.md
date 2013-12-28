##install emacs

##install Homebrew 

    https://github.com/mxcl/homebrew/wiki/installation
    don't worry about installing the Java developer update

##install node.js  - this step should not be necessary

    http://nodejs.org/#download

##install npm modules for testing

    $ sudo npm install -g supervisor mocha node-inspector

##install mongoDB

    $ sudo brew install mongodb
    $ sudo mkdir -p /data/db/
    $ sudo chown `id -u` /data/db

add to your ~/.bash_profile

    $ export MONGO_URL=mongodb://localhost:27017/blipboard


##setup heroku

For overview, http://devcenter.heroku.com/articles/node-js

    create heroku account https://api.heroku.com/signup
    ask admin to add you to blipboard heroku app
    install heroku http://toolbelt.herokuapp.com/osx/download
    install foreman http://assets.foreman.io/foreman/foreman.pkg

##create facebook developer account

visit https://developers.facebook.com/apps and create new app

add to ~/.bash_profile:

    export FACEBOOK_BLIPBOARD_ID=appid
    export FACEBOOK_BLIPBOARD_SECRET=appsecret

##setup bash for git state

add to ~/.bash_profile:

    GIT_PS1_SHOWDIRTYSTATE="1"
    export PS1='\[\033]0;\u@\h \007\]\[\e[1;32m\]\u@\h:\[\e[1;36m\]\w\[\033[31m\]$(__git_ps1 "(%s)")\[\e[0m\]$ '
    export CLICOLOR=1
    export LSCOLORS=GxFxCxDxBxegedabagacad

##checkout server code

    $ git clone git@github.com:amallavarapu/blipboard.git blipboard-server
    $ heroku login

