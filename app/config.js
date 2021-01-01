require("dotenv").config();

var debug = require("debug");
debug.enable(process.env.DEBUG || "app:*");

global.appConfig = {
	siteDomain: process.env.SITE_DOMAIN || "localhost",
	siteName: process.env.SITE_NAME || "UnknownSite",
	secureSite: process.env.SECURE_SITE == "true",
	cookiePassword: process.env.COOKIE_PASSWORD || "c-is-for-cookie",

	db: {
		host: process.env.DB_HOST || "127.0.0.1",
		port: process.env.DB_PORT || "27017",
		name: process.env.DB_NAME || "dbname",

		username: process.env.DB_USERNAME || "",
		password: process.env.DB_PASSWORD || "",

		adminUser: {
			username: process.env.ADMIN_USERNAME || "admin",
			password: process.env.ADMIN_PASSWORD || "admin"
		}
	}
};

module.exports = global.appConfig;