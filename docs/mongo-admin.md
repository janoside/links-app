# Mongo Administration

### restore bson/metadata.json files in a directory:

    mongorestore --host localhost --port 27017 \
      --username admin \
      --authenticationDatabase admin \
      --nsInclude "DATABASE_NAME_EVEN_IF_NONEXISTENT.*" path/to/bson/directory/ \
      -p ""

