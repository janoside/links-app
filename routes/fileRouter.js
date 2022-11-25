const express = require("express");
const router = express.Router();
const app = require("../app/app.js");
const debug = require("debug");
const asyncHandler = require("express-async-handler");
const appConfig = require("../app/config.js");
const ObjectId = require("mongodb").ObjectId;
const fs = require("fs");
const sharp = require("sharp");

const debugLog = debug("app:rootRouter");

const appUtils = require("../app/app-utils");
const utils = appUtils.utils;
const passwordUtils = appUtils.passwordUtils;
const encryptionUtils = appUtils.encryptionUtils;
const s3Utils = appUtils.s3Utils;

const encryptor = encryptionUtils.encryptor(appConfig.encryptionPassword, appConfig.pbkdf2Salt);
const s3Bucket = s3Utils.createBucket(appConfig.s3Bucket, appConfig.s3PathPrefix);


router.get("/item/:itemId", asyncHandler(async (req, res, next) => {
	try {
		if (!req.session.user) {
			res.writeHead(403);
			res.end("unauthorized");

			return;
		}

		const itemId = req.params.itemId;
		const item = await db.findOne("items", {_id:ObjectId(req.params.itemId)});

		if (req.session.username != item.username) {
			res.writeHead(403);
			res.end("unauthorized");

			return;
		}

		const s3Data = await s3Bucket.get(`file/${req.params.itemId}`);
		const fileBuffer = encryptor.decrypt(s3Data);

		let contentType = "application/octet-stream";
		if (item.fileMetadata && item.fileMetadata.mimeType) {
			contentType = item.fileMetadata.mimeType;
		}

		res.writeHead(200, {
			'Content-Type': contentType,
			'Content-Length': fileBuffer.length,
			"Cache-Control": `max-age=${60 * 60 * 24 * 365}`
		});

		res.end(fileBuffer, "binary");

	} catch (err) {
		utils.logError("238ryewgww", err);

		res.end("error");
	}
}));

router.get("/item-share/:itemId", asyncHandler(async (req, res, next) => {
	try {
		const itemId = req.params.itemId;
		const item = await db.findOne("items", {_id:ObjectId(req.params.itemId)});

		const s3Data = await s3Bucket.get(`file/${req.params.itemId}`);
		const fileBuffer = encryptor.decrypt(s3Data);

		let contentType = "application/octet-stream";
		if (item.fileMetadata && item.fileMetadata.mimeType) {
			contentType = item.fileMetadata.mimeType;
		}

		res.writeHead(200, {
			'Content-Type': contentType,
			'Content-Length': fileBuffer.length,
			"Cache-Control": `max-age=${60 * 60 * 24 * 365}`
		});

		res.end(fileBuffer, "binary");

	} catch (err) {
		utils.logError("3208h4weuedrdd", err);

		res.end("error");
	}
}));


module.exports = router;
