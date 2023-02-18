import subprocess
import tarfile
import os
import os.path
import datetime
import boto3
import logging
import sys
import termcolor
import pathlib

from dotenv import load_dotenv
from botocore.exceptions import ClientError
from termcolor import colored

env_dir = pathlib.Path(__file__).parent.parent.absolute()
env_path = os.path.join(env_dir, ".env")

print(colored(f"\nLoading env file from {env_path}", "cyan"))

load_dotenv(env_path)


# variables
db_username = os.getenv('DB_USERNAME')
db_password = os.getenv('DB_PASSWORD')
db_name = os.getenv('DB_NAME')
server_name = os.getenv('SERVER_NAME')

host = "localhost"
aws_profile = "links-app"
site_name = "links.rest"
s3_bucket = site_name




def upload_file_to_s3(file_name, bucket, object_name=None):
	"""Upload a file to an S3 bucket

	:param file_name: File to upload
	:param bucket: Bucket to upload to
	:param object_name: S3 object name. If not specified then file_name is used
	:return: True if file was uploaded, else False
	"""

	session = boto3.Session(profile_name=aws_profile)
	
	# If S3 object_name was not specified, use file_name
	if object_name is None:
		object_name = os.path.basename(file_name)

	# Upload the file
	s3_client = session.client('s3')

	try:
		response = s3_client.upload_file(file_name, bucket, object_name)

	except ClientError as e:
		logging.error(e)
		return False
	
	return True




# need to know where home is in order to find ~/.aws/credentials
#export HOME=/root


# Current time
time_str = datetime.datetime.now().strftime('%Y-%m-%d-%H%M%S')

# S3 bucket name
s3_path = f"backups/{server_name}/{time_str}.tar.gz"


# Backup directory
base_backup_dir = f"../db-backups/{site_name}"
backup_dir = f'{base_backup_dir}/{time_str}'

# Tar file of backup directory
tar_path = f"{base_backup_dir}/{time_str}.tar.gz"

# Create backup dir (-p to avoid warning if already exists)
result = subprocess.run(f"mkdir -p {backup_dir}", shell=True, stdout=subprocess.PIPE, text=True)



print(colored(f"\nBacking up {host}/{db_name} to s3://{s3_bucket}/{s3_path}", "cyan"))

# Dump from mongodb host into backup directory
cmd = f"mongodump -h {host} -d {db_name} -o {backup_dir} --authenticationDatabase admin -u {db_username} -p {db_password}"
print(colored(f"\nMongo CMD:\n{cmd}\n", "blue"))
result = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, text=True)



print(colored(f"\nMongoDump done. Creating tar...\n", "cyan"))

result = subprocess.run(f'cd {backup_dir}/{db_name}/; tar czfv {time_str}.tar.gz ./*; mv {time_str}.tar.gz ../../; cd -', shell=True, stdout=subprocess.PIPE, text=True)
#subprocess.call(['tar', '-czf', output_filename, file_to_archive])

print(colored(f"\nTar created. Uploading to S3...\n", "cyan"))

# Create tar of backup directory
# COULDN'T GET THIS WORKING, WENT WITH BASH CMD OPTION WHICH IS ALSO LIKELY FASTER
# https://docs.python.org/3/library/tarfile.html
if False:
	with tarfile.open(tar_path, "w:gz") as tar:

		# https://www.geeksforgeeks.org/python-list-files-in-a-directory/
		dir_list = os.listdir(f'{backup_dir}/{db_name}')

		for file in dir_list:
			filepath = f'{backup_dir}/{db_name}/{file}'
			
			print(filepath)
			tar.add(filepath, arcname=os.path.sep)


# Upload tar to s3
upload_file_to_s3(tar_path, s3_bucket, s3_path)

# Track the backup size in stats.cool
#TAR_FILESIZE=$(stat -c%s "$TAR")
#curl -d "name=admin.backup&val=$TAR_FILESIZE" https://stats.cool/api/v1/project/tdqf8sw19c/dataPoint

# Remove tar file locally
subprocess.run(f"rm -f {tar_path}", shell=True, stdout=subprocess.PIPE, text=True)

# Remove backup directory
subprocess.run(f"rm -rf {backup_dir}", shell=True, stdout=subprocess.PIPE, text=True)

# All done
print(colored(f"\nBackup available at https://s3.amazonaws.com/{s3_bucket}/{s3_path}\n", "green"))
