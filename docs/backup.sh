# need to know where home is in order to find ~/.aws/credentials
export HOME=/root

HOST=localhost

# DB name
DBNAME=links

# S3 bucket name
BUCKET_WITH_PREFIX=links.rest/backups

# Current time
TIME=`/bin/date +%Y-%m-%d-%T`

# Backup directory
DEST=/root/links-rest-mongodb-backups/

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

# Track the backup size in stats.cool
TAR_FILESIZE=$(stat -c%s "$TAR")
curl -d "name=admin.backup&val=$TAR_FILESIZE" https://stats.cool/api/v1/project/tdqf8sw19c/dataPoint

# Remove tar file locally
rm -f $TAR

# Remove backup directory
rm -rf $DEST

# All done
echo "Backup available at https://s3.amazonaws.com/$BUCKET_WITH_PREFIX/$TIME.tgz"
