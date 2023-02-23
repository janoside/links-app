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

	await mongoClient.createAdminUserIfNeeded(db, appConfig.db.adminUser.username, appConfig.db.adminUser.password);
	await runMigrationsAsNeeded();

	return global.db;
};



const runMigrationsAsNeeded = async () => {
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
		},
		{
			name: "add-user-roles",
			collection: "users",
			filter: { roles: { $exists: false }},
			updateFunc: { $set: { roles: [] }}
		}
	];


	await mongoClient.runMigrationsAsNeeded(db, migrations);
};



module.exports = {
	connect: connect
}