var express = require("express");
var router = express.Router();
var app = require("../app/main.js");
var utils = require("../app/util/utils.js");
var debugLog = require("debug")("app:rootRouter");
const asyncHandler = require("express-async-handler");
const passwordUtils = require("../app/util/password.js");
const appConfig = require("../app/config.js");

router.get("/", asyncHandler(async (req, res, next) => {
	res.render("index");
}));

router.post("/login", asyncHandler(async (req, res, next) => {
	var user = await app.authenticate(req.body.username, req.body.password);

	if (user) {
		req.session.username = user.username;
		req.session.user = user;

		req.session.userMessage = "Success!";
		req.session.userMessageType = "success";

		if (req.body.rememberme) {
			var props = {username:req.body.username, passwordHash:user.passwordHash};

			res.cookie("rememberme", JSON.stringify(props), {
				maxAge: (3 * utils.monthMillis()),
				httpOnly: appConfig.secureSite
			});

		} else {
			res.clearCookie("rememberme");
		}

		res.redirect("/");

	} else {
		next();
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

router.get("/admin", asyncHandler(async (req, res, next) => {
	res.render("admin");
}));

module.exports = router;
