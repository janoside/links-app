# Server Setup

(Using digital ocean)

* Start with Ubuntu 20.04 image

	  apt update
	  apt upgrade
	  
	  # install misc tools
	  apt install net-tools iotop ncdu unzip
	  
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
	  # ref2 (for 4 superuser roles): https://stackoverflow.com/questions/22638258/create-superuser-in-mongo
	  mongo   # launches mongo shell
	  
	  mongo > use admin
	  mongo > db.createUser({user: "admin", pwd: passwordPrompt(), roles: [{ role: "userAdminAnyDatabase", db: "admin" }, { role: "readWriteAnyDatabase", db: "admin" }, { role: "dbAdminAnyDatabase", db: "admin" }, { role: "clusterAdmin", db: "admin" }]})
	  mongo > db.createUser({user: "backups", pwd: passwordPrompt(), roles: [{ role: "readAnyDatabase", db: "admin" }]})
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
	  
	  git clone git@github.com:janoside/links-app.git
	  cd links-app
	  npm i
	  pm2 start bin/main.js --name links
	  
	  wget "https://raw.githubusercontent.com/janoside/links-app/master/docs/nginx-config.txt"
	  mv nginx-config.txt /etc/nginx/sites-available/links.rest
	  cd /etc/nginx/sites-enabled/
	  certbot -d links.rest
	  ln -s ../sites-available/links.rest .
	  unlink default
	  service nginx restart
	  
### Backups

	  Ref: https://www.cloudsavvyit.com/6059/how-to-set-up-automated-mongodb-backups-to-s3/
	  
	  # Install AWS CLI
	  # ref: https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2-linux.html
	  curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
	  unzip awscliv2.zip
	  rm awscliv2.zip
	  ./aws/install
	  aws --version
	  aws configure # enter AWS credentials
	  
	  wget "https://raw.githubusercontent.com/janoside/links-app/master/docs/backup.sh"
	  # edit backup.sh - enter credentials for "backups" db user
	  
	  crontab -e
	  # configuration helper: https://crontab.guru/
	  # add line like below (run every 3 hrs, 17-min after the hour)
	  # 17 */3 * * * /root/backup.sh > /root/backup.log 2>&1


### Cleanup

* Uninstall mongodb

      service mongod stop
	  apt-get purge mongodb-org*
	  rm -r /var/log/mongodb
	  rm -r /var/lib/mongodb
