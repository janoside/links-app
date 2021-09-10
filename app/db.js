const MongoClient = require("mongodb").MongoClient;
const MongoObjectID = require("mongodb").ObjectID;
const appConfig = require("./config.js");
const debug = require("debug");
const crypto = require("crypto");
const passwordUtils = require("./util/password.js");
const utils = require("./util/utils.js");

var debugLog = debug("app:db");
 
// Connection URL
var connectionUrl;

if (appConfig.db.username.trim().length > 0) {
	connectionUrl = `mongodb://${appConfig.db.username}:${appConfig.db.password}@${appConfig.db.host}:${appConfig.db.port}`;

} else {
	connectionUrl = `mongodb://${appConfig.db.host}:${appConfig.db.port}`;
}

 
// Database Name
const dbName = appConfig.db.name;

var db = null;

debugLog(`Connecting to database: ${appConfig.db.host}:${appConfig.db.port}`);
 
// Use connect method to connect to the server
MongoClient.connect(connectionUrl, { useUnifiedTopology: true }, (err, client) => {
	if (err) {
		debugLog(`Error connecting to DB: ${err}`);
	}

	debugLog(`Success: Connected to database`);
 
	db = client.db(dbName);

	(async() => {
		try {
			await setupSchema(db);
			
			findObjects("users", {username:"admin", roles:"admin"}).then(async (results) => {
				if (results == null || results.length == 0) {
					var adminPasswordHash = await passwordUtils.hash(appConfig.db.adminUser.password);
					await insertObjects("users", [
						{
							username:appConfig.db.adminUser.username,
							passwordHash: adminPasswordHash,
							roles: ["admin"]
						}
					]);

					debugLog("Admin user created.");

				} else {
					debugLog("Admin user already exists.");
				}
			}).catch((err) => {
				debugLog(err);
				console.log(err);
			});
		} catch (e) {
			debugLog(e);
			console.log(e);
		}
	})();
});

async function setupSchema(db) {
	const collections = [
		{
			name: "users",
			indexes: [
				{
					name: "username_1",
					key: { "username":1 },
					properties: { unique:true }
				},
				{
					name:"roles_1",
					key: { "roles":1 }
				}
			]
		},
		{
			name: "links",
			indexes: [
				{
					name: "userId_1",
					key: { "userId": 1 }
				},
				{
					name: "username_1",
					key: { "username": 1 }
				},
				{
					name: "date_1",
					key: { "date": 1 }
				},
				{
					name: "desc_1",
					key: { "desc": 1}
				},
				{
					name: "tags_1",
					key: { "tags": 1}
				}
			]
		}
	];

	const existingCollections = await db.listCollections().toArray();
	const existingCollectionNames = existingCollections.map(c => c.name);

	debugLog("Existing collections: " + JSON.stringify(existingCollectionNames));

	collections.forEach(async (collection) => {
		if (!existingCollectionNames.includes(collection.name)) {
			debugLog(`setupSchema: creating collection '${collection.name}'`);
	
			await db.createCollection(collection.name);

		} else {
			debugLog(`setupSchema: collection '${collection.name}' already exists`)
		}

		await setupCollectionIndexes(collection.name, collection.indexes);
	});
}

async function setupCollectionIndexes(collectionName, neededIndexes) {
	var existingIndexNames = await getCollectionIndexes(collectionName);

	neededIndexes.forEach((neededIndex) => {
		if (!existingIndexNames.includes(neededIndex.name)) {
			debugLog(`setupSchema: ${collectionName}.index[${neededIndex.name}] being created`);

			db.collection(collectionName).createIndex( neededIndex.key, neededIndex.properties);

		} else {
			debugLog(`setupSchema: ${collectionName}.index[${neededIndex.name}] already exists`);
		}
	});
}

async function getCollectionIndexes(collectionName) {
	const cursor = await db.collection(collectionName).listIndexes();
	var existingIndexNames = [];

	while (await cursor.hasNext()) {
		const existingIndex = await cursor.next();
		
		if (existingIndex != null && existingIndex.name != null) {
			existingIndexNames.push(existingIndex.name);
		}
	}

	return existingIndexNames;
}

async function findObject(collectionName, query, options={}) {
	var objects = await findObjects(collectionName, query, options);

	return objects[0];
}

async function findObjects(collectionName, query, options={}, limit=-1, offset=0, returnAsArray=true) {
	return new Promise((resolve, reject) => {
		let collection = db.collection(collectionName);

		var cursor = collection.find(query, options);

		if (offset > 0) {
			cursor.skip(offset);
		}

		if (limit > 0) {
			cursor.limit(limit);
		}

		if (returnAsArray) {
			cursor.toArray((err, results) => {
				if (err) {
					reject(err);
	
				} else {
					resolve(results);
				}
			});
		} else {
			resolve(cursor);
		}
	});
}

async function insertObject(collectionName, document) {
	var insertedObjectIds = await insertObjects(collectionName, [document]);

	return insertedObjectIds[0];
}

async function insertObjects(collectionName, documents) {
	let collection = db.collection(collectionName);

	documents.forEach((doc) => {
		if (!doc.createdAt) {
			doc.createdAt = new Date();
		}

		doc.updatedAt = new Date();
	});

	const result = await collection.insertMany(documents);

	var insertedObjectIds = [];
	for (var i = 0; i < result.insertedCount; i++) {
		insertedObjectIds.push(result.insertedIds[`${i}`]);
	}

	debugLog(`${collectionName}: inserted ${result.insertedCount} document(s)`);

	return insertedObjectIds;
}

async function deleteObject(collectionName, query) {
	return new Promise(async (resolve, reject) => {
		let collection = db.collection(collectionName);

		var result = await collection.deleteOne(query);

		resolve(result);
	});
}

async function getCollection(collectionName) {
	return new Promise(async (resolve, reject) => {
		resolve(db.collection(collectionName));
	});
}


module.exports = {
	getCollection: getCollection,
	findObject: findObject,
	findObjects: findObjects,
	insertObject: insertObject,
	insertObjects: insertObjects,
	deleteObject: deleteObject
}