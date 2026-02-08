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
const s3Bucket = appConfig.createAppBucket();


router.get("/item/:itemId", asyncHandler(async (req, res, next) => {
	try {
		if (!req.session.user) {
			res.writeHead(403);
			res.end("unauthorized");

			return;
		}

		const itemId = req.params.itemId;
		const item = await db.findOne("items", {_id:req.params.itemId});

		if (req.session.username != item.username) {
			res.writeHead(403);
			res.end("unauthorized");

			return;
		}


		const fileData = await app.getItemFileData(item);

		const headers = {
			"Content-Type": fileData.contentType,
			"Content-Length": fileData.byteSize,
			"Cache-Control": `max-age=${60 * 60 * 24 * 365}`
		};

		if (fileData.contentType === "application/octet-stream") {
			// Avoid browser download prompt for unknown binaries.
			headers["Content-Type"] = "text/plain; charset=utf-8";
			headers["Content-Disposition"] = "inline; filename=\"file.txt\"";
		}

		res.writeHead(200, headers);

		res.end(fileData.dataBuffer, "binary");

	} catch (err) {
		utils.logError("238ryewgww", err);

		res.end("error");
	}
}));

router.get("/item-share/:itemId", asyncHandler(async (req, res, next) => {
	try {
		const itemId = req.params.itemId;
		const item = await db.findOne("items", {_id:req.params.itemId});


		const fileData = await app.getItemFileData(item);

		const headers = {
			"Content-Type": fileData.contentType,
			"Content-Length": fileData.byteSize,
			"Cache-Control": `max-age=${60 * 60 * 24 * 365}`
		};

		if (fileData.contentType === "application/octet-stream") {
			// Avoid browser download prompt for unknown binaries.
			headers["Content-Type"] = "text/plain; charset=utf-8";
			headers["Content-Disposition"] = "inline; filename=\"file.txt\"";
		}

		res.writeHead(200, headers);

		res.end(fileData.dataBuffer, "binary");

	} catch (err) {
		utils.logError("3208h4weuedrdd", err);

		res.end("error");
	}
}));


module.exports = router;
