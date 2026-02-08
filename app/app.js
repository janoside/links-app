const debug = require("debug");
const crypto = require("crypto");
const { DateTime } = require("luxon");
const sharp = require("sharp");
const ObjectId = require("mongodb").ObjectId;
const axios = require("axios");
const isGifAnimated = require("animated-gif-detector");
const zlib = require('zlib');

const appConfig = require("./config.js");

const appUtils = require("./app-utils");
const utils = appUtils.utils;
const passwordUtils = appUtils.passwordUtils;
const encryptionUtils = appUtils.encryptionUtils;
const s3Utils = appUtils.s3Utils;

const encryptor = encryptionUtils.encryptor(appConfig.encryptionPassword, appConfig.pbkdf2Salt);
const s3Bucket = appConfig.createAppBucket();

const debugLog = debug("app:main");


async function authenticate(username, password, passwordPreHashed=false) {
	let user = await db.findOne("users", {username:username});

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

async function getItem(predicate) {
	const item = await db.findOne("items", predicate);

	await preloadItemFileDataIfAppropriate(item);

	return item;
}

async function getItems(predicate, sort, limit=-1, offset=0) {
	let items = null;

	if (limit > 0) {
		items = await db.findMany(
			"items",
			predicate,
			sort,
			limit,
			offset);

	} else {
		items = await db.findMany(
			"items",
			predicate,
			sort);
	}

	for (let i = 0; i < items.length; i++) {
		let item = items[i];

		await preloadItemFileDataIfAppropriate(item);
	}

	return items;
}

async function preloadItemFileDataIfAppropriate(item) {
	if (item.fileMetadata && item.fileMetadata.mimeType.startsWith("text/")) {
		item.fileData = await getItemFileData(item);
	}
}

async function createOrUpdateItem(existingItemId, userId, username, itemType, fields) {
	debugLog(`app.createOrUpdateItem: ${JSON.stringify(fields)}`);

	//console.log(fields);
	
	let item = null;
	if (existingItemId == null) {
		item = {
			userId: userId,
			username: username,
			type: itemType,
			version: "2.0",
		};

	} else {
		item = await db.findOne("items", {_id:existingItemId});
	}

	if (fields.url) {
		item.url = fields.url;
	}

	if (fields.text) {
		if (item.text && item.text != fields.text) {
			if (!item.history) {
				item.history = {};
			}

			if (!item.history.text) {
				item.history.text = [];
			}

			const gzippedData = zlib.gzipSync(item.text);
			const base64Data = gzippedData.toString('base64');

			item.history.text.push({text_gz_b64:base64Data, changedAt:new Date()});
		}

		item.text = fields.text;
	}

	if (fields.tags) {
		item.tags = fields.tags.split(",").map(x => x.trim().toLowerCase());
	}

	if (fields.textType) {
		item.textType = fields.textType;
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

	// manually set file type
	if (fields.fileType) {
		if (!item.fileMetadata) {
			item.fileMetadata = {};
		}

		item.fileMetadata.mimeType = fields.fileType;
	}

	if (!item.editCount) {
		item.editCount = 0;
	}

	let itemId = existingItemId;
	if (existingItemId == null) {
		itemId = await db.insertOne("items", item);

	} else {
		item.editCount++;
		
		const updateResult = await db.updateOne("items", {_id:existingItemId}, {$set: item});

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

		fields["img.metadata"] = {
			mimeType: response.headers['content-type'],
			bytes: response.data.length
		};

		item.imageSourceUrl = fields.imgUrl;

		debugLog("Downloaded image: " + utils.descBuffer(fields.img) + ", from URL: " + fields.imgUrl);
	}

	if (fields.fileUrl) {
		const response = await axios.get(fields.fileUrl, { responseType: 'arraybuffer' });
		fields.file = Buffer.from(response.data, "binary");
		
		fields["file.metadata"] = {
			mimeType: response.headers['content-type'],
			bytes: response.data.length
		};

		item.fileSourceUrl = fields.fileUrl;

		debugLog("Downloaded file: type=" + response.headers['content-type'] + ", buffer=" + utils.descBuffer(fields.file) + ", from URL: " + fields.fileUrl);
	}

	if (fields.img) {
		if (fields["img.metadata"]) {
			item.imageMetadata = fields["img.metadata"];
		}

		const processedImageSizes = await processAndUploadImages(fields.img, itemId, item.imageMetadata || {});

		item.hasImage = true;
		item.imageSizes = processedImageSizes;

		const updateResult = await db.updateOne("items", {_id:itemId}, {$set: item});
	}

	if (fields.file) {
		const filepath = await uploadFile(fields.file, itemId);

		item.hasFile = true;
		item.filepath = filepath;

		if (fields["file.metadata"]) {
			item.fileMetadata = fields["file.metadata"];
		}

		const updateResult = await db.updateOne("items", {_id:itemId}, {$set: item});
	}

	return item;
}


async function processAndUploadImages(imageBuffer, itemId, imageMetadata) {
	let imageObj = sharp(imageBuffer);
	let metadata = await imageObj.metadata();
	
	debugLog(`Processing image buffer (${metadata.width}x${metadata.height}): ${utils.descBuffer(imageBuffer)}`);

	let animatedGif = false;
	if (imageMetadata && imageMetadata.mimeType == "image/gif") {
		animatedGif = isGifAnimated(imageBuffer);
	}

	let imageSizes = [];

	if (!animatedGif) {
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

async function getItemFileData(item) {
	const s3Data = await s3Bucket.get(`file/${item._id}`);

	try {
		const fileBuffer = encryptor.decrypt(s3Data);

		let contentType = "application/octet-stream";
	if (item.fileMetadata && item.fileMetadata.mimeType) {
		contentType = item.fileMetadata.mimeType;
	}

	debugLog(`Item(${item._id}).File: contentType=${contentType}, size=${fileBuffer.length}`);

	return {
		contentType: contentType,
			dataBuffer: fileBuffer,
			byteSize: fileBuffer.length
		};
	} catch (err) {
		utils.logError("0387yhedsdu", err, {item:item, s3Data:s3Data});

		throw err;
	}
}

async function deleteUserAccount(userId) {
	const userIdString = userId.toString();

	const items = await db.findMany("items", { userId: userIdString }, {
		projection: {
			_id: 1,
			hasImage: 1,
			imageSizes: 1,
			hasFile: 1
		}
	});

	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		const itemId = item._id.toString();

		if (item.hasImage) {
			let imageSizes = item.imageSizes;
			if (!imageSizes || imageSizes.length == 0) {
				imageSizes = ["raw", ...appConfig.images.widths.map(x => `w${x}`)];
			}

			for (let j = 0; j < imageSizes.length; j++) {
				await s3Bucket.del(`img/${itemId}/${imageSizes[j]}`);
			}
		}

		if (item.hasFile) {
			await s3Bucket.del(`file/${itemId}`);
		}
	}

	const itemsDeleteResult = await db.deleteMany("items", { userId: userIdString });
	const userDeleteResult = await db.deleteOne("users", { _id: userId });

	debugLog(`Deleted user account ${userIdString}: userDeleteCount=${userDeleteResult.deletedCount}, itemDeleteCount=${itemsDeleteResult.deletedCount}`);

	return {
		userDeleteResult: userDeleteResult,
		itemsDeleteResult: itemsDeleteResult
	};
}


module.exports = {
	authenticate: authenticate,
	verifyMultiloginPin: verifyMultiloginPin,
	createOrUpdateItem: createOrUpdateItem,
	processAndUploadImages: processAndUploadImages,
	getItemFileData: getItemFileData,
	getItem: getItem,
	getItems: getItems,
	deleteUserAccount: deleteUserAccount
}
