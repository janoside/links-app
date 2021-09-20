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
const axios = require("axios");

const debugLog = debug("app:rootRouter");

const appUtils = require("@janoside/app-utils");
const utils = appUtils.utils;
const passwordUtils = appUtils.passwordUtils;
const encryptionUtils = appUtils.encryptionUtils;
const s3Utils = appUtils.s3Utils;

const encryptor = encryptionUtils.encryptor(appConfig.encryptionPassword, appConfig.pbkdf2Salt);
const s3Bucket = s3Utils.createBucket(appConfig.s3Bucket, appConfig.s3PathPrefix);



router.get("/", asyncHandler(async (req, res, next) => {
	if (req.session.user) {
		var limit = 50;
		var offset = 0;
		var sort = "date-desc";

		if (req.query.limit) {
			limit = parseInt(req.query.limit);
		}

		if (req.query.offset) {
			offset = parseInt(req.query.offset);
		}

		if (req.query.sort) {
			sort = req.query.sort;
		}

		const dateSortVal = sort.startsWith("date-") ? (sort.endsWith("-desc") ? -1 : 1) : -1;


		const user = await db.findOne("users", {username:req.session.username});
		const links = await db.findMany(
			"links",
			{
				userId: user._id.toString()
			},
			{
				sort: [
					["createdAt", dateSortVal]
				]
			},
			limit,
			offset);

		const linksCollection = await db.getCollection("links");

		const linkCount = await linksCollection.countDocuments({ userId: user._id.toString() });

		const tagsData = await linksCollection.aggregate([
			{ $match: { userId: req.session.user._id.toString() } },
			{ $unwind: "$tags" },
			{ $group: { _id: "$tags", count: { $sum: 1 } } },
			{ $sort: { count: -1, _id: 1 }}
		]).toArray();

		res.locals.user = user;
		res.locals.linkCount = linkCount;
		res.locals.links = links;
		res.locals.tags = [];
		res.locals.tagsData = tagsData;

		res.locals.limit = limit;
		res.locals.offset = offset;
		res.locals.sort = sort;
		res.locals.paginationBaseUrl = `/links`;

		res.render("user-links");

		return;
	}

	res.render("index");
}));

router.get("/signup", asyncHandler(async (req, res, next) => {
	res.render("signup");
}));

router.post("/signup", asyncHandler(async (req, res, next) => {
	const username = req.body.username;
	const passwordHash = await passwordUtils.hash(req.body.password);

	const existingUser = await db.findOne("users", {username:username});
	if (existingUser) {
		debugLog("Username already exists");

		res.locals.userMessage = "Sorry, that username is already taken.";
		res.locals.userMessageType = "danger";

		res.render("signup");

		return;
	}

	const user = {
		username: username,
		passwordHash: passwordHash
	};

	const insertedUser = await db.insertOne("users", user);

	req.session.username = username;
	req.session.user = insertedUser;

	req.session.userMessage = "Success!";
	req.session.userMessageType = "success";

	if (req.body.rememberme) {
		const props = {username:req.body.username, passwordHash:user.passwordHash};

		res.cookie("rememberme", JSON.stringify(props), {
			maxAge: (3 * utils.monthMillis()),
			httpOnly: appConfig.secureSite
		});

	} else {
		res.clearCookie("rememberme");
	}

	res.redirect("/");
}));

router.post("/login", asyncHandler(async (req, res, next) => {
	const user = await app.authenticate(req.body.username, req.body.password);

	if (user) {
		req.session.username = user.username;
		req.session.user = user;

		req.session.userMessage = "Success!";
		req.session.userMessageType = "success";

		if (req.body.rememberme) {
			const props = {username:req.body.username, passwordHash:user.passwordHash};

			res.cookie("rememberme", JSON.stringify(props), {
				maxAge: (3 * utils.monthMillis()),
				httpOnly: appConfig.secureSite
			});

		} else {
			res.clearCookie("rememberme");
		}

		if (req.session.redirectUrl) {
			const redirectUrl = req.session.redirectUrl;
			delete req.session.redirectUrl;

			res.redirect(redirectUrl);

		} else {
			res.redirect("/");
		}

	} else {
		req.session.userMessage = "Login failed - invalid username or password";
		req.session.userMessageType = "danger";

		res.redirect("/");
	}
}));

