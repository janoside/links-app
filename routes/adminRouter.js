const express = require("express");
const debug = require("debug");
const asyncHandler = require("express-async-handler");

const router = express.Router();

const app = require("../app/app.js");

const debugLog = debug("app:rootRouter");

const appUtils = require("@janoside/app-utils");
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

	var userCollection = await db.getCollection("users");
	res.locals.userCount = await userCollection.countDocuments();
	
	var users = await db.findMany("users", {}, {limit:res.locals.limit, skip:res.locals.offset});

	res.locals.users = users;

	res.locals.paginationItemCount = res.locals.userCount;
	res.locals.paginationBaseUrl = "/admin/users";

	res.render("admin/users");
}));

router.get("/user/:username", asyncHandler(async (req, res, next) => {
	var username = req.params.username;
	
	var user = await db.findOne("users", {username:username});

	const linksCollection = await db.getCollection("links");

	const linkCount = await linksCollection.countDocuments({ username: username });

	res.locals.user = user;
	res.locals.linkCount = linkCount;

	res.render("admin/user");
}));

router.get("/user/:username/delete", asyncHandler(async (req, res, next) => {
	var username = req.params.username;

	await db.deleteObject("users", {username:username});

	req.session.userMessage = `Deleted user '${username}'`;
	req.session.userMessageType = "success";

	res.redirect("/admin/users");
}));


module.exports = router;
