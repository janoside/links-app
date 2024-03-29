require("dotenv").config();

const fs = require('fs');
const createError = require("http-errors");
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const session = require("express-session");
const MemoryStore = require('memorystore')(session);
const { DateTime } = require("luxon");
const app = require("./app/app.js");

const { marked } = require("marked");
marked.use({
	headerIds: false
});

const simpleGit = require('simple-git');
simpleGit().clean(simpleGit.CleanOptions.FORCE);

const appUtils = require("./app/app-utils");
const utils = appUtils.utils;
const linksUtils = require("./app/utils.js");

const debugLog = require("debug")("app:app");

const package_json = require('./package.json');
global.appVersion = package_json.version;

const appConfig = require("./app/config.js");

const rootRouter = require("./routes/rootRouter.js");
const adminRouter = require("./routes/adminRouter.js");
const accountRouter = require("./routes/accountRouter.js");
const imgRouter = require("./routes/imgRouter.js");
const fileRouter = require("./routes/fileRouter.js");

const expressApp = express();

const dbSetup = require("./app/dbSetup.js");


process.on("unhandledRejection", (reason, p) => {
	debugLog("Unhandled Rejection at: Promise", p, "reason:", reason, "stack:", (reason != null ? reason.stack : "null"));
});

expressApp.onStartup = function() {
	global.appStartDate = new Date();
	global.nodeVersion = process.version;

	(async () => {
		try {
			let db = await dbSetup.connect();

		} catch (err) {
			utils.logError("db-connection-failure", err);
		}
	})();

	if (global.sourcecodeVersion == null && fs.existsSync('.git')) {
		simpleGit(".").log(["-n 1"], function(err, log) {
			if (err) {
				utils.logError("3fehge9ee", err, {desc:"Error accessing git repo"});

				debugLog(`Starting ${global.appConfig.siteName}, v${global.appVersion} (code: unknown commit)`);

			} else {
				global.sourcecodeVersion = log.all[0].hash.substring(0, 10);
				global.sourcecodeDate = log.all[0].date.substring(0, "0000-00-00".length);

				debugLog(`Starting ${global.appConfig.siteName}, v${global.appVersion} (commit: '${global.sourcecodeVersion}', date: ${global.sourcecodeDate})`);
			}
		});

	} else {
		debugLog(`Starting ${global.appConfig.siteName}, v${global.appVersion}`);
	}
};

// view engine setup
expressApp.set("views", path.join(__dirname, "views"));
expressApp.set("view engine", "pug");

expressApp.disable("x-powered-by");

const sessionConfig = {
	secret: appConfig.cookiePassword,
	resave: false,
	saveUninitialized: true,
	cookie: {
		secure: appConfig.secureSite,
		domain: appConfig.siteDomain
	}
};

// Helpful reference for production: nginx HTTPS proxy:
// https://gist.github.com/nikmartin/5902176
debugLog(`Session config: ${JSON.stringify(sessionConfig)}`);

sessionConfig.store = new MemoryStore({
	checkPeriod: 86400000 // prune expired entries every 24h
});

expressApp.enable("trust proxy");
expressApp.set("trust proxy", 1); // trust first proxy, needed for {cookie:{secure:true}} below

expressApp.use(session(sessionConfig));

global.projectRootDir = __dirname;
global.uploadsDir = path.join(global.projectRootDir, "uploads");

expressApp.use(logger('dev'));
expressApp.use(express.json({ limit: '50mb' }));
expressApp.use(express.urlencoded({ extended: true, limit: '50mb' }));
expressApp.use(cookieParser());
expressApp.use(express.static(path.join(__dirname, "public")));

expressApp.use(async (req, res, next) => {
	res.locals.appConfig = global.appConfig;
	res.locals.session = req.session;

	res.locals.baseUrl = global.appConfig.baseUrl;

	// rememberme auto-login
	if (!req.session.username && req.cookies.rememberme) {
		var rememberme = JSON.parse(req.cookies.rememberme);
		
		var user = await app.authenticate(rememberme.username, rememberme.passwordHash, true);
		if (user) {
			req.session.username = rememberme.username;
			req.session.user = user;
		}


		if (!req.cookies.remembermeAccounts) {
			res.cookie("remembermeAccounts", JSON.stringify([rememberme]), {
				maxAge: (3 * utils.monthMillis()),
				httpOnly: appConfig.secureSite
			});
		}
	}

	// remembermeAccunts auto-load
	if (!req.session.accounts && req.cookies.remembermeAccounts) {
		var remembermeAccounts = JSON.parse(req.cookies.remembermeAccounts);
		
		req.session.accounts = [];
		for (let i = 0; i < remembermeAccounts.length; i++) {
			let account = remembermeAccounts[i];

			var user = await app.authenticate(account.username, account.passwordHash, true);
			if (user) {
				req.session.accounts.push(user);
			}
		}
	}

	if (req.session.userMessage) {
		res.locals.userMessage = req.session.userMessage;
		req.session.userMessage = null;
	}

	if (req.session.userMessageMarkdown) {
		res.locals.userMessageMarkdown = req.session.userMessageMarkdown;
		req.session.userMessageMarkdown = null;
	}

	// default "info" style for user messages
	res.locals.userMessageType = "info";
	if (req.session.userMessageType) {
		res.locals.userMessageType = req.session.userMessageType;
		req.session.userMessageType = null;
	}

	if (req.session.userErrors && req.session.userErrors.length > 0) {
		res.locals.userErrors = req.session.userErrors;

		req.session.userErrors = null;
	}



	if (!req.session.userSettings) {
		req.session.userSettings = JSON.parse(req.cookies["user-settings"] || "{}");
	}

	const userSettings = req.session.userSettings;
	res.locals.userSettings = userSettings;

	if (!userSettings.uiTheme) {
		userSettings.uiTheme = "light";
	}


	res.locals.user = req.session.user;

	if (req.session.user) {
		res.locals.pinnedItemCount = await db.countDocuments("items", { userId: req.session.user._id.toString(), pinned:true });

		
		if (req.session.user.favoriteTags) {
			const favoriteTagsData = await db.aggregate(
				"items",
				[
					{ $match: { userId: req.session.user._id.toString(), tags: {$in: req.session.user.favoriteTags} } },
					{ $unwind: "$tags" },
					{ $group: { _id: "$tags", count: { $sum: 1 } } },
					{ $sort: { count: -1, _id: 1 }}
				]).toArray();

			let favoriteTagCounts = {};
			for (let i = 0; i < favoriteTagsData.length; i++) {
				let x = favoriteTagsData[i];

				favoriteTagCounts[x._id] = x.count;
			}

			req.session.favoriteTagCounts = favoriteTagCounts;
			res.locals.favoriteTagCounts = req.session.favoriteTagCounts;
		}
	}
	
	

	res.locals.url = req.url;
	res.locals.path = req.path;

	next();
});

expressApp.use("/admin", adminRouter);
expressApp.use("/account", accountRouter);
expressApp.use("/img", imgRouter);
expressApp.use("/file", fileRouter);
expressApp.use("/", rootRouter);


// catch 404 and forward to error handler
expressApp.use(function(req, res, next) {
	next(createError(404));
});

// error handler
expressApp.use(function(err, req, res, next) {
	// set locals, only providing error in development
	res.locals.message = err.message;
	res.locals.error = req.app.get("env") === "development" ? err : {};

	// render the error page
	res.status(err.status || 500);
	res.render("error");
});


expressApp.locals.marked = marked;
expressApp.locals.DateTime = DateTime;
expressApp.locals.utils = utils;
expressApp.locals.linksUtils = linksUtils;


module.exports = expressApp;
