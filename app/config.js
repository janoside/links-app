require("dotenv").config();

var debug = require("debug");
debug.enable(process.env.DEBUG || "app:*");

let s3PathPrefix = (process.env.S3_PATH_PREFIX || "");
if (s3PathPrefix.length > 0 && !s3PathPrefix.endsWith("/")) {
	s3PathPrefix = (s3PathPrefix + "/");
}

global.appConfig = {
	siteDomain: process.env.SITE_DOMAIN || "localhost",
	siteName: process.env.SITE_NAME || "UnknownSite",
	secureSite: process.env.SECURE_SITE == "true",
	cookiePassword: process.env.COOKIE_PASSWORD || "c-is-for-cookie",

	baseUrl: process.env.SITE_BASE_URL,

	encryptionPassword: process.env.ENCRYPTION_PASSWORD,
	pbkdf2Salt: process.env.PBKDF2_SALT,

	s3Bucket: process.env.S3_BUCKET,
	s3PathPrefix: s3PathPrefix,

	images: {
		widths: (process.env.IMAGE_WIDTHS || "350").split(",").map(x => parseInt(x)),
		listWidth: parseInt(process.env.IMAGE_LIST_WIDTH || "350"),
		mainWidth: parseInt(process.env.IMAGE_MAIN_WIDTH || "350"),
	},

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

if (!global.appConfig.baseUrl) {
	global.appConfig.baseUrl = (global.appConfig.secureSite ? "https://" : "http://") + global.appConfig.siteDomain;
	
	if (global.appConfig.serverPort != (global.appConfig.secureSite ? 443 : 80)) {
		global.appConfig.baseUrl += (":" + global.appConfig.serverPort);
	}

	global.appConfig.baseUrl += "/";
}

module.exports = global.appConfig;