router.get("/logout", async (req, res, next) => {
	req.session.username = null;
	req.session.user = null;

	res.clearCookie("rememberme");

	res.redirect("/");
});

router.get("/settings", asyncHandler(async (req, res, next) => {
	res.render("settings");
}));

router.get("/account", asyncHandler(async (req, res, next) => {
	res.render("account");
}));

router.get("/changeSetting", asyncHandler(async (req, res, next) => {
	if (req.query.name) {
		if (!req.session.userSettings) {
			req.session.userSettings = {};
		}

		req.session.userSettings[req.query.name] = req.query.value;

		var userSettings = JSON.parse(req.cookies["user-settings"] || "{}");
		userSettings[req.query.name] = req.query.value;

		res.cookie("user-settings", JSON.stringify(userSettings));
	}

	res.redirect(req.headers.referer);
}));

router.get("/new-link", asyncHandler(async (req, res, next) => {
	res.render("new-link");
}));

router.post("/new-link", asyncHandler(async (req, res, next) => {
	const content = req.body.text;

	const form = formidable({ multiples: true });
	form.parse(req, async (err, fields, files) => {
		//console.log("fields: " + JSON.stringify(fields));
		//console.log("files: " + JSON.stringify(files));


		if (err) {
			utils.logError("32987y4ew7ged", err);

			next(err);

			return;
		}


		const link = {
			userId: req.session.user._id.toString(),
			username: req.session.user.username,
			url: fields.url
		};

		if (fields.desc) {
			link.desc = fields.desc;
		}

		if (fields.tags) {
			link.tags = fields.tags.split(",").map(x => x.trim().toLowerCase());
		}

		const savedLinkId = await db.insertOne("links", link);

		
		if (files && files.img && files.img.size > 0 && files.img.path && files.img.path.trim().length > 0) {
			if (fields.imgUrl && fields.imgUrl.trim().length > 0) {
				next(new Error("Use image file OR image URL, not both."));

				return;
			}
		}

		let imgBuffer = null;

		if (files && files.img && files.img.size > 0) {
			imgBuffer = fs.readFileSync(files.img.path);
			console.log("loading file");
		}

		if (fields.imgUrl && fields.imgUrl.trim().length > 0) {
			const response = await axios.get(fields.imgUrl, { responseType: 'arraybuffer' });
			imgBuffer = Buffer.from(response.data, "binary");
			console.log("loaded url:: " + utils.descBuffer(imgBuffer));
		}

		if (imgBuffer) {
			try {
				let ciphertextFull = encryptor.encrypt(imgBuffer);
				console.log(`imgFull: ${utils.descBuffer(imgBuffer)}`);

				let buffer0 = await sharp(imgBuffer).resize({width: appConfig.images.widths[0], fit: "inside"}).toFormat("jpeg").toBuffer();
				console.log(`img0: ${utils.descBuffer(buffer0)}`);
				let ciphertext0 = encryptor.encrypt(buffer0);
				await s3Bucket.put(ciphertext0, `img/${savedLinkId}/w${appConfig.images.widths[0]}`);

				for (let i = 1; i < appConfig.images.widths.length; i++) {
					let bufferX = await sharp(imgBuffer).resize({width: appConfig.images.widths[i], fit: "inside"}).toFormat("jpeg").toBuffer();
					console.log(`img_${i}: ${utils.descBuffer(bufferX)}`);
					let ciphertextX = encryptor.encrypt(bufferX);
					s3Bucket.put(ciphertextX, `img/${savedLinkId}/w${appConfig.images.widths[i]}`);
				}

				

				link.hasImage = true;

				const linksCollection = await db.getCollection("links");
				const updateResult = await linksCollection.updateOne({_id:ObjectId(savedLinkId)}, {$set: link});

				req.session.userMessage = "Saved!";
				req.session.userMessageType = "success";

			} catch (err) {
				utils.logError("38yewge34", err);
			}

			res.redirect(`/link/${savedLinkId}`);

		} else {
			req.session.userMessage = "Saved!";
			req.session.userMessageType = "success";

			res.redirect(`/link/${savedLinkId}`);
		}
	});
}));

