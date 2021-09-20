const debug = require("debug");
const crypto = require("crypto");
const { DateTime } = require("luxon");

const appConfig = require("./config.js");
const appUtils = require("@janoside/app-utils");

const utils = appUtils.utils;
const passwordUtils = appUtils.passwordUtils;
const mongoClient = appUtils.mongoClient;

const debugLog = debug("app:main");


async function authenticate(username, password, passwordPreHashed=false) {
	var user = await db.findOne("users", {username:username});

	if (user == null) {
		debugLog(`User authentication failed: ${username} doesn't exist`);

		return null;
	}

	var passwordMatch = false;
	if (passwordPreHashed) {
		passwordMatch = (password == user.passwordHash);

	} else {
		passwordMatch = await passwordUtils.verify(password, user.passwordHash);
	}

	if (!passwordMatch) {
		debugLog(`User authentication failed: ${username} - password mismatch`);

		return null;
	}

	debugLog(`User authenticated: ${username}`);

	return user;
}


async function addLink(user, link) {
	db.insertMany("links", [link]);
}

module.exports = {
	authenticate: authenticate,
}
