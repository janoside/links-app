export HOME=/home/ubuntu/

HOST=localhost

# DB name
DBNAME=quotes

# S3 bucket name
BUCKET_WITH_PREFIX=quotes.cool/backups

# Linux user account
USER=root

# Current time
TIME=`/bin/date +%d-%m-%Y-%T`

# Backup directory
DEST=/root/quotes.cool-mongodb-backups/

# Tar file of backup directory
TAR=$DEST/$TIME.tgz

# Create backup dir (-p to avoid warning if already exists)
mkdir -p $DEST

# Log
echo "Backing up $HOST/$DBNAME to s3://$BUCKET_WITH_PREFIX/ on $TIME";

# Dump from mongodb host into backup directory
mongodump -h $HOST -d $DBNAME -o $DEST -u admin -p XXX

# Create tar of backup directory
tar czfv $TAR -C $DEST .

# Upload tar to s3
aws s3 cp $TAR s3://$BUCKET_WITH_PREFIX/

# Remove tar file locally
rm -f $TAR

# Remove backup directory
rm -rf $DEST

# All done
echo "Backup available at https://s3.amazonaws.com/$BUCKET_WITH_PREFIX/$TIME.tgz"
