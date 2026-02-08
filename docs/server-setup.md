# Server Setup

(Start with Ubuntu 24 image)


Basic setup

	apt update
	apt upgrade
	
	# install NodeVersionManager (nvm)
	curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash
	
	# install misc tools
	apt install net-tools iotop ncdu unzip
	
	# install npm, nginx, certbot
	apt install nginx python3-certbot-nginx python3-certbot-dns-route53
	
	# install pm2
	npm install -g pm2
	
	ssh-keygen -b 4096
	# upload ~/.ssh/id_rsa.pub to github
	
	# set hostname
	hostnamectl set-hostname XXX_HOSTNAME

	# increase open files limit
	vim /etc/security/limits.conf
	# add:
	# root            soft    nofile          262143
	# root            hard    nofile          262143
	vim /etc/pam.d/common-session
	# add:
	# session required pam_limits.so
	# logout, log back in...
	ulimit -n

Install MongoDB

	# ref https://www.mongodb.com/docs/v8.0/tutorial/install-mongodb-on-ubuntu/
	curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | \
		sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg \
		--dearmor

	echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
	
	apt update
	sudo apt-get install -y mongodb-org
	systemctl start mongod

Configure MongoDB

	# configure admin user and enable authentication
	# ref: https://www.digitalocean.com/community/tutorials/how-to-secure-mongodb-on-ubuntu-20-04
	# ref2 (for 4 superuser roles): https://stackoverflow.com/questions/22638258/create-superuser-in-mongo
	
	mongosh   # launches mongo shell
	  
	mongosh >
	{
	use admin
	
	let p = "TYPE/PASTE PASSWORD FOR admin HERE" # this is to get around a situation where pasted text includes "bracketed paste mode special characters"
	db.createUser({user: "admin", pwd: p, roles: [{ role: "userAdminAnyDatabase", db: "admin" }, { role: "readWriteAnyDatabase", db: "admin" }, { role: "dbAdminAnyDatabase", db: "admin" }, { role: "clusterAdmin", db: "admin" }]})
	
	let p = "TYPE/PASTE PASSWORD FOR backups HERE"
	db.createUser({user: "backups", pwd: p, roles: [{ role: "readAnyDatabase", db: "admin" }]})
	exit
	}
	  
	vim /etc/mongod.conf
	# uncomment the `security:` prompt
	# add the line `authorization: "enabled"` (indented 2 spaces) underneath `security:`
	service mongod restart
	  
	# verify authentication is enabled
	mongosh   # launches mongo shell
	
	mongosh > show databases; # should return no results since default mongo user has no permissions
	mongosh > exit
	
	mongosh -u admin -p
	

Clone and Start

	git clone https://github.com/janoside/links-app links.rest
	cd links-app
	git submodule update --init --recursive
	npm i
	pm2 start bin/main.js --name links

Certbot

	certbot certonly --dns-route53 -d links.rest

Configure Nginx

	ln -s /root/links.rest/conf/nginx.conf /etc/nginx/sites-available/links.rest
	ln -s /etc/nginx/sites-available/links.rest /etc/nginx/sites-enabled/links.rest
	unlink default
	service nginx restart
	  
Configure Backups

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
	# edit backup.sh:
	# enter mongodb "backups" user password and AWS profile name (from ~/.aws/credentials file)
	
	crontab -e
	# configuration helper: https://crontab.guru/
	# add line like below (run every 3 hrs, 17-min after the hour)
	# 5 0,12 * * * /root/links-app/backup.sh > /root/links-app/backup.log 2>&1

