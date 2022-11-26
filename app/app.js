const debug = require("debug");
const crypto = require("crypto");
const { DateTime } = require("luxon");
const sharp = require("sharp");
const ObjectId = require("mongodb").ObjectId;
const axios = require("axios");

const appConfig = require("./config.js");

const appUtils = require("./app-utils");
const utils = appUtils.utils;
const passwordUtils = appUtils.passwordUtils;
const encryptionUtils = appUtils.encryptionUtils;
const s3Utils = appUtils.s3Utils;

const encryptor = encryptionUtils.encryptor(appConfig.encryptionPassword, appConfig.pbkdf2Salt);
const s3Bucket = s3Utils.createBucket(appConfig.s3Bucket, appConfig.s3PathPrefix);

const debugLog = debug("app:main");


async function authenticate(username, password, passwordPreHashed=false) {
	var user = await db.findOne("users", {username:username});

	if (user == null) {
		debugLog(`User authentication failed: ${username} doesn't exist`);

		return null;
	}

	var passwordMatch = false;
	if (passwordPreHashed) {
		passwordMatch = (password == user.passwordHash);

	} else {
		passwordMatch = await passwordUtils.verify(password, user.passwordHash);
	}

	if (!passwordMatch) {
		debugLog(`User authentication failed: ${username} - password mismatch`);

		return null;
	}

	debugLog(`User authenticated: ${username}`);

	return user;
}

async function verifyMultiloginPin(username, multiloginPin, preHashed=false) {
	var user = await db.findOne("users", {username:username});

	if (user == null) {
		debugLog(`User authentication failed: ${username} doesn't exist`);

		return null;
	}

	var pinMatch = false;
	if (preHashed) {
		pinMatch = (multiloginPin == user.multiloginPinHash);

	} else {
		pinMatch = await passwordUtils.verify(multiloginPin, user.multiloginPinHash);
	}

	if (!pinMatch) {
		debugLog(`PIN authentication failed: ${username} - PIN mismatch`);

		return null;
	}

	debugLog(`PIN authenticated: ${username}`);

	return user;
}

async function createOrUpdateItem(existingItemId, userId, username, itemType, fields) {
	//console.log(fields);
	const itemsCollection = await db.getCollection("items");

	let item = null;
	if (existingItemId == null) {
		item = {
			userId: userId,
			username: username,
			type: itemType,
			version: "2.0",
		};

	} else {
		item = await db.findOne("items", {_id:ObjectId(existingItemId)});
	}

	if (fields.url) {
		item.url = fields.url;
	}

	if (fields.text) {
		item.text = fields.text;
	}

	if (fields.tags) {
		item.tags = fields.tags.split(",").map(x => x.trim().toLowerCase());
	}

	if (fields.dueDate) {
		let dueDate = DateTime.fromISO(fields.dueDate);
		
		if (dueDate.invalid) {
			dueDate = DateTime.fromSQL(fields.dueDate);
		}

		if (!dueDate.invalid) {
			item.dueDate = dueDate;
		}
	}

	if (fields.startDate) {
		let startDate = DateTime.fromISO(fields.startDate);
		
		if (startDate.invalid) {
			startDate = DateTime.fromSQL(fields.startDate);
		}

		if (!startDate.invalid) {
			item.startDate = startDate;
		}
	}

	if (fields.endDate) {
		let endDate = DateTime.fromISO(fields.endDate);
		
		if (endDate.invalid) {
			endDate = DateTime.fromSQL(fields.endDate);
		}

		if (!endDate.invalid) {
			item.endDate = endDate;
		}
	}


	let itemId = existingItemId;
	if (existingItemId == null) {
		itemId = await db.insertOne("items", item);

	} else {
		const updateResult = await itemsCollection.updateOne({_id:ObjectId(existingItemId)}, {$set: item});

		debugLog("Updated item " + existingItemId + ": " + JSON.stringify(updateResult));
	}
	
	
	if (fields.img && fields.imgUrl) {
		throw new Error("Use image file OR image URL, not both.");
	}

	if (fields.file && fields.fileUrl) {
		throw new Error("Use file OR file URL, not both.");
	}

	if (fields.img) {
		debugLog("Uploaded image file: " + utils.descBuffer(fields.img, "base64"));
	}

	if (fields.file) {
		debugLog("Uploaded file: " + utils.descBuffer(fields.file, "base64"));
	}

	if (fields.imgUrl) {
		const response = await axios.get(fields.imgUrl, { responseType: 'arraybuffer' });
		fields.img = Buffer.from(response.data, "binary");

		debugLog("Downloaded image: " + utils.descBuffer(fields.img) + ", from URL: " + fields.imgUrl);
	}

	if (fields.fileUrl) {
		const response = await axios.get(fields.fileUrl, { responseType: 'arraybuffer' });
		fields.file = Buffer.from(response.data, "binary");

		debugLog("Downloaded file: " + utils.descBuffer(fields.file) + ", from URL: " + fields.fileUrl);
	}

	if (fields.img) {
		const processedImageSizes = await processAndUploadImages(fields.img, itemId);

		item.hasImage = true;
		item.imageSizes = processedImageSizes;

		const updateResult = await itemsCollection.updateOne({_id:ObjectId(itemId)}, {$set: item});
	}

	if (fields.file) {
		const filepath = await uploadFile(fields.file, itemId);

		item.hasFile = true;
		item.filepath = filepath;

		if (fields["file.metadata"]) {
			item.fileMetadata = fields["file.metadata"];
		}

		const updateResult = await itemsCollection.updateOne({_id:ObjectId(itemId)}, {$set: item});
	}

	return item;
}


async function processAndUploadImages(imageBuffer, itemId) {
	let imageObj = sharp(imageBuffer);
	let metadata = await imageObj.metadata();
	
	debugLog(`Processing image buffer (${metadata.width}x${metadata.height}): ${utils.descBuffer(imageBuffer)}`);

	let imageSizes = [];

	for (let i = 0; i < appConfig.images.widths.length; i++) {
		let width = appConfig.images.widths[i];
		if (metadata.width > width) {
			let bufferX = await sharp(imageBuffer).resize({width: width, fit: "inside"}).png().toBuffer();
			let ciphertextX = encryptor.encrypt(bufferX);

			debugLog("Resized img: w=" + width + ", " + utils.descBuffer(bufferX));
			
			await s3Bucket.put(ciphertextX, `img/${itemId}/w${width}`);

			imageSizes.push(`w${width}`);
		}
	}

	if (imageSizes.length == 0) {
		// image was smaller than all of our pre-defined sizes, upload the raw image
		let ciphertextRaw = encryptor.encrypt(imageBuffer);

		await s3Bucket.put(ciphertextRaw, `img/${itemId}/raw`);

		imageSizes.push("raw");
	}

	return imageSizes;
}

async function uploadFile(fileBuffer, itemId) {
	debugLog(`Processing file buffer: ${utils.descBuffer(fileBuffer)}`);

	let fileItems = [];

	let ciphertextRaw = encryptor.encrypt(fileBuffer);

	let filepath = `file/${itemId}`;

	await s3Bucket.put(ciphertextRaw, filepath);

	return filepath;
}


module.exports = {
	authenticate: authenticate,
	verifyMultiloginPin: verifyMultiloginPin,
	createOrUpdateItem: createOrUpdateItem,
	processAndUploadImages: processAndUploadImages
}
