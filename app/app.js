const MongoClient = require("mongodb").MongoClient;
const appConfig = require("./config.js");
const debug = require("debug");
const crypto = require("crypto");
const passwordUtils = require("./util/password.js");
const utils = require("./util/utils.js");
const { DateTime } = require("luxon");

var debugLog = debug("app:main");
var db = require("./db.js");

async function authenticate(username, password, passwordPreHashed=false) {
	var user = await db.findObject("users", {username:username});

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
	db.insertObjects("links", [link]);
}

module.exports = {
	authenticate: authenticate,
}
