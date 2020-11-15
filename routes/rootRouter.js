const express = require("express");
const router = express.Router();
const app = require("../app/app.js");
const utils = require("../app/util/utils.js");
const debugLog = require("debug")("app:rootRouter");
const asyncHandler = require("express-async-handler");
const passwordUtils = require("../app/util/password.js");
const appConfig = require("../app/config.js");
const db = require("../app/db.js");
const { ObjectID } = require("mongodb");
const MongoObjectID = require("mongodb").ObjectID;

router.get("/", asyncHandler(async (req, res, next) => {
	if (req.session.user) {
		var quotesCollection = await db.getCollection("quotes");

		res.locals.quoteCount = await quotesCollection.countDocuments({userId:req.session.user._id.toString()});

		const tagsData = await quotesCollection.aggregate([
			{ $match: { userId: req.session.user._id.toString() } },
			{ $unwind: "$tags" },
			{ $group: { _id: "$tags", count: { $sum: 1 } } },
			{ $sort: { count: -1 }}
		]).toArray();

		const speakersData = await quotesCollection.aggregate([
			{ $match: { userId: req.session.user._id.toString() } },
			{ $unwind: "$speakers" },
			{ $group: { _id: "$speakers", count: { $sum: 1 } } },
			{ $sort: { count: -1, _id: 1 }}
		]).toArray();

		res.locals.tagCount = tagsData.length;
		res.locals.speakerCount = speakersData.length;
	}

	res.render("index");
}));

router.get("/signup", asyncHandler(async (req, res, next) => {
	res.render("signup");
}));

router.post("/signup", asyncHandler(async (req, res, next) => {
	const username = req.body.username;
	const passwordHash = await passwordUtils.hash(req.body.password);

	const existingUser = await db.findObject("users", {username:username});
	if (existingUser) {
		debugLog("Username already exists");

		res.locals.userMessage = "Sorry, that username is already taken.";
		res.locals.userMessageType = "danger";

		res.render("signup");

		return;
	}

	const user = {
		username: username,
		passwordHash: passwordHash
	};

	const insertedUser = await db.insertObject("users", user);

	req.session.username = username;
	req.session.user = insertedUser;

	req.session.userMessage = "Success!";
	req.session.userMessageType = "success";

	if (req.body.rememberme) {
		const props = {username:req.body.username, passwordHash:user.passwordHash};

		res.cookie("rememberme", JSON.stringify(props), {
			maxAge: (3 * utils.monthMillis()),
			httpOnly: appConfig.secureSite
		});

	} else {
		res.clearCookie("rememberme");
	}

	res.redirect("/");
}));

