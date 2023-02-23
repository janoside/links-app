const express = require("express");
const debug = require("debug");
const asyncHandler = require("express-async-handler");

const router = express.Router();

const app = require("../app/app.js");

const debugLog = debug("app:rootRouter");

const appUtils = require("../app/app-utils");
const utils = appUtils.utils;


router.get("*", asyncHandler(async (req, res, next) => {
	var loginNeeded = false;

	if (req.session.username == null) {
		loginNeeded = true;

	} else if (!req.session.user.roles || !req.session.user.roles.includes("admin")) {
		loginNeeded = true;
	}

	if (loginNeeded) {
		req.session.userMessage = "Admin user account required.";

		res.redirect("/");

	} else {
		next();
	}
}));

router.get("/", asyncHandler(async (req, res, next) => {
	res.render("admin/home");
}));

router.get("/users", asyncHandler(async (req, res, next) => {
	res.locals.limit = 20;
	res.locals.offset = 0;

	if (req.query.limit) {
		res.locals.limit = parseInt(req.query.limit);
	}

	if (req.query.offset) {
		res.locals.offset = parseInt(req.query.offset);
	}

	const itemsCollection = await db.getCollection("items");

	const usersCollection = await db.getCollection("users");
	res.locals.userCount = await usersCollection.countDocuments();
	
	let users = await db.findMany("users", {}, {limit:res.locals.limit, skip:res.locals.offset});

	let itemCountsByUserId = {};
	for (let i = 0; i < users.length; i++) {
		let user = users[i];

		let itemCount = await itemsCollection.countDocuments({ userId: user._id.toString() });

		itemCountsByUserId[user._id.toString()] = itemCount;
	}

	res.locals.users = users;
	res.locals.itemCountsByUserId = itemCountsByUserId;

	res.locals.paginationItemCount = res.locals.userCount;
	res.locals.paginationBaseUrl = "/admin/users";

	res.render("admin/users");
}));

router.get("/user/:userId", asyncHandler(async (req, res, next) => {
	const userId = req.params.userId;
	
	const user = await db.findOne("users", {_id:userId});

	const itemsCollection = await db.getCollection("items");

	const itemCount = await itemsCollection.countDocuments({ userId: userId });

	res.locals.user = user;
	res.locals.itemCount = itemCount;

	res.render("admin/user");
}));

router.get("/user/:userId/add-role/:role", asyncHandler(async (req, res, next) => {
	const userId = req.params.userId;
	const role = req.params.role;

	const user = await db.findOne("users", {_id:userId});

	if (!user.roles) {
		user.roles = [];
	}

	user.roles.push(role);

	const usersCollection = await db.getCollection("users");
	const updateResult = await usersCollection.updateOne({_id:user._id}, {$set: user});

	req.session.userMessage = `Modified user ${userId} ('${user.username}')`;
	req.session.userMessageType = "success";

	res.redirect(`/admin/user/${userId}`);
}));

router.get("/user/:userId/delete", asyncHandler(async (req, res, next) => {
	const userId = req.params.userId;

	if (userId == req.session.user._id.toString()) {
		req.session.userMessageType = "danger";
		req.session.userMessage = "You can't delete your own account!";

		res.redirect("/admin/users");

		return;
	}

	const user = await db.findOne("users", {_id:userId});

	const itemsCollection = await db.getCollection("items");

	const itemCount = await itemsCollection.countDocuments({ userId: userId });

	res.locals.user = user;
	res.locals.itemCount = itemCount;

	res.render("admin/delete-user");
}));

router.post("/user/:userId/delete", asyncHandler(async (req, res, next) => {
	const userId = req.params.userId;

	await db.deleteOne("users", {_id:userId});

	req.session.userMessage = `Deleted user ${userId}`;
	req.session.userMessageType = "success";

	res.redirect("/admin/users");
}));


router.get("/data-migrations", asyncHandler(async (req, res, next) => {
	const dataMigrationsCollection = await db.getCollection("dataMigrations");
	res.locals.dataMigrationsCount = await dataMigrationsCollection.countDocuments();
	
	const dataMigrations = await db.findMany("dataMigrations", {});

	res.locals.dataMigrations = dataMigrations;

	res.render("admin/dataMigrations");
}));


module.exports = router;
