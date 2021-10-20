// rename: "links" -> "items"
db.links.renameCollection("items", false);

// set all items.version="1.0"
db.items.update({}, {$set:{"version":"1.0"}}, false, true);

// rename property: item.desc -> item.text
db.items.update({"version":"1.0", "desc": {$exists: true}}, {$rename:{"desc":"text"}}, false, true);

// set default item.type=link
db.items.update({"version":"1.0", "type":{$exists:false}}, {$set:{"type":"link"}}, false, true);

// set default item.imageSizes=["w350", "w500"], where applicable
db.items.update({"hasImage":true, "version":"1.0", "imageSizes":{$exists:false}}, {$set:{"imageSizes":["w350", "w500"]}}, false, true);