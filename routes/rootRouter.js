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
const Busboy = require('busboy');
const { DateTime } = require("luxon");

const debugLog = debug("app:rootRouter");

const appUtils = require("../app/app-utils");
const utils = appUtils.utils;
const passwordUtils = appUtils.passwordUtils;
const encryptionUtils = appUtils.encryptionUtils;
const s3Utils = appUtils.s3Utils;

const encryptor = encryptionUtils.encryptor(appConfig.encryptionPassword, appConfig.pbkdf2Salt);
const s3Bucket = s3Utils.createBucket(appConfig.s3Bucket, appConfig.s3PathPrefix, appConfig.s3BucketOptions);



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
					["pinned", -1],
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

	let user = {
		username: username,
		passwordHash: passwordHash
	};

	const insertedUserId = await db.insertOne("users", user);
	user = await app.authenticate(req.body.username, req.body.password);

	req.session.username = username;
	req.session.user = user;

	req.session.userMessage = "Success!";
	req.session.userMessageType = "success";

	if (req.body.rememberme) {
		const props = {username:req.body.username, passwordHash:user.passwordHash};

		res.cookie("rememberme", JSON.stringify(props), {
			maxAge: (3 * utils.monthMillis()),
			httpOnly: appConfig.secureSite
		});

		res.cookie("remembermeAccounts", JSON.stringify([props]), {
			maxAge: (3 * utils.monthMillis()),
			httpOnly: appConfig.secureSite
		});

	} else {
		res.clearCookie("rememberme");
		res.clearCookie("remembermeAccounts");
	}

	res.redirect("/");
}));

