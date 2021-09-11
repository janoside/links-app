const express = require("express");
const router = express.Router();
const app = require("../app/app.js");
const utils = require("../app/util/utils.js");
const debugLog = require("debug")("app:rootRouter");
const asyncHandler = require("express-async-handler");
const passwordUtils = require("../app/util/password.js");
const appConfig = require("../app/config.js");
const db = require("../app/db.js");
const ObjectId = require("mongodb").ObjectId;
const formidable = require("formidable");
const knox = require("knox");
const fs = require("fs");
const encrpytor = require("../app/util/encryptor.js");
const zlib = require("zlib");


router.get("/", asyncHandler(async (req, res, next) => {
	if (req.session.user) {
		const linksCollection = await db.getCollection("links");

		res.locals.linkCount = await linksCollection.countDocuments({userId:req.session.user._id.toString()});

		const tagsData = await linksCollection.aggregate([
			{ $match: { userId: req.session.user._id.toString() } },
			{ $unwind: "$tags" },
			{ $group: { _id: "$tags", count: { $sum: 1 } } },
			{ $sort: { count: -1 }}
		]).toArray();

		res.locals.tagCount = tagsData.length;
	}

	res.render("index");
}));

router.get("/signup", asyncHandler(async (req, res, next) => {
	res.render("signup");
}));

router.post("/signup", asyncHandler(async (req, res, next) => {
	const username = req.body.username;
	const passwordHash = await passwordUtils.hash(req.body.password);

	const existingUser = await db.findObject("users", {username:username});
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

	const insertedUser = await db.insertObject("users", user);

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

		res.redirect("/");

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

		const savedLinkId = await db.insertObject("links", link);
		

		if (files && files.img && files.img.path) {
			let fileBuffer = fs.readFileSync(files.img.path);
			let ciphertext = encrpytor.encrypt(fileBuffer);
			console.log("cL: " + ciphertext.length);

			/*let compressedBuffer = Buffer.from(compressed, "utf8");
			let headers = {
				'Content-Type': 'text/plain'
			};*/

			await utils.s3Put(ciphertext, process.env.S3_BUCKET, `img/${savedLinkId}`);

			link.imgPath = `img/${savedLinkId}`;

			const linksCollection = await db.getCollection("links");
			const updateResult = await linksCollection.updateOne({_id:ObjectId(savedLinkId)}, {$set: link});

			req.session.userMessage = "Saved!";
			req.session.userMessageType = "success";

			res.redirect(`/link/${savedLinkId}`);

			/*s3Client.putBuffer(compressedBuffer, `/img/${savedLinkId}`, headers, async (err, result) => {
				if (err) {
					console.log("ERRRR");
					utils.logError("2308yhfwhde", err);

					req.session.userMessage = "Error saving image";
					req.session.userMessageType = "danger";

				} else {
					console.log("no error");
					link.imgPath = `/img/${savedLinkId}`;

					const linksCollection = await db.getCollection("links");
					const updateResult = await linksCollection.updateOne({_id:ObjectId(savedLinkId)}, {$set: link});

					req.session.userMessage = "Saved!";
					req.session.userMessageType = "success";
				}

				res.redirect(`/link/${savedLinkId}`);
			});*/

		} else {
			req.session.userMessage = "Saved!";
			req.session.userMessageType = "success";

			res.redirect(`/link/${savedLinkId}`);
		}
	});
}));

router.get("/link/:linkId", asyncHandler(async (req, res, next) => {
	if (!req.session.user) {
		res.redirect("/");

		return;
	}

	const linkId = req.params.linkId;
	const link = await db.findObject("links", {_id:ObjectId(linkId)});

	if (link.imgPath) {
		try {
			const s3Data = await utils.s3Get(process.env.S3_BUCKET, link.imgPath);
			const imgCiphertext = s3Data.Body;

			console.log("img.base641: " + imgCiphertext.toString("base64").substring(0, 100));

			res.locals.imgData = encrpytor.decrypt(imgCiphertext).toString("base64");

			console.log("img.base642: " + res.locals.imgData.substring(0, 100));
			
		} catch (err) {
			utils.logError("38ryhfewuwe", err);
		}
	}

	if (req.session.username != link.username) {
		res.redirect("/");

		return;
	}

	res.locals.link = link;

	res.render("link");
}));

router.get("/link/:linkId/edit", asyncHandler(async (req, res, next) => {
	const linkId = req.params.linkId;
	const link = await db.findObject("links", {_id:ObjectId(linkId)});

	res.locals.link = link;

	res.render("link-edit");
}));

router.post("/link/:linkId/edit", asyncHandler(async (req, res, next) => {
	const linkId = req.params.linkId;
	const link = await db.findObject("links", {_id:ObjectId(linkId)});

	link.url = req.body.url;
	link.desc = req.body.desc;
	link.tags = req.body.tags.split(",").map(x => x.trim());

	debugLog("updatedLink: " + JSON.stringify(link));

	const linksCollection = await db.getCollection("links");
	const updateResult = await linksCollection.updateOne({_id:ObjectId(linkId)}, {$set: link});

	req.session.userMessage = updateResult.result.ok == 1 ? "Link saved." : ("Status unknown: " + JSON.stringify(updateResult));
	req.session.userMessageType = "success";

	res.redirect(`/link/${linkId}`);
}));

router.get("/link/:linkId/raw", asyncHandler(async (req, res, next) => {
	if (!req.session.user) {
		res.redirect("/");

		return;
	}

	const linkId = req.params.linkId;
	const link = await db.findObject("links", {_id:ObjectId(linkId)});

	if (req.session.username != link.username) {
		res.redirect("/");

		return;
	}

	res.locals.link = link;

	res.render("link-raw");
}));

router.get("/link/:linkId/delete", asyncHandler(async (req, res, next) => {
	const linkId = req.params.linkId;
	const link = await db.findObject("links", {_id:ObjectId(linkId)});

	res.locals.link = link;

	res.render("link-delete");
}));

router.post("/link/:linkId/delete", asyncHandler(async (req, res, next) => {
	const linkId = req.params.linkId;
	const link = await db.findObject("links", {_id:ObjectId(linkId)});

	const result = await db.deleteObject("links", {_id:link._id});

	debugLog("deleteResult: " + JSON.stringify(result));
	
	req.session.userMessage = "Link deleted."

	res.redirect("/");
}));

router.get("/links", asyncHandler(async (req, res, next) => {
	if (!req.session.user) {
		res.redirect("/");

		return;
	}

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


	const user = await db.findObject("users", {username:req.session.username});
	const links = await db.findObjects(
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


	const links = await db.findObjects(
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
	
	const links = await db.findObjects(
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