router.get("/link/:linkId", asyncHandler(async (req, res, next) => {
	if (!req.session.user) {
		req.session.redirectUrl = req.path;
		res.redirect("/");

		return;
	}

	const linkId = req.params.linkId;
	const link = await db.findOne("links", {_id:ObjectId(linkId)});

	if (req.session.username != link.username) {
		req.session.userMessage = "You're not authorized to view that.";
		req.session.userMessageType = "info";

		res.redirect("/");

		return;
	}

	res.locals.link = link;

	res.render("link");
}));

router.get("/link/:linkId/edit", asyncHandler(async (req, res, next) => {
	const linkId = req.params.linkId;
	const link = await db.findOne("links", {_id:ObjectId(linkId)});

	res.locals.link = link;

	res.render("link-edit");
}));

router.post("/link/:linkId/edit", asyncHandler(async (req, res, next) => {
	const linkId = req.params.linkId;
	const link = await db.findOne("links", {_id:ObjectId(linkId)});


	const form = formidable({ multiples: true });
	form.parse(req, async (err, fields, files) => {
		link.url = fields.url;
		link.desc = fields.desc;
		link.tags = fields.tags.split(",").map(x => x.trim());


		const linksCollection = await db.getCollection("links");
		const updateResult = await linksCollection.updateOne({_id:ObjectId(linkId)}, {$set: link});


		debugLog("updatedLink: " + JSON.stringify(link) + " - result: " + JSON.stringify(updateResult));


		if (files && files.img && files.img.size > 0 && files.img.path && files.img.path.trim().length > 0) {
			if (fields.imgUrl && fields.imgUrl.trim().length > 0) {
				next(new Error("Use image file OR image URL, not both."));

				return;
			}
		}

		let imgBuffer = null;

		if (files && files.img && files.img.size > 0) {
			imgBuffer = fs.readFileSync(files.img.path);
			console.log("loading file");
		}

		if (fields.imgUrl && fields.imgUrl.trim().length > 0) {
			const response = await axios.get(fields.imgUrl, { responseType: 'arraybuffer' });
			imgBuffer = Buffer.from(response.data, "binary");
			console.log("loaded url:: " + utils.descBuffer(imgBuffer));
		}

		if (imgBuffer) {
			let ciphertextFull = encryptor.encrypt(imgBuffer);
			//await s3Bucket.put(ciphertextFull, `img/${linkId}/full`);
			console.log(`imgFull: ${utils.descBuffer(imgBuffer)}`);

			let buffer0 = await sharp(imgBuffer).resize({width: appConfig.images.widths[0], fit: "inside"}).toFormat("jpeg").toBuffer();
			console.log(`img0: ${utils.descBuffer(buffer0)}`);
			let ciphertext0 = encryptor.encrypt(buffer0);
			await s3Bucket.put(ciphertext0, `img/${linkId}/w${appConfig.images.widths[0]}`);

			for (let i = 1; i < appConfig.images.widths.length; i++) {
				let bufferX = await sharp(imgBuffer).resize({width: appConfig.images.widths[i], fit: "inside"}).toFormat("jpeg").toBuffer();
				console.log(`img_${i}: ${utils.descBuffer(bufferX)}`);
				let ciphertextX = encryptor.encrypt(bufferX);
				s3Bucket.put(ciphertextX, `img/${linkId}/w${appConfig.images.widths[i]}`);
			}

			

			link.hasImage = true;

			const linksCollection = await db.getCollection("links");
			const updateResult = await linksCollection.updateOne({_id:ObjectId(linkId)}, {$set: link});


			req.session.userMessage = updateResult.modifiedCount == 1 ? "Link saved." : ("Status unknown: " + JSON.stringify(updateResult));
			req.session.userMessageType = "success";

			res.redirect(`/link/${linkId}`);

		} else {
			req.session.userMessage = updateResult.modifiedCount == 1 ? "Link saved." : ("Status unknown: " + JSON.stringify(updateResult));
			req.session.userMessageType = "success";

			res.redirect(`/link/${linkId}`);
		}
	});

}));