router.post("/login", asyncHandler(async (req, res, next) => {
	const user = await app.authenticate(req.body.username, req.body.password);

	if (user) {
		user.lastLogin = new Date();

		const usersCollection = await db.getCollection("users");
		const updateResult = await usersCollection.updateOne({_id:user._id}, {$set:{lastLogin:user.lastLogin}});

		req.session.username = user.username;
		req.session.user = user;
		req.session.accounts = [user];

		req.session.userMessage = "Success!";
		req.session.userMessageType = "success";

		if (req.body.rememberme) {
			const props = {username:req.body.username, passwordHash:user.passwordHash};

			res.cookie("rememberme", JSON.stringify(props), {
				maxAge: (3 * utils.monthMillis()),
				httpOnly: appConfig.secureSite
			});

			res.cookie("remembermeAccounts", JSON.stringify([props]), {
				maxAge: (3 * utils.monthMillis()),
				httpOnly: appConfig.secureSite
			});

		} else {
			res.clearCookie("rememberme");
			res.clearCookie("remembermeAccounts");
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
	res.clearCookie("remembermeAccounts");

	res.redirect("/");
});

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

	var busboy = Busboy({ headers: req.headers });
	busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
		file.on('data', (data) => {
			const dataBuffer = Buffer.from(data);

			if (fields[fieldname] == null) {
				fields[fieldname] = dataBuffer;

				// "filename" here actually gives us a dict with filename, encoding, and mimeType *shrug*
				fields[`${fieldname}.metadata`] = filename;

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
	busboy.on('close', async () => {
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

	if (req.body.textType) {
		item.textType = req.body.textType;
	}

	if (req.body.tags) {
		item.tags = req.body.tags.split(",").map(x => x.trim().toLowerCase());
	}

	if (req.body.dueDate) {
		let dueDate = DateTime.fromISO(req.body.dueDate);
		
		if (dueDate.invalid) {
			dueDate = DateTime.fromSQL(req.body.dueDate);
		}

		if (!dueDate.invalid) {
			item.dueDate = dueDate;
		}
	}

	if (req.body.startDate) {
		let startDate = DateTime.fromISO(req.body.startDate);
		
		if (startDate.invalid) {
			startDate = DateTime.fromSQL(req.body.startDate);
		}

		if (!startDate.invalid) {
			item.startDate = startDate;
		}
	}

	if (req.body.endDate) {
		let endDate = DateTime.fromISO(req.body.endDate);
		
		if (endDate.invalid) {
			endDate = DateTime.fromSQL(req.body.endDate);
		}

		if (!endDate.invalid) {
			item.endDate = endDate;
		}
	}

	const savedItemId = await db.insertOne("items", item);

	req.session.userMessage = "Saved!";
	req.session.userMessageType = "success";

	res.redirect(`/item/${savedItemId}`);
}));

router.post("/edit-note/:itemId", asyncHandler(async (req, res, next) => {
	const itemId = req.params.itemId;
	const item = await db.findOne("items", {_id:itemId});

	if (req.body.text) {
		item.text = req.body.text;
	}

	if (req.body.url) {
		item.url = req.body.url;
	}

	if (req.body.tags) {
		item.tags = req.body.tags.split(",").map(x => x.trim().toLowerCase());
	}

	if (req.body.textType) {
		item.textType = req.body.textType;
	}

	if (req.body.dueDate) {
		let dueDate = DateTime.fromISO(req.body.dueDate);
		
		if (dueDate.invalid) {
			dueDate = DateTime.fromSQL(req.body.dueDate);
		}

		if (!dueDate.invalid) {
			item.dueDate = dueDate;
		}
	}

	if (req.body.startDate) {
		let startDate = DateTime.fromISO(req.body.startDate);
		
		if (startDate.invalid) {
			startDate = DateTime.fromSQL(req.body.startDate);
		}

		if (!startDate.invalid) {
			item.startDate = startDate;
		}
	}

	if (req.body.endDate) {
		let endDate = DateTime.fromISO(req.body.endDate);
		
		if (endDate.invalid) {
			endDate = DateTime.fromSQL(req.body.endDate);
		}

		if (!endDate.invalid) {
			item.endDate = endDate;
		}
	}

	const itemsCollection = await db.getCollection("items");
	const updateResult = await itemsCollection.updateOne({_id:itemId}, {$set: item});

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

router.get("/new-file", asyncHandler(async (req, res, next) => {
	res.render("new-file");
}));

router.post("/new-file", asyncHandler(async (req, res, next) => {
	saveItemRoute(null, "file", req, res, next);
}));

router.get("/item/:itemId", asyncHandler(async (req, res, next) => {
	if (!req.session.user) {
		req.session.redirectUrl = req.path;
		res.redirect("/");

		return;
	}

	const itemId = req.params.itemId;
	const item = await db.findOne("items", {_id:itemId});

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
	const item = await db.findOne("items", {_id:itemId});

	res.locals.item = item;

	if (!item.type || item.type == "link") {
		res.render("edit-link");

	} else if (item.type == "note") {
		res.render("edit-note");

	} else if (item.type == "image") {
		res.render("edit-image");

	} else if (item.type == "file") {
		res.render("edit-file");

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
	const item = await db.findOne("items", {_id:itemId});

	if (req.session.username != item.username) {
		res.redirect("/");

		return;
	}

	res.locals.item = item;

	res.render("raw-item");
}));

router.get("/item/:itemId/delete", asyncHandler(async (req, res, next) => {
	const itemId = req.params.itemId;
	const item = await db.findOne("items", {_id:itemId});

	if (item.locked) {
		req.session.userMessage = "This item is locked. It must be unlocked before it may be deleted.";
		req.session.userMessageType = "warning";

		res.redirect(`/item/${itemId}`);

		return;
	}

	res.locals.item = item;

	res.render("delete-item");
}));

router.post("/item/:itemId/delete", asyncHandler(async (req, res, next) => {
	const itemId = req.params.itemId;
	const item = await db.findOne("items", {_id:itemId});

	const result = await db.deleteOne("items", {_id:item._id});

	debugLog("Deleted item: " + JSON.stringify(result));

	if (item.hasImage) {
		for (let i = 0; i < item.imageSizes.length; i++) {
			await s3Bucket.del(`img/${itemId}/${item.imageSizes[i]}`);
		}

		debugLog(`Deleted ${item.imageSizes.length} image(s)`);
	}

	if (item.hasFile) {
		await s3Bucket.del(`file/${itemId}`);
	}
	
	req.session.userMessage = "Item deleted.";
	req.session.userMessageType = "success";

	res.redirect("/");
}));

router.get("/item/:itemId/pin", asyncHandler(async (req, res, next) => {
	const itemId = req.params.itemId;

	const itemsCollection = await db.getCollection("items");
	const result = await itemsCollection.updateOne({_id:itemId}, {$set: {pinned: true}});

	req.session.userMessage = "Item pinned";
	req.session.userMessageType = "success";

	res.redirect(req.headers.referer);
}));

router.get("/item/:itemId/unpin", asyncHandler(async (req, res, next) => {
	const itemId = req.params.itemId;

	const itemsCollection = await db.getCollection("items");
	const result = await itemsCollection.updateOne({_id:itemId}, {$unset: {pinned: true}});

	req.session.userMessage = "Item unpinned";
	req.session.userMessageType = "success";

	res.redirect(req.headers.referer);
}));

router.get("/item/:itemId/lock", asyncHandler(async (req, res, next) => {
	const itemId = req.params.itemId;

	const itemsCollection = await db.getCollection("items");
	const result = await itemsCollection.updateOne({_id:itemId}, {$set: {locked: true}});

	req.session.userMessage = "Item locked";
	req.session.userMessageType = "success";

	res.redirect(req.headers.referer);
}));

router.get("/item/:itemId/unlock", asyncHandler(async (req, res, next) => {
	const itemId = req.params.itemId;

	const itemsCollection = await db.getCollection("items");
	const result = await itemsCollection.updateOne({_id:itemId}, {$unset: {locked: true}});

	req.session.userMessage = "Item unlocked";
	req.session.userMessageType = "success";

	res.redirect(req.headers.referer);
}));

router.get("/share/:itemId", asyncHandler(async (req, res, next) => {
	const itemId = req.params.itemId;
	const item = await db.findOne("items", {_id:itemId});

	res.locals.item = item;

	res.render("share");
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

router.get("/pinned", asyncHandler(async (req, res, next) => {
	const items = await db.findMany(
		"items",
		{
			userId: req.session.user._id.toString(),
			pinned: true
		},
		{
			sort: [
				["createdAt", -1]
			]
		});

	const itemsCollection = await db.getCollection("items");

	const itemCount = await itemsCollection.countDocuments({
		userId: req.session.user._id.toString(),
		pinned: true
	});

	const tagsData = await itemsCollection.aggregate([
		{ $match: { userId: req.session.user._id.toString(), pinned: true } },
		{ $unwind: "$tags" },
		{ $group: { _id: "$tags", count: { $sum: 1 } } },
		{ $sort: { count: -1, _id: 1 }}
	]).toArray();

	res.locals.itemCount = itemCount;
	res.locals.items = items;
	res.locals.tagsData = tagsData;

	res.render("pinned-items");
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


router.get("/favorite-tags/add/:tag", asyncHandler(async (req, res, next) => {
	let tag = req.params.tag;

	if (!req.session.user.favoriteTags) {
		req.session.user.favoriteTags = [];
	}

	req.session.user.favoriteTags.push(tag);
	
	const usersCollection = await db.getCollection("users");
	const updateResult = await usersCollection.updateOne({_id:req.session.user._id}, {$set:{favoriteTags:req.session.user.favoriteTags}});

	req.session.userMessage = "Success!";
	req.session.userMessageType = "success";

	
	res.redirect(req.headers.referer);
}));

router.get("/favorite-tags/remove/:tag", asyncHandler(async (req, res, next) => {
	let tag = req.params.tag;

	if (!req.session.user.favoriteTags) {
		res.redirect(req.headers.referer);

		return;
	}

	req.session.user.favoriteTags = req.session.user.favoriteTags.filter(e => { e !== tag });
	
	const usersCollection = await db.getCollection("users");
	const updateResult = await usersCollection.updateOne({_id:req.session.user._id}, {$set:{favoriteTags:req.session.user.favoriteTags}});

	req.session.userMessage = "Success!";
	req.session.userMessageType = "success";

	
	res.redirect(req.headers.referer);
}));


module.exports = router;
