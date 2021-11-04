const express = require("express");
const path = require("path");
const router = express.Router();
const app = require("../app/app.js");
const debug = require("debug");
const asyncHandler = require("express-async-handler");
const appConfig = require("../app/config.js");
const ObjectId = require("mongodb").ObjectId;
const fs = require("fs");
const sharp = require("sharp");
const axios = require("axios");
const Busboy = require('busboy');

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
		const items = await db.findMany(
			"items",
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

		const itemsCollection = await db.getCollection("items");

		const itemCount = await itemsCollection.countDocuments({ userId: user._id.toString() });

		const tagsData = await itemsCollection.aggregate([
			{ $match: { userId: req.session.user._id.toString() } },
			{ $unwind: "$tags" },
			{ $group: { _id: "$tags", count: { $sum: 1 } } },
			{ $sort: { count: -1, _id: 1 }}
		]).toArray();

		res.locals.user = user;
		res.locals.itemCount = itemCount;
		res.locals.items = items;
		res.locals.tags = [];
		res.locals.tagsData = tagsData;

		res.locals.limit = limit;
		res.locals.offset = offset;
		res.locals.sort = sort;
		res.locals.paginationBaseUrl = `/items`;

		res.render("user-items");

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

const saveItemRoute = async (existingItemId, itemType, req, res, next) => {
	const fields = {};

	const userId = req.session.user._id.toString();
	const username = req.session.user.username;

	var busboy = new Busboy({ headers: req.headers });
	busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
		file.on('data', (data) => {
			const dataBuffer = Buffer.from(data);

			if (fields[fieldname] == null) {
				fields[fieldname] = dataBuffer;

			} else {
				fields[fieldname] = Buffer.concat([fields[fieldname], dataBuffer]);
			}
		});
		file.on('end', () => {});
	});
	busboy.on('field', (fieldname, val, fieldnameTruncated, valTruncated) => {
		if (val && val.trim().length > 0) {
			fields[fieldname] = val;
		}
	});
	busboy.on('finish', async () => {
		let item = null;

		try {
			item = await app.createOrUpdateItem(existingItemId, userId, username, itemType, fields);

		} catch (e) {
			utils.logError("9w734ywfd", e);

			next(e);

			return;
		}

		req.session.userMessage = "Saved!";
		req.session.userMessageType = "success";

		res.redirect(`/item/${item._id.toString()}`);
	});

	req.pipe(busboy);
};

router.post("/new-link", asyncHandler(async (req, res, next) => {
	saveItemRoute(null, "link", req, res, next);
}));

router.get("/new-note", asyncHandler(async (req, res, next) => {
	res.render("new-note");
}));

router.post("/new-note", asyncHandler(async (req, res, next) => {
	const item = {
		userId: req.session.user._id.toString(),
		username: req.session.user.username,
		type: "note"
	};

	if (req.body.text) {
		item.text = req.body.text;
	}

	if (req.body.url) {
		item.url = req.body.url;
	}

	if (req.body.tags) {
		item.tags = req.body.tags.split(",").map(x => x.trim().toLowerCase());
	}

	const savedItemId = await db.insertOne("items", item);

	req.session.userMessage = "Saved!";
	req.session.userMessageType = "success";

	res.redirect(`/item/${savedItemId}`);
}));

router.post("/edit-note/:itemId", asyncHandler(async (req, res, next) => {
	const itemId = req.params.itemId;
	const item = await db.findOne("items", {_id:ObjectId(itemId)});

	if (req.body.text) {
		item.text = req.body.text;
	}

	if (req.body.url) {
		item.url = req.body.url;
	}

	if (req.body.tags) {
		item.tags = req.body.tags.split(",").map(x => x.trim().toLowerCase());
	}

	const itemsCollection = await db.getCollection("items");
	const updateResult = await itemsCollection.updateOne({_id:ObjectId(itemId)}, {$set: item});

	req.session.userMessage = "Saved!";
	req.session.userMessageType = "success";

	res.redirect(`/item/${itemId}`);
}));

router.get("/new-image", asyncHandler(async (req, res, next) => {
	res.render("new-image");
}));

router.post("/new-image", asyncHandler(async (req, res, next) => {
	saveItemRoute(null, "image", req, res, next);
}));

router.get("/item/:itemId", asyncHandler(async (req, res, next) => {
	if (!req.session.user) {
		req.session.redirectUrl = req.path;
		res.redirect("/");

		return;
	}

	const itemId = req.params.itemId;
	const item = await db.findOne("items", {_id:ObjectId(itemId)});

	if (req.session.username != item.username) {
		req.session.userMessage = "You're not authorized to view that.";
		req.session.userMessageType = "info";

		res.redirect("/");

		return;
	}

	res.locals.item = item;

	res.render("item");
}));

router.get("/item/:itemId/edit", asyncHandler(async (req, res, next) => {
	const itemId = req.params.itemId;
	const item = await db.findOne("items", {_id:ObjectId(itemId)});

	res.locals.item = item;

	if (!item.type || item.type == "link") {
		res.render("edit-link");

	} else if (item.type == "note") {
		res.render("edit-note");

	} else if (item.type == "image") {
		res.render("edit-image");

	} else {
		throw new Error("Unknown item type: " + item.type);
	}
}));