router.get("/link/:linkId/raw", asyncHandler(async (req, res, next) => {
	if (!req.session.user) {
		res.redirect("/");

		return;
	}

	const linkId = req.params.linkId;
	const link = await db.findOne("links", {_id:ObjectId(linkId)});

	if (req.session.username != link.username) {
		res.redirect("/");

		return;
	}

	res.locals.link = link;

	res.render("link-raw");
}));

router.get("/link/:linkId/delete", asyncHandler(async (req, res, next) => {
	const linkId = req.params.linkId;
	const link = await db.findOne("links", {_id:ObjectId(linkId)});

	res.locals.link = link;

	res.render("link-delete");
}));

router.post("/link/:linkId/delete", asyncHandler(async (req, res, next) => {
	const linkId = req.params.linkId;
	const link = await db.findOne("links", {_id:ObjectId(linkId)});

	const result = await db.deleteObject("links", {_id:link._id});

	debugLog("deleteResult: " + JSON.stringify(result));

	if (link.hasImage) {
		for (let i = 0; i < appConfig.images.widths.length; i++) {
			await s3Bucket.del(appConfig.s3Bucket, `img/${linkId}/w${appConfig.images.widths[i]}`);
		}

		debugLog("deleted images");
	}
	
	req.session.userMessage = "Link deleted."

	res.redirect("/");
}));

router.get("/links", asyncHandler(async (req, res, next) => {
	if (!req.session.user) {
		res.redirect("/");

		return;
	}

	var limit = 50;
	var offset = 0;
	var sort = "date-desc";

	if (req.query.limit) {
		limit = parseInt(req.query.limit);
	}

	if (req.query.offset) {
		offset = parseInt(req.query.offset);
	}

	if (req.query.sort) {
		sort = req.query.sort;
	}

	const dateSortVal = sort.startsWith("date-") ? (sort.endsWith("-desc") ? -1 : 1) : -1;


	const user = await db.findOne("users", {username:req.session.username});
	const links = await db.findMany(
		"links",
		{
			userId: user._id.toString()
		},
		{
			sort: [
				["createdAt", dateSortVal]
			]
		},
		limit,
		offset);

	const linksCollection = await db.getCollection("links");

	const linkCount = await linksCollection.countDocuments({ userId: user._id.toString() });

	const tagsData = await linksCollection.aggregate([
		{ $match: { userId: req.session.user._id.toString() } },
		{ $unwind: "$tags" },
		{ $group: { _id: "$tags", count: { $sum: 1 } } },
		{ $sort: { count: -1, _id: 1 }}
	]).toArray();

	res.locals.user = user;
	res.locals.linkCount = linkCount;
	res.locals.links = links;
	res.locals.tags = [];
	res.locals.tagsData = tagsData;

	res.locals.limit = limit;
	res.locals.offset = offset;
	res.locals.sort = sort;
	res.locals.paginationBaseUrl = `/links`;

	res.render("user-links");
}));