router.post("/login", asyncHandler(async (req, res, next) => {
	const user = await app.authenticate(req.body.username, req.body.password);

	if (user) {
		req.session.username = user.username;
		req.session.user = user;

		req.session.userMessage = "Success!";
		req.session.userMessageType = "success";

		if (req.body.rememberme) {
			const props = {username:req.body.username, passwordHash:user.passwordHash};

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

router.get("/account", asyncHandler(async (req, res, next) => {
	const quotesCollection = await db.getCollection("quotes");
	const importData = await quotesCollection.aggregate([
		{
			$match: { userId: req.session.user._id.toString() }
		},
		{
			$group: {
				_id: "$importId",
				count: { $sum: 1 },
				name: { $first: "$importName" }
			}
		},
		{
			$sort: { count: -1 }
		}
	]).toArray();

	const lists = await db.findObjects("quoteLists", { userId: req.session.user._id.toString() });

	res.locals.lists = lists;
	res.locals.importData = importData;

	res.render("account");
}));

router.get("/new-quote", asyncHandler(async (req, res, next) => {
	res.render("new-quote");
}));

router.post("/new-quote", asyncHandler(async (req, res, next) => {
	const content = req.body.text;

	const quote = app.quoteFromTextRepresentation(content, req.session.user);
	const savedQuote = await db.insertObject("quotes", quote);

	req.session.userMessage = "Saved!";
	req.session.userMessageType = "success";

	res.redirect(`/quote/${savedQuote._id.toString()}`);
}));

router.get("/quote/:quoteId", asyncHandler(async (req, res, next) => {
	const quoteId = req.params.quoteId;
	const quote = await db.findObject("quotes", {_id:ObjectID(quoteId)});

	res.locals.quote = quote;

	res.render("quote");
}));

router.get("/quote/:quoteId/edit", asyncHandler(async (req, res, next) => {
	const quoteId = req.params.quoteId;
	const quote = await db.findObject("quotes", {_id:ObjectID(quoteId)});

	res.locals.quote = quote;
	res.locals.quoteTextRepresentation = app.quoteToTextRepresentation(quote);

	res.render("quote-edit");
}));

router.get("/quote/:quoteId/raw", asyncHandler(async (req, res, next) => {
	const quoteId = req.params.quoteId;
	const quote = await db.findObject("quotes", {_id:ObjectID(quoteId)});

	res.locals.quote = quote;

	res.render("quote-raw");
}));

router.post("/quote/:quoteId/edit", asyncHandler(async (req, res, next) => {
	const quoteId = req.params.quoteId;
	const updatedQuote = app.quoteFromTextRepresentation(req.body.content, req.session.user);
	const existingQuote = await db.findObject("quotes", {_id:ObjectID(quoteId)});

	debugLog("updatedQuote: " + JSON.stringify(updatedQuote));

	const updatedQuoteProps = utils.objectProperties(updatedQuote);
	for (const prop in updatedQuoteProps) {
		existingQuote[prop] = updatedQuote[prop];
	}

	const quotesCollection = await db.getCollection("quotes");
	const updateResult = await quotesCollection.updateOne({_id:ObjectID(quoteId)}, {$set: updatedQuote});

	req.session.userMessage = updateResult.result.ok == 1 ? "Quote saved." : ("Status unknown: " + JSON.stringify(updateResult));
	req.session.userMessageType = "success";

	res.redirect(`/quote/${quoteId}`);
}));

router.get("/quote/:quoteId/delete", asyncHandler(async (req, res, next) => {
	const quoteId = req.params.quoteId;
	const quote = await db.findObject("quotes", {_id:ObjectID(quoteId)});

	res.locals.quote = quote;

	res.render("quote-delete");
}));

router.post("/quote/:quoteId/delete", asyncHandler(async (req, res, next) => {
	const quoteId = req.params.quoteId;
	const quote = await db.findObject("quotes", {_id:ObjectID(quoteId)});

	const result = await db.deleteObject("quotes", {_id:quote._id});

	debugLog("deleteResult: " + JSON.stringify(result));
	
	req.session.userMessage = "Quote deleted."

	res.redirect("/");
}));

router.get("/:username/quotes", asyncHandler(async (req, res, next) => {
	const user = await db.findObject("users", {username:req.params.username});
	const quotes = await db.findObjects("quotes", {userId:user._id.toString()});

	res.locals.user = user;
	res.locals.quotes = quotes;

	res.render("user-quotes");
}));

router.get("/tag/:tag", asyncHandler(async (req, res, next) => {
	const tag = req.params.tag;
	const quotes = await db.findObjects("quotes", {
		$and: [
			{
				$or: [
					{ userId: req.session.user._id.toString() },
					{ visibility: "public" }
				]
			},
			{ tags: tag }
		]
	});

	res.locals.tag = tag;
	res.locals.quotes = quotes;

	res.render("tag-quotes");
}));

router.get("/speaker/:speaker", asyncHandler(async (req, res, next) => {
	const speaker = req.params.speaker;
	const quotes = await db.findObjects("quotes", {
		$and: [
			{
				$or: [
					{ userId: req.session.user._id.toString() },
					{ visibility: "public" }
				]
			},
			{ speakers: speaker }
		]
	});

	res.locals.speaker = speaker;
	res.locals.quotes = quotes;

	res.render("speaker-quotes");
}));

router.get("/import", asyncHandler(async (req, res, next) => {
	res.render("import");
}));

router.post("/import", asyncHandler(async (req, res, next) => {
	const name = req.body.name;
	const content = req.body.content;
	const public = req.body.public ? true : false;

	const importData = await app.importQuotesFromText(name, content, public, req.session.user);

	res.redirect(`/import/${importData.importId}`);
}));

router.get("/import/:importId", asyncHandler(async (req, res, next) => {
	const importId = req.params.importId;
	const quotes = await db.findObjects("quotes", {importId:importId});
	const quotesCollection = await db.getCollection("quotes");
	const uniqueSpeakers = await quotesCollection.distinct("speakers", {importId:importId});
	
	res.locals.importId = importId;
	res.locals.uniqueSpeakers = uniqueSpeakers;
	res.locals.quotes = quotes;

	res.render("import-quotes");
}));

router.get("/import/:importId/delete", asyncHandler(async (req, res, next) => {
	const importId = req.params.importId;
	const quotes = await db.findObjects("quotes", {importId:importId});
	const quotesCollection = await db.getCollection("quotes");
	const uniqueSpeakers = await quotesCollection.distinct("speakers", {importId:importId});
	
	res.locals.importId = importId;
	res.locals.uniqueSpeakers = uniqueSpeakers;
	res.locals.quotes = quotes;
	res.locals.deleteConfirm = true;

	res.render("import-quotes");
}));

router.get("/import/:importId/export", asyncHandler(async (req, res, next) => {
	const importId = req.params.importId;
	const quotes = await db.findObjects("quotes", {importId:importId});

	var exportContent = "";
	quotes.forEach((quote) => {
		exportContent += app.quoteToTextRepresentation(quote);
		exportContent += "\n\n";
	});
	
	res.setHeader("content-type", "text/plain");
	res.send(exportContent);
}));

router.post("/import/:importId/delete", asyncHandler(async (req, res, next) => {
	const importId = req.params.importId;
	
	const quotesCollection = await db.getCollection("quotes");
	const deleteResult = await quotesCollection.deleteMany({importId:importId});

	req.session.userMessage = "Delete result: " + JSON.stringify(deleteResult);
	
	res.redirect("/imports");
}));

router.get("/imports", asyncHandler(async (req, res, next) => {
	const quotesCollection = await db.getCollection("quotes");
	const importData = await quotesCollection.aggregate([
		{
			$match: { userId: req.session.user._id.toString() }
		},
		{
			$group: {
				_id: "$importId",
				count: { $sum: 1 },
				name: { $first: "$importName" }
			}
		},
		{
			$sort: { count: -1 }
		}
	]).toArray();

	res.locals.importData = importData;

	res.render("imports");
}));

router.get("/search", asyncHandler(async (req, res, next) => {
	const query = req.query.query;
	const quotes = await db.findObjects("quotes", {
		$and: [
			{
				$or: [
					{ userId: req.session.user._id.toString() },
					{ visibility: "public" }
				]
			},
			{
				$or:[
					{text:new RegExp(query, "i")},
					{parts:new RegExp(query, "i")},
					{speakers:new RegExp(query, "i")},
					{speakerContexts:new RegExp(query, "i")}
				]
			}
		]
	});
	
	res.locals.query = query;
	res.locals.quotes = quotes;

	res.render("search-quotes");
}));

router.get("/tags", asyncHandler(async (req, res, next) => {
	const quotesCollection = await db.getCollection("quotes");
	const tagsData = await quotesCollection.aggregate([
		{ $match: { userId: req.session.user._id.toString() } },
		{ $unwind: "$tags" },
		{ $group: { _id: "$tags", count: { $sum: 1 } } },
		{ $sort: { count: -1 }}
	]).toArray();

	res.locals.tagsData = tagsData;
	
	res.render("tags");
}));

router.get("/speakers", asyncHandler(async (req, res, next) => {
	const quotesCollection = await db.getCollection("quotes");
	const speakersData = await quotesCollection.aggregate([
		{ $match: { userId: req.session.user._id.toString() } },
		{ $unwind: "$speakers" },
		{ $group: { _id: "$speakers", count: { $sum: 1 } } },
		{ $sort: { count: -1 }}
	]).toArray();

	res.locals.speakersData = speakersData;
	
	res.render("speakers");
}));

router.get("/new-list", asyncHandler(async (req, res, next) => {
	res.render("new-list");
}));

router.post("/new-list", asyncHandler(async (req, res, next) => {
	const name = req.body.name;

	const tagsAnd = req.body.tagsAnd.split(",").map((item) => {
		return item.trim();

	}).filter((item) => {
		return item.trim().length > 0;
	});

	const tagsOr = req.body.tagsOr.split(",").map((item) => {
		return item.trim();

	}).filter((item) => {
		return item.trim().length > 0;
	});

	const speakersAnd = req.body.speakersAnd.split(",").map((item) => {
		return item.trim();

	}).filter((item) => {
		return item.trim().length > 0;
	});

	const speakersOr = req.body.speakersOr.split(",").map((item) => {
		return item.trim();

	}).filter((item) => {
		return item.trim().length > 0;
	});

	// just use this default, we will modify it later
	const excludedQuoteIds = [];

	const list = await app.createList(req.session.user, name, tagsAnd, tagsOr, speakersAnd, speakersOr, excludedQuoteIds);

	res.redirect(`/list/${list._id.toString()}`);
}));

router.get("/list/:listId", asyncHandler(async (req, res, next) => {
	const listId = req.params.listId;
	const list = await db.findObject("quoteLists", {_id:new ObjectID(listId)});

	const queryAnds = [];
	
	// lists only include quotes from a particular user
	queryAnds.push({ userId: list.userId });

	if (list.tagsAnd.length > 0) {
		list.tagsAnd.forEach((tag) => {
			queryAnds.push({ tags: tag });
		});
	}

	if (list.tagsOr.length > 0) {
		const orTags = [];

		list.tagsOr.forEach((tag) => {
			orTags.push({ tags: tag });
		});

		queryAnds.push({ $or: orTags });
	}

	if (list.speakersAnd.length > 0) {
		list.speakersAnd.forEach((speaker) => {
			queryAnds.push({ speakers: speaker });
		});
	}

	if (list.speakersOr.length > 0) {
		const orSpeakers = [];

		list.speakersOr.forEach((speaker) => {
			orSpeakers.push({ speakers: speaker });
		});

		queryAnds.push({ $or: orSpeakers });
	}

	debugLog(`List: ${JSON.stringify(list)}, Query: ${JSON.stringify(queryAnds)}`);

	const quotes = await db.findObjects("quotes", {
		$and: queryAnds
	});
	
	res.locals.list = list;
	res.locals.quotes = quotes;
	res.locals.noTagLinks = true;
	res.locals.noUserLinks = true;
	res.locals.noSpeakerLinks = true;

	res.render("list");
}));

router.get("/list/:listId/:quoteId", asyncHandler(async (req, res, next) => {
	const list = await db.findObject("quoteLists", {_id:ObjectID(req.params.listId)});
	const quote = await db.findObject("quotes", {_id:ObjectID(req.params.quoteId)});

	res.locals.list = list;
	res.locals.quote = quote;
	res.locals.noTagLinks = true;
	res.locals.noUserLinks = true;
	res.locals.noSpeakerLinks = true;

	res.render("quote");
}));

module.exports = router;