router.post("/item/:itemId/edit", asyncHandler(async (req, res, next) => {
	const itemId = req.params.itemId;

	saveItemRoute(itemId, null, req, res, next);
}));

router.get("/item/:itemId/raw", asyncHandler(async (req, res, next) => {
	if (!req.session.user) {
		res.redirect("/");

		return;
	}

	const itemId = req.params.itemId;
	const item = await db.findOne("items", {_id:ObjectId(itemId)});

	if (req.session.username != item.username) {
		res.redirect("/");

		return;
	}

	res.locals.item = item;

	res.render("raw-item");
}));

router.get("/item/:itemId/delete", asyncHandler(async (req, res, next) => {
	const itemId = req.params.itemId;
	const item = await db.findOne("items", {_id:ObjectId(itemId)});

	res.locals.item = item;

	res.render("delete-item");
}));

router.post("/item/:itemId/delete", asyncHandler(async (req, res, next) => {
	const itemId = req.params.itemId;
	const item = await db.findOne("items", {_id:ObjectId(itemId)});

	const result = await db.deleteOne("items", {_id:item._id});

	debugLog("Deleted item: " + JSON.stringify(result));

	if (item.hasImage) {
		for (let i = 0; i < item.imageSizes.length; i++) {
			await s3Bucket.del(`img/${itemId}/${item.imageSizes[i]}`);
		}

		debugLog(`Deleted ${item.imageSizes.length} image(s)`);
	}
	
	req.session.userMessage = "Item deleted.";
	req.session.userMessageType = "success";

	res.redirect("/");
}));

router.get("/items", asyncHandler(async (req, res, next) => {
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
	const items = await db.findMany(
		"items",
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

	const itemsCollection = await db.getCollection("items");

	const itemCount = await itemsCollection.countDocuments({ userId: user._id.toString() });

	const tagsData = await itemsCollection.aggregate([
		{ $match: { userId: req.session.user._id.toString() } },
		{ $unwind: "$tags" },
		{ $group: { _id: "$tags", count: { $sum: 1 } } },
		{ $sort: { count: -1, _id: 1 }}
	]).toArray();

	res.locals.user = user;
	res.locals.itemCount = itemCount;
	res.locals.items = items;
	res.locals.tags = [];
	res.locals.tagsData = tagsData;

	res.locals.limit = limit;
	res.locals.offset = offset;
	res.locals.sort = sort;
	res.locals.paginationBaseUrl = `/items`;

	res.render("user-items");
}));

router.get("/tags/:tags", asyncHandler(async (req, res, next) => {
	const tags = req.params.tags.split(",").map(x => x.trim().toLowerCase());

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


	const items = await db.findMany(
		"items",
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

	const itemsCollection = await db.getCollection("items");

	const itemCount = await itemsCollection.countDocuments({
		userId: req.session.user._id.toString(),
		tags: { $all: tags }
	});

	const tagsData = await itemsCollection.aggregate([
		{ $match: { userId: req.session.user._id.toString(), tags: { $all: tags } } },
		{ $unwind: "$tags" },
		{ $group: { _id: "$tags", count: { $sum: 1 } } },
		{ $sort: { count: -1, _id: 1 }}
	]).toArray();

	res.locals.tags = tags;
	res.locals.itemCount = itemCount;
	res.locals.items = items;
	res.locals.tagsData = tagsData;

	res.locals.limit = limit;
	res.locals.offset = offset;
	res.locals.sort = sort;
	res.locals.paginationBaseUrl = `/tags/${req.params.tags}`;

	res.render("tag-items");
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
	
	const items = await db.findMany(
		"items",
		{
			$and: [
				{ userId: req.session.user._id.toString() },
				{
					$or:[
						{ text: regex },
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

	const itemsCollection = await db.getCollection("items");

	const itemCount = await itemsCollection.countDocuments({
		$and: [
			{ userId: req.session.user._id.toString() },
			{
				$or:[
					{ text: regex },
					{ url: regex },
					{ tags: regex }
				]
			}
		]
	});

	const tagsData = await itemsCollection.aggregate([
		{ $match: { userId: req.session.user._id.toString(), $or: [ { text: new RegExp(query, "i") }, { url: new RegExp(query, "i") }, { tags: new RegExp(query, "i") } ] } },
		{ $unwind: "$tags" },
		{ $group: { _id: "$tags", count: { $sum: 1 } } },
		{ $sort: { count: -1, _id: 1 }}
	]).toArray();
	
	res.locals.query = query;
	res.locals.itemCount = itemCount;
	res.locals.items = items;
	res.locals.tags = [];
	res.locals.tagsData = tagsData;

	res.locals.limit = limit;
	res.locals.offset = offset;
	res.locals.sort = sort;
	res.locals.paginationBaseUrl = `/search?query=${query}`;

	res.render("search-items");
}));

router.get("/tags", asyncHandler(async (req, res, next) => {
	const itemsCollection = await db.getCollection("items");
	const tagsData = await itemsCollection.aggregate([
		{ $match: { userId: req.session.user._id.toString() } },
		{ $unwind: "$tags" },
		{ $group: { _id: "$tags", count: { $sum: 1 } } },
		{ $sort: { count: -1, _id: 1 }}
	]).toArray();

	res.locals.tagsData = tagsData;
	
	res.render("tags");
}));

module.exports = router;