router.get("/tags/:tags", asyncHandler(async (req, res, next) => {
	const tags = req.params.tags.split(",");

	var limit = 25;
	var offset = 0;
	var sort = "date-desc";

	if (req.query.limit) {
		limit = parseInt(req.query.limit);
	}

	if (req.query.offset) {
		offset = parseInt(req.query.offset);
	}

	if (req.query.sort) {
		sort = req.query.sort;
	}

	const dateSortVal = sort.startsWith("date-") ? (sort.endsWith("-desc") ? -1 : 1) : -1;


	const links = await db.findMany(
		"links",
		{
			userId: req.session.user._id.toString(),
			tags: { $all: tags }
		},
		{
			sort: [
				["createdAt", dateSortVal]
			]
		},
		limit,
		offset);

	const linksCollection = await db.getCollection("links");

	const linkCount = await linksCollection.countDocuments({
		userId: req.session.user._id.toString(),
		tags: { $all: tags }
	});

	const tagsData = await linksCollection.aggregate([
		{ $match: { userId: req.session.user._id.toString(), tags: { $all: tags } } },
		{ $unwind: "$tags" },
		{ $group: { _id: "$tags", count: { $sum: 1 } } },
		{ $sort: { count: -1, _id: 1 }}
	]).toArray();

	res.locals.tags = tags;
	res.locals.linkCount = linkCount;
	res.locals.links = links;
	res.locals.tagsData = tagsData;

	res.locals.limit = limit;
	res.locals.offset = offset;
	res.locals.sort = sort;
	res.locals.paginationBaseUrl = `/tags/${req.params.tags}`;

	res.render("tag-links");
}));

router.get("/search", asyncHandler(async (req, res, next) => {
	const query = req.query.query;

	var limit = 25;
	var offset = 0;
	var sort = "date-desc";

	if (req.query.limit) {
		limit = parseInt(req.query.limit);
	}

	if (req.query.offset) {
		offset = parseInt(req.query.offset);
	}

	if (req.query.sort) {
		sort = req.query.sort;
	}

	const dateSortVal = sort.startsWith("date-") ? (sort.endsWith("-desc") ? -1 : 1) : -1;


	const regex = new RegExp(query, "i");
	
	const links = await db.findMany(
		"links",
		{
			$and: [
				{ userId: req.session.user._id.toString() },
				{
					$or:[
						{ desc: regex },
						{ url: regex },
						{ tags: regex }
					]
				}
			]
		},
		{
			sort: [
				["createdAt", dateSortVal]
			]
		},
		limit,
		offset);

	const linksCollection = await db.getCollection("links");

	const linkCount = await linksCollection.countDocuments({
		$and: [
			{ userId: req.session.user._id.toString() },
			{
				$or:[
					{ desc: regex },
					{ url: regex },
					{ tags: regex }
				]
			}
		]
	});

	const tagsData = await linksCollection.aggregate([
		{ $match: { userId: req.session.user._id.toString(), $or: [ { desc: new RegExp(query, "i") }, { url: new RegExp(query, "i") }, { tags: new RegExp(query, "i") } ] } },
		{ $unwind: "$tags" },
		{ $group: { _id: "$tags", count: { $sum: 1 } } },
		{ $sort: { count: -1, _id: 1 }}
	]).toArray();
	
	res.locals.query = query;
	res.locals.linkCount = linkCount;
	res.locals.links = links;
	res.locals.tags = [];
	res.locals.tagsData = tagsData;

	res.locals.limit = limit;
	res.locals.offset = offset;
	res.locals.sort = sort;
	res.locals.paginationBaseUrl = `/search?query=${query}`;

	res.render("search-links");
}));

router.get("/tags", asyncHandler(async (req, res, next) => {
	const linksCollection = await db.getCollection("links");
	const tagsData = await linksCollection.aggregate([
		{ $match: { userId: req.session.user._id.toString() } },
		{ $unwind: "$tags" },
		{ $group: { _id: "$tags", count: { $sum: 1 } } },
		{ $sort: { count: -1, _id: 1 }}
	]).toArray();

	res.locals.tagsData = tagsData;
	
	res.render("tags");
}));

module.exports = router;
