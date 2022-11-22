import subprocess
import tarfile
import os
import os.path
import datetime
import boto3
import logging
import termcolor

from dotenv import load_dotenv
from botocore.exceptions import ClientError
from termcolor import colored

load_dotenv()




#print(termcolor.COLORS)



# variables
db_username = os.getenv('DB_USERNAME')
db_password = os.getenv('DB_PASSWORD')

host = "localhost"
aws_profile = "links-app"
site_name = "links.rest"
s3_bucket = site_name
restore_dir = "temp/db-restore/"


print(colored("\nWhich server do you want to restore from? ", "cyan"))
server_name = input()

s3_prefix = f"backups/{server_name}/"


# Note: this is the "target" db name, the db that will be restored *to*
print(colored("\nEnter the database name you want to restore TO:", "cyan"))
db_name = input()



result = subprocess.run(f"mkdir -p {restore_dir};", shell=True, stdout=subprocess.PIPE, text=True)


print(colored(f"\nSearching for backups...", "cyan"))

session = boto3.Session(profile_name=aws_profile)
s3 = session.resource('s3')
bucket = s3.Bucket(s3_bucket)

keys = []
for object_summary in bucket.objects.filter(Prefix=s3_prefix):
	if (object_summary.key.endswith(".tar.gz")):
		keys.append(object_summary.key)


keys.sort()

print(colored(f"\nFound {len(keys)} backup(s)", "green"))

latest_key = keys[-1]
latest_key_filename = latest_key[len(s3_prefix):]




print(colored(f"\nDownloading latest backup {latest_key} to {restore_dir}...\n", "cyan"))

s3 = session.client('s3')
s3.download_file(s3_bucket, latest_key, f'{restore_dir}{latest_key_filename}')
print(colored("Done", "green"))



print(colored("\nBackup downloaded, unpacking...\n", "cyan"))

result = subprocess.run(f'cd {restore_dir}; tar xzfv {latest_key_filename};', shell=True, stdout=subprocess.PIPE, text=True)




print(colored(f"\nRestoring to DB {db_name}...", "cyan"))

# Dump from mongodb host into backup directory
cmd = f'mongorestore -v -h {host} -d {db_name} --dir {restore_dir} --authenticationDatabase admin -u {db_username} -p {db_password}'
print(colored(f"\nMongo CMD:\n{cmd}\n", "blue"))
result = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, text=True)


print(colored(f"\nCleaning up...", "cyan"))
result = subprocess.run(f'rm -rf {restore_dir};', shell=True, stdout=subprocess.PIPE, text=True)
print(colored(f"\nDone", "green"))


# All done
print(colored(f"\nRestored from https://s3.amazonaws.com/{s3_bucket}/{latest_key}\n", "green"))
