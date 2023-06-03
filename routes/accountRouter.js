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
const s3Bucket = appConfig.createAppBucket();



router.get("/", asyncHandler(async (req, res, next) => {
	res.render("account/index");
}));

router.get("/add-account", async (req, res, next) => {
	res.render("account/add-account");
});

router.post("/add-account", async (req, res, next) => {
	const user = await app.authenticate(req.body.username, req.body.password);

	if (user) {
		if (!user.multiloginPinHash) {
			req.session.userMessage = "Account not ready for multi-login - you need to set up the PIN first.";
			req.session.userMessageType = "danger";

			res.redirect("/");

			return;
		}

		user.lastLogin = new Date();

		const updateResult = await db.updateOne("users", {_id:user._id}, {$set:{lastLogin:user.lastLogin}});

		if (!req.session.accounts) {
			req.session.accounts = [req.session.user];
		}

		req.session.accounts.push(user);

		req.session.username = user.username;
		req.session.user = user;

		req.session.userMessage = "Success!";
		req.session.userMessageType = "success";

		
		// special remembermeAccounts that aggregates accounts
		let remembermeAccounts = JSON.parse(req.cookies.remembermeAccounts);
		const accountProps = {username:req.body.username, passwordHash:user.passwordHash};
		remembermeAccounts.push(accountProps);

		res.cookie("remembermeAccounts", JSON.stringify(remembermeAccounts), {
			maxAge: (3 * utils.monthMillis()),
			httpOnly: appConfig.secureSite
		});


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
});

router.get("/verify-multilogin-pin/:username", async (req, res, next) => {
	res.locals.username = req.params.username;

	res.render("account/verify-multilogin-pin");
});

router.post("/verify-multilogin-pin/:username", async (req, res, next) => {
	let username = req.params.username;
	let multiloginPin = req.body.multiloginPin;

	// similar to rememberme auto-login
	for (let i = 0; i < req.session.accounts.length; i++) {
		let account = req.session.accounts[i];

		if (account.username == username) {
			let user = await app.authenticate(account.username, account.passwordHash, true);
			
			if (user) {
				user = await app.verifyMultiloginPin(account.username, multiloginPin);

				if (user) {
					req.session.username = username;
					req.session.user = user;

					req.session.userMessage = `Switched to ${user.username}`;
					req.session.userMessageType = "success";

				} else {
					req.session.userMessage = "PIN verification failed";
					req.session.userMessageType = "danger";
				}
			} else {
				req.session.userMessage = "Login failed";
				req.session.userMessageType = "danger";
			}
		}
	}

	res.redirect("/");
});

router.get("/set-multilogin-pin", async (req, res, next) => {
	res.render("account/set-multilogin-pin");
});

router.post("/set-multilogin-pin", async (req, res, next) => {
	const pinHash = await passwordUtils.hash(req.body.multiloginPin);

	req.session.user.multiloginPinHash = pinHash;

	const updateResult = await db.updateOne("users", {_id:req.session.user._id}, {$set:{multiloginPinHash:req.session.user.multiloginPinHash}});

	req.session.userMessage = "PIN updated";
	req.session.userMessageType = "success";

	res.redirect("/account");
});


module.exports = router;
