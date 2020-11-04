const MongoClient = require("mongodb").MongoClient;
const appConfig = require("./config.js");
const debug = require("debug");
const crypto = require("crypto");
const passwordUtils = require("./util/password.js");
const utils = require("./util/utils.js");

var debugLog = debug("app:db");
 
// Connection URL
const url = `mongodb://${appConfig.db.host}:${appConfig.db.port}'`
 
// Database Name
const dbName = appConfig.db.name;

var db = null;
 
// Use connect method to connect to the server
MongoClient.connect(url, { useUnifiedTopology: true }, (err, client) => {
	debugLog(`Connected successfully to database`);
 
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
				console.log(err);
			});
		} catch (e) {
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
					name:"username_1",
					key: { "username":1 },
					properties: { unique:true }
				},
				{
					name:"roles_1",
					key: { "roles":1 }
				}
			]
		}
	]
	const existingCollections = await db.listCollections().toArray();
	const existingCollectionNames = collections.map(c => c.name);

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
	var usersExistingIndexNames = await getCollectionIndexes("users");

	neededIndexes.forEach((neededIndex) => {
		if (!usersExistingIndexNames.includes(neededIndex.name)) {
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
	return new Promise((resolve, reject) => {
		let collection = db.collection(collectionName);

		collection.find(query, options).toArray((err, results) => {
			if (err) {
				reject(err);

			} else {
				if (results.length == 1) {
					resolve(results[0]);

				} else if (results.length == 0) {
					resolve(null);

				} else {
					reject("More than 1 result for findObject query.");
				}
			}
		});
	});
}

async function findObjects(collectionName, query, options={}, returnAsArray=true) {
	return new Promise((resolve, reject) => {
		let collection = db.collection(collectionName);

		var cursor = collection.find(query, options);

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

async function insertObjects(collectionName, documents) {
	return new Promise((resolve, reject) => {
		let collection = db.collection(collectionName);

		documents.forEach((doc) => {
			if (!doc.createdAt) {
				doc.createdAt = new Date();
			}

			doc.updatedAt = new Date();
		});

		collection.insertMany(documents, (err, result) => {
			if (err) {
				reject(err);

			} else {
				debugLog(`${collectionName}: inserted ${documents.length} document(s)`);

				resolve(result);
			}
		});
	});
}

async function deleteObject(collectionName, query) {
	return new Promise(async (resolve, reject) => {
		let collection = db.collection(collectionName);

		await collection.deleteOne(query);

		resolve();
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
	insertObjects: insertObjects,
	deleteObject: deleteObject
}