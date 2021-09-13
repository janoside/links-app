const express = require("express");
const router = express.Router();
const app = require("../app/app.js");
const utils = require("../app/util/utils.js");
const debug = require("debug");
const debugLog = debug("app:rootRouter");
const asyncHandler = require("express-async-handler");
const passwordUtils = require("../app/util/password.js");
const appConfig = require("../app/config.js");
const db = require("../app/db.js");
const ObjectId = require("mongodb").ObjectId;
const formidable = require("formidable");
const fs = require("fs");
const encrpytor = require("../app/util/encryptor.js");
const sharp = require("sharp");


router.get("/link/:linkId/:size", asyncHandler(async (req, res, next) => {
	const s3Data = await utils.s3Get(appConfig.s3Bucket, `img/${req.params.linkId}/${req.params.size}`);
	const imgCiphertext = s3Data.Body;
	const imgBuffer = encrpytor.decrypt(imgCiphertext);
	//const imgBase64 = imgBuffer.toString("base64");

	//console.log("img: " + utils.descBuffer(imgBuffer));

	res.writeHead(200, {
		'Content-Type': 'image/png',
		'Content-Length': imgBuffer.length
	});

	res.end(imgBuffer, "binary");
}));


module.exports = router;
