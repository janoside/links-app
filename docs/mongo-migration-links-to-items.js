// rename: "links" -> "items"
db.links.renameCollection("items", false);

// set all items.version="1.0"
db.items.updateMany({}, {$set:{"version":"1.0"}});

// rename property: item.desc -> item.text
db.items.updateMany({"version":"1.0", "desc": {$exists: true}}, {$rename:{"desc":"text"}});

// set default item.type=link
db.items.updateMany({"version":"1.0", "type":{$exists:false}}, {$set:{"type":"link"}});

// set default item.imageSizes=["w350", "w500"], where applicable
db.items.updateMany({"hasImage":true, "version":"1.0", "imageSizes":{$exists:false}}, {$set:{"imageSizes":["w350", "w500"]}});