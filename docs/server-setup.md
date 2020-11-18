# Server Setup

(Using digital ocean)

* Start with Ubuntu 20.04 image

      apt update
	  apt upgrade
	  
	  # install misc tools
	  apt install net-tools iotop ncdu
	  
	  # install npm
	  apt install npm
	  
	  # install mongodb
	  # ref: https://docs.mongodb.com/manual/tutorial/install-mongodb-on-ubuntu/
	  wget -qO - https://www.mongodb.org/static/pgp/server-4.4.asc | sudo apt-key add -
	  echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/4.4 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-4.4.list
	  apt update
	  apt-get install -y mongodb-org
	  systemctl start mongod
	  
	  # configure admin user and enable authentication
	  mongo   # launches mongo shell
	  
	  mongo > use admin
	  mongo > db.createUser({user: "admin", pwd: passwordPrompt(), roles: [ { role: "userAdminAnyDatabase", db: "admin" } ]})
	  mongo > exit
	  
	  vim /etc/mongod.conf
	  # uncomment the `security:` prompt
	  # add the line `authorization: "enabled"` (indented 2 spaces) underneath `security:`
	  service mongod restart


### Cleanup

* Uninstall mongodb

      service mongod stop
	  apt-get purge mongodb-org*
	  rm -r /var/log/mongodb
	  rm -r /var/lib/mongodb
