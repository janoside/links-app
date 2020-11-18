# Server Setup

(Using digital ocean)

* Start with Ubuntu 20.04 image

	  apt update
	  apt upgrade
	  
	  # install misc tools
	  apt install net-tools iotop ncdu
	  
	  # install npm, nginx, certbot
	  apt install npm nginx certbot python3-certbot-nginx
	  
	  # install mongodb
	  # ref: https://docs.mongodb.com/manual/tutorial/install-mongodb-on-ubuntu/
	  wget -qO - https://www.mongodb.org/static/pgp/server-4.4.asc | sudo apt-key add -
	  echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/4.4 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-4.4.list
	  apt update
	  apt-get install -y mongodb-org
	  systemctl start mongod
	  
	  # configure admin user and enable authentication
	  # ref: https://www.digitalocean.com/community/tutorials/how-to-secure-mongodb-on-ubuntu-20-04
	  mongo   # launches mongo shell
	  
	  mongo > use admin
	  mongo > db.createUser({user: "admin", pwd: passwordPrompt(), roles: [ { role: "userAdminAnyDatabase", db: "admin" } ]})
	  mongo > exit
	  
	  vim /etc/mongod.conf
	  # uncomment the `security:` prompt
	  # add the line `authorization: "enabled"` (indented 2 spaces) underneath `security:`
	  service mongod restart
	  
	  # verify authentication is enabled
	  mongo   # launches mongo shell
	  
	  mongo > show databases; # should return no results since default mongo user has no permissions
	  mongo > exit
	  
	  mongo -u admin -p
	  
	  # install pm2
	  npm install -g pm2
	  
	  ssh-keygen -b 4096
	  
	  # upload ~/.ssh/id_rsa.pub to github
	  
	  git clone git@github.com:janoside/quotes.cool.git
	  cd quotes.cool
	  npm i
	  pm2 start bin/main.js --name quotes
	  
	  wget "https://raw.githubusercontent.com/janoside/quotes.cool/master/docs/nginx-config.txt"
	  mv nginx-config.txt /etc/nginx/sites-available/quotes.cool
	  cd /etc/nginx/sites-enabled/
	  certbot -d quotes.cool
	  ln -s ../sites-available/quotes.cool .
	  unlink default
	  service nginx restart


### Cleanup

* Uninstall mongodb

      service mongod stop
	  apt-get purge mongodb-org*
	  rm -r /var/log/mongodb
	  rm -r /var/lib/mongodb
