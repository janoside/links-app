const debug = require("debug");
const crypto = require("crypto");
const { DateTime } = require("luxon");
const sharp = require("sharp");
const ObjectId = require("mongodb").ObjectId;
const axios = require("axios");

const appConfig = require("./config.js");

const appUtils = require("@janoside/app-utils");
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

	if (fields.img) {
		debugLog("Uploaded image file: " + utils.descBuffer(fields.img, "base64"));
	}

	if (fields.imgUrl) {
		const response = await axios.get(fields.imgUrl, { responseType: 'arraybuffer' });
		fields.img = Buffer.from(response.data, "binary");

		debugLog("Downloaded image: " + utils.descBuffer(fields.img) + ", from URL: " + fields.imgUrl);
	}

	if (fields.img) {
		const processedImageSizes = await processAndUploadImages(fields.img, itemId);

		item.hasImage = true;
		item.imageSizes = processedImageSizes;

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


module.exports = {
	authenticate: authenticate,
	createOrUpdateItem: createOrUpdateItem,
	processAndUploadImages: processAndUploadImages
}
