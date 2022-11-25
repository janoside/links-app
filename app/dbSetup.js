const debug = require("debug");

const appConfig = require("./config.js");

const appUtils = require("./app-utils");
const passwordUtils = appUtils.passwordUtils;

const mongoClient = appUtils.mongoClient;



var debugLog = debug("app:db");
 


const dbConfig = appConfig.db;

const dbSchema = [
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
		name: "items",
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
				name: "text_1",
				key: { "text": 1}
			},
			{
				name: "tags_1",
				key: { "tags": 1}
			},
			{
				name: "type_1",
				key: { "type": 1}
			}
		]
	},
	{
		name: "dataMigrations",
		indexes: [
			{
				name: "name_1",
				key: { "name":1 },
				properties: { unique:true }
			}
		]
	},
];


const connect = async () => {
	global.db = await mongoClient.createClient(dbConfig.host, dbConfig.port, dbConfig.username, dbConfig.password, dbConfig.name, dbSchema);

	await createAdminUserIfNeeded();
	await runMigrationsAsNeeded();

	return global.db;
};

const createAdminUserIfNeeded = async () => {
	// create admin user if needed
	const adminUser = await db.findOne("users", {username: appConfig.db.adminUser.username});
	if (!adminUser) {
		debugLog(`Creating admin user '${appConfig.db.adminUser.username}'...`);

		const passwordHash = await passwordUtils.hash(appConfig.db.adminUser.password);

		const adminUser = {
			username: appConfig.db.adminUser.username,
			passwordHash: passwordHash,
			roles: ["admin"]
		};

		await db.insertOne("users", adminUser);

		debugLog(`Admin user '${appConfig.db.adminUser.username}' created.`);

	} else {
		debugLog(`Admin user '${appConfig.db.adminUser.username}' already exists`);
	}
};



const runMigrationsAsNeeded = async () => {
	const migrateCollection = async (migrationName, collectionName, filter, updateFunc) => {
		const collection = await db.getCollection(collectionName);

		const objs = await db.findMany(collectionName, filter);
		
		debugLog(`Preparing migration '${migrationName}': filter=${JSON.stringify(filter)}, updateFunc=${JSON.stringify(updateFunc)}`);
		debugLog(`Running migration '${migrationName}' on ${objs.length} object(s)...`);

		const updateResult = await collection.updateMany(filter, updateFunc);

		debugLog(`Migration '${migrationName}' done: ${JSON.stringify(updateResult)}`)
		
		/*for (let i = 0; i < objs.length; i++) {
			if (i % 1 == 0) {
				debugLog(`Migration '${migrationName}' update: done with ${i + 1} objects...`);
			}

			
		}*/
	};

	const migrations = [
		// example of how to add a property
		/*{
			name: "addTestPropA",
			collection: "items",
			filter: { hasImage: true },
			updateFunc: {$set: {testXyz:"123"}}
		},*/
		
		// example of how to remove a property
		/*{
			name: "removeTestPropA",
			collection: "items",
			filter: { },
			updateFunc: {$unset: {testXyz:""}}
		},*/

		{
			name: "addDefaultImageSizes",
			collection: "items",
			filter: { hasImage: true, imageSizes: { $exists: false } },
			updateFunc: { $set: { imageSizes:["w350", "w500"] } }
		}
	];

	for (let i = 0; i < migrations.length; i++) {
		const migration = migrations[i];

		const dataMigrationsCollection = await db.getCollection("dataMigrations");
		
		let dataMigration = await db.findOne("dataMigrations", {name:migration.name});
		if (!dataMigration) {
			await migrateCollection(migration.name, migration.collection, migration.filter, migration.updateFunc);

			dataMigration = {
				name: migration.name
			};

			await db.insertOne("dataMigrations", dataMigration);

		} else {
			debugLog(`Migration '${migration.name}' already done.`);
		}
	}
};



module.exports = {
	connect: connect
}