// set default item.imageSizes=["w350", "w500"], where applicable
db.items.updateMany({"type":"note", "textType":{$exists:false}}, {$set:{"textType":"markdown"}});