const express = require("express");
const router = express.Router();
const app = require("../app/app.js");
const debug = require("debug");
const asyncHandler = require("express-async-handler");
const appConfig = require("../app/config.js");
const ObjectId = require("mongodb").ObjectId;
const formidable = require("formidable");
const fs = require("fs");
const sharp = require("sharp");

const debugLog = debug("app:rootRouter");

const appUtils = require("@janoside/app-utils");
const utils = appUtils.utils;
const passwordUtils = appUtils.passwordUtils;
const encryptionUtils = appUtils.encryptionUtils;
const s3Utils = appUtils.s3Utils;

const encryptor = encryptionUtils.encryptor(appConfig.encryptionPassword, appConfig.pbkdf2Salt);
const s3Bucket = s3Utils.createBucket(appConfig.s3Bucket, appConfig.s3PathPrefix);


router.get("/link/:linkId/:size", asyncHandler(async (req, res, next) => {
	try {
		if (!req.session.user) {
			res.writeHead(403);
			res.end("unauthorized");

			return;
		}

		const linkId = req.params.linkId;
		const link = await db.findOne("links", {_id:ObjectId(req.params.linkId)});

		if (req.session.username != link.username) {
			res.writeHead(403);
			res.end("unauthorized");

			return;
		}

		const s3Data = await s3Bucket.get(`img/${req.params.linkId}/${req.params.size}`);
		const imgBuffer = encryptor.decrypt(s3Data);

		//console.log("img: " + utils.descBuffer(imgBuffer));

		res.writeHead(200, {
			'Content-Type': 'image/png',
			'Content-Length': imgBuffer.length
		});

		res.end(imgBuffer, "binary");

	} catch (err) {
		utils.logError("238ryewgww", err);

		res.end("error");
	}
}));


module.exports = router;
