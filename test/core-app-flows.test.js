const test = require("node:test");
const assert = require("node:assert/strict");

const appConfig = require("../app/config.js");
const coreApp = require("../app/app.js");

const createBaseFakeDb = () => ({
	findOne: async () => null,
	findMany: async () => [],
	insertOne: async () => null,
	updateOne: async () => ({ modifiedCount: 0 }),
	deleteMany: async () => ({ deletedCount: 0 }),
	deleteOne: async () => ({ deletedCount: 0 })
});

const createPassthroughEncryptor = () => ({
	encrypt: (buffer) => buffer,
	decrypt: (buffer) => buffer
});

test("createOrUpdateItem creates a note with normalized tags using fake DB", async (t) => {
	const insertCalls = [];
	const fakeDb = createBaseFakeDb();
	fakeDb.insertOne = async (collection, document) => {
		assert.equal(collection, "items");
		document._id = "item-1";
		insertCalls.push(document);
		return document._id;
	};

	const fakeS3Bucket = {
		put: async () => {
			throw new Error("S3 should not be used for note-only createOrUpdateItem");
		},
		get: async () => {
			throw new Error("S3 should not be used for note-only createOrUpdateItem");
		},
		del: async () => {
			throw new Error("S3 should not be used for note-only createOrUpdateItem");
		}
	};

	coreApp.__setTestDependencies({
		db: fakeDb,
		encryptor: createPassthroughEncryptor(),
		s3Bucket: fakeS3Bucket
	});

	t.after(() => {
		coreApp.__resetTestDependencies();
		delete global.db;
	});

	const createdItem = await coreApp.createOrUpdateItem(
		null,
		"user-123",
		"alice",
		"note",
		{
			text: "hello test infra",
			tags: "  Work,Personal "
		}
	);

	assert.equal(insertCalls.length, 1);
	assert.equal(createdItem._id, "item-1");
	assert.equal(createdItem.userId, "user-123");
	assert.equal(createdItem.username, "alice");
	assert.equal(createdItem.type, "note");
	assert.deepEqual(createdItem.tags, ["work", "personal"]);
	assert.equal(createdItem.text, "hello test infra");
});

test("getItemFileData reads from fake S3 and fake decryptor", async (t) => {
	let requestedPath = null;
	const fakeDb = createBaseFakeDb();
	const fakeS3Bucket = {
		put: async () => {},
		get: async (path) => {
			requestedPath = path;
			return Buffer.from("encrypted-binary");
		},
		del: async () => {}
	};

	coreApp.__setTestDependencies({
		db: fakeDb,
		s3Bucket: fakeS3Bucket,
		encryptor: {
			encrypt: (buffer) => buffer,
			decrypt: () => Buffer.from("decrypted file body")
		}
	});

	t.after(() => {
		coreApp.__resetTestDependencies();
		delete global.db;
	});

	const result = await coreApp.getItemFileData({
		_id: "item-7",
		fileMetadata: { mimeType: "text/plain" }
	});

	assert.equal(requestedPath, "file/item-7");
	assert.equal(result.contentType, "text/plain");
	assert.equal(result.dataBuffer.toString("utf8"), "decrypted file body");
	assert.equal(result.byteSize, "decrypted file body".length);
});

test("deleteUserAccount removes related image/file paths using fake S3", async (t) => {
	const originalWidths = [...appConfig.images.widths];
	appConfig.images.widths = [350, 500];

	const s3Deletes = [];
	const deleteManyCalls = [];
	const deleteOneCalls = [];

	const fakeDb = createBaseFakeDb();
	fakeDb.findMany = async (collection, query) => {
		assert.equal(collection, "items");
		assert.deepEqual(query, { userId: "user-42" });

		return [
			{ _id: "item-a", hasImage: true, imageSizes: ["w350"], hasFile: true },
			{ _id: "item-b", hasImage: true, hasFile: false },
			{ _id: "item-c", hasImage: false, hasFile: true }
		];
	};
	fakeDb.deleteMany = async (collection, query) => {
		deleteManyCalls.push({ collection, query });
		return { deletedCount: 3 };
	};
	fakeDb.deleteOne = async (collection, query) => {
		deleteOneCalls.push({ collection, query });
		return { deletedCount: 1 };
	};

	const fakeS3Bucket = {
		put: async () => {},
		get: async () => null,
		del: async (path) => {
			s3Deletes.push(path);
		}
	};

	coreApp.__setTestDependencies({
		db: fakeDb,
		encryptor: createPassthroughEncryptor(),
		s3Bucket: fakeS3Bucket
	});

	t.after(() => {
		coreApp.__resetTestDependencies();
		appConfig.images.widths = originalWidths;
		delete global.db;
	});

	const result = await coreApp.deleteUserAccount("user-42");

	assert.deepEqual(s3Deletes, [
		"img/item-a/w350",
		"file/item-a",
		"img/item-b/raw",
		"img/item-b/w350",
		"img/item-b/w500",
		"file/item-c"
	]);

	assert.deepEqual(deleteManyCalls, [
		{
			collection: "items",
			query: { userId: "user-42" }
		}
	]);

	assert.deepEqual(deleteOneCalls, [
		{
			collection: "users",
			query: { _id: "user-42" }
		}
	]);

	assert.equal(result.itemsDeleteResult.deletedCount, 3);
	assert.equal(result.userDeleteResult.deletedCount, 1);
});
