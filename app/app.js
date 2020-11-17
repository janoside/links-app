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

async function importQuotesFromText(importName, importText, public, user) {
	const chunks = importText.split(/\r\n\r\n/);

	const importId = utils.randomString(1, "a") + utils.randomString(11, "a#");
	const importDate = DateTime.utc();

	const quotes = [];
	chunks.forEach((chunk, chunkIndex) => {
		const quote = quoteFromTextRepresentation(chunk, user);

		if (!quote.importName) {
			quote.importName = importName;
			quote.importId = importId;
			quote.importIndex = chunkIndex;
			quote.importDate = importDate;
		}
		
		if (!utils.objectHasProperty("visibility")) {
			// set default visibility based on passed-in "public" param
			// note that if there's a quote-specific visibility set in
			// the quote text representation, this does NOT override it
			quote.visibility = public ? "public" : "private";
		}

		quotes.push(quote);
	});

	await db.insertObjects("quotes", quotes);

	return {
		quotes: quotes,
		importId: importId,
		importDate: importDate,
		importName: importName
	}
}

/*

Format:

Line 1,1
Line 1,2
...
Line 1,N
-Speaker 1, speaker context 1
Line 2,1
...
Line 2,N
-Speaker 2, speaker context 2
...
@Date [Time]

*/
function quoteFromTextRepresentation(importChunk, user) {
	const lines = importChunk.split(/\n/);

	const quote = {
		userId: user._id.toString(),
		username: user.username,
		speakers: [],
		speakerContexts: [],
		parts: [],
		tags: []
	};

	var text = "";
	lines.forEach((line, lineIndex) => {
		if (line.trim().startsWith("@")) {
			// date

			// trim and move past "@"" char
			line = line.trim().substring(1).trim();

			if (line.length == "xxxx-xx-xx".length) {
				quote.date = DateTime.fromISO(line);

			} else if (line.length == "xxxx-xx-xx xx:xx:xx".length) {
				quote.date = DateTime.fromSQL(line);

			} else {
				quote.date = "TBD";
			}

		} else if (line.trim().startsWith("#")) {
			// tags

			// trim and move past "#" char
			line = line.trim().substring(1).trim();

			quote.tags = line.split(",").map((item) => {
				return item.trim();

			}).filter((item) => {
				return item.trim().length > 0;
			});

		} else if (line.trim().startsWith("=")) {
			// visibility

			// trim and move past "=" char
			line = line.trim().substring(1).trim();

			quote.visibility = line;

		} else if (line.trim().startsWith("url:")) {
			// link

			// trim and move past "url:"
			line = line.trim().substring(4).trim();

			quote.link = line;
			quote.linkSite = new URL(line).hostname;

		} else if (line.trim().startsWith("import:")) {
			// import data (from past import)

			// trim and move past "import:"
			line = line.trim().substring("import:".length).trim();

			const parts = line.split("/").map((item) => {
				return item.trim();
			});

			quote.importName = parts[0];
			quote.importId = parts[1];
			quote.importIndex = parseInt(parts[2]);
			quote.importDate = DateTime.fromFormat(parts[3], "yyyy-MM-dd HH:mm:ss.SSS");

		} else if (line.trim().startsWith("-")) {
			// speaker

			quote.parts.push(text.trim());
			text = "";

			line = line.trim();
			
			// move past "-" char
			line = line.substring(1);

			if (line.indexOf(",") > -1) {
				quote.speakers.push(line.substring(0, line.indexOf(",")));
				quote.speakerContexts.push(line.substring(line.indexOf(",") + 1).trim());

			} else {
				quote.speakers.push(line);
				quote.speakerContexts.push("");
			}
		} else {
			text += (line + "\n");
		}
	});

	if (!quote.text && (!quote.parts || quote.parts.length == 0)) {
		quote.text = text;
	}

	if (quote.speakers.length == 0) {
		if (quote.link && quote.link.indexOf("twitter.com") > 0) {
			const twitterData = quote.link.match(/.*twitter.com\/(.*)\/status\/.*/);
			if (twitterData == null) {
				debugLog("null twitterData: " + quote.link);
			}

			quote.speakers.push(twitterData[1] + "@twitter");
		}

		if (quote.speakers.length == 0) {
			quote.speakers.push("Unknown");
		}
	}

	if (quote.parts.length == 1) {
		quote.text = quote.parts[0];

		delete quote.parts;
	}

	return quote;
}

function quoteToTextRepresentation(quote) {
	const lines = [];
	if (quote.text) {
		lines.push(quote.text.trim());
		const context = quote.speakerContexts[0] ? (", " + quote.speakerContexts[0]) : "";
		lines.push("-" + quote.speakers.join("+") + context);

	} else {
		quote.parts.forEach((part, partIndex) => {
			lines.push(part.trim());
			const context = quote.speakerContexts[partIndex] ? (", " + quote.speakerContexts[partIndex]) : "";
			lines.push("-" + quote.speakers[partIndex] + context);
		});
	}

	if (quote.date) {
		if (utils.formatDate(quote.date, "yyyy-MM-dd HH:mm:ss").endsWith("00:00:00")) {
			lines.push("@" + utils.formatDate(quote.date, "yyyy-MM-dd"));

		} else {
			lines.push("@" + utils.formatDate(quote.date, "yyyy-MM-dd HH:mm:ss"));
		}
	}

	if (quote.tags && quote.tags.length > 0) {
		lines.push("#" + quote.tags.join(","));
	}

	if (quote.visibility) {
		lines.push("=" + quote.visibility);
	}

	if (quote.link) {
		lines.push("url:" + quote.link);
	}

	if (quote.importName) {
		lines.push("import:" + quote.importName + "/" + quote.importId + "/" + quote.importIndex + "/" + utils.formatDate(quote.importDate, "yyyy-MM-dd HH:mm:ss.SSS"));
	}

	return lines.join("\n");
}

async function getImports(user) {
	const quotesCollection = await db.getCollection("quotes");
	const importData = await quotesCollection.aggregate([
		{
			$match: { userId: user._id.toString() }
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

	return importData;
}

async function createList(user, name, tagsAnd, tagsOr, speakersAnd, speakersOr, excludedQuoteIds) {
	const quoteList = {
		userId: user._id.toString(),
		username: user.username,
		name: name,
		tagsAnd: tagsAnd,
		tagsOr: tagsOr,
		speakersAnd: speakersAnd,
		speakersOr: speakersOr,
		excludedQuoteIds: excludedQuoteIds,
		date: DateTime.utc()
	};

	return await db.insertObject("quoteLists", quoteList);
}

async function addQuote(user, quote) {
	db.insertObjects("quotes", [quote]);
}

module.exports = {
	authenticate: authenticate,
	importQuotesFromText: importQuotesFromText,
	quoteFromTextRepresentation: quoteFromTextRepresentation,
	quoteToTextRepresentation: quoteToTextRepresentation,
	createList: createList,
	getImports: getImports
}
