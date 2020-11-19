# need to know where home is in order to find ~/.aws/credentials
export HOME=/root

HOST=localhost

# DB name
DBNAME=quotes

# S3 bucket name
BUCKET_WITH_PREFIX=quotes.cool/backups

# Current time
TIME=`/bin/date +%d-%m-%Y-%T`

# Backup directory
DEST=/root/quotes.cool-mongodb-backups/

# Tar file of backup directory
TAR=$DEST/$TIME.tgz

# Create backup dir (-p to avoid warning if already exists)
mkdir -p $DEST

# Log
echo "Backing up $HOST/$DBNAME to s3://$BUCKET_WITH_PREFIX/ at $TIME";

# Dump from mongodb host into backup directory
mongodump -h $HOST -d $DBNAME -o $DEST --authenticationDatabase admin -u backups -p BACKUPS_USER_PASSWORD

# Create tar of backup directory
tar czfv $TAR -C $DEST .

# Upload tar to s3
/usr/local/bin/aws s3 cp $TAR s3://$BUCKET_WITH_PREFIX/

# Remove tar file locally
rm -f $TAR

# Remove backup directory
rm -rf $DEST

# All done
echo "Backup available at https://s3.amazonaws.com/$BUCKET_WITH_PREFIX/$TIME.tgz"
