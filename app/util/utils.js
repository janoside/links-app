const { DateTime } = require("luxon");

const debug = require("debug");
const debugLog = debug("app:utils");
const debugErrorLog = debug("app:error");
const debugErrorVerboseLog = debug("app:errorVerbose");

const crypto = require("crypto");


// safely handles circular references
JSON.safeStringify = (obj, indent = 2) => {
	let cache = [];
	const retVal = JSON.stringify(
	  obj,
	  (key, value) =>
		typeof value === "object" && value !== null
		  ? cache.includes(value)
			? undefined // Duplicate reference found, discard key
			: cache.push(value) && value // Store value in our collection
		  : value,
	  indent
	);
	cache = null;
	return retVal;
};

function formatDate(date, formatStr="yyyy-MM-dd h:mma") {
	return DateTime.fromJSDate(date).toFormat(formatStr).replace("AM", "am").replace("PM", "pm");
}

function randomString(length, chars="aA#") {
	var mask = "";
	
	if (chars.indexOf("a") > -1) {
		mask += "abcdefghijklmnopqrstuvwxyz";
	}
	
	if (chars.indexOf("A") > -1) {
		mask += "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
	}
	
	if (chars.indexOf("#") > -1) {
		mask += "0123456789";
	}
	
	if (chars.indexOf("!") > -1) {
		mask += "~`!@#$%^&*()_+-={}[]:\";'<>?,./|\\";
	}
	
	var result = "";
	for (var i = length; i > 0; --i) {
		result += mask[Math.floor(Math.random() * mask.length)];
	}
	
	return result;
}

function ellipsize(str, length, ending="…") {
	if (str.length <= length) {
		return str;

	} else {
		return str.substring(0, length - ending.length) + ending;
	}
}

function ellipsizeFront(str, length, start="…") {
	if (str.length <= length) {
		return str;

	} else {
		return start + str.substring(str.length - length + start.length);
	}
}

function dayMillis() {
	return 1000 * 60 * 60 * 24;
}

function weekMillis() {
	return dayMillis() * 7;
}

function monthMillis() {
	return dayMillis() * 30;
}

function yearMillis() {
	return parseInt(dayMillis() * 365.2422);
}

function toUrlString(str) {
	return str.replace(" ", "-");
}

function objectProperties(obj) {
	const props = [];
	for (const prop in obj) {
		if (Object.prototype.hasOwnProperty.call(obj, prop)) {
			props.push(prop);
		}
	}

	return props;
}

function objectHasProperty(obj, prop) {
	return Object.prototype.hasOwnProperty.call(obj, prop);
}

const sha256 = (data) => {
	return crypto.createHash("sha256").update(data).digest("hex");
};

const descBuffer = (buffer) => {
	let b64 = buffer.toString("base64");
	return `buffer: ${b64.substring(0, 16)}...${b64.substring(100, 116)}...${b64.substring(b64.length - 16, b64.length)}, sha256: ${sha256(b64).substring(0, 16)}`;
};


global.errorStats = {};
function logError(errorId, err, optionalUserData = {}, logStacktrace=true) {
	if (!global.errorLog) {
		global.errorLog = [];
	}

	if (!global.errorStats[errorId]) {
		global.errorStats[errorId] = {
			count: 0,
			firstSeen: new Date().getTime(),
			properties: {}
		};
	}

	if (optionalUserData && err.message) {
		optionalUserData.errorMsg = err.message;
	}

	if (optionalUserData) {
		for (const [key, value] of Object.entries(optionalUserData)) {
			if (!global.errorStats[errorId].properties[key]) {
				global.errorStats[errorId].properties[key] = {};
			}

			if (!global.errorStats[errorId].properties[key][value]) {
				global.errorStats[errorId].properties[key][value] = 0;
			}

			global.errorStats[errorId].properties[key][value]++;
		}
	}

	global.errorStats[errorId].count++;
	global.errorStats[errorId].lastSeen = new Date().getTime();

	global.errorLog.push({errorId:errorId, error:err, userData:optionalUserData, date:new Date()});
	while (global.errorLog.length > 100) {
		global.errorLog.splice(0, 1);
	}

	debugErrorLog("Error " + errorId + ": " + err + ", json: " + JSON.stringify(err) + (optionalUserData != null ? (", userData: " + optionalUserData + " (json: " + JSON.stringify(optionalUserData) + ")") : ""));
	
	if (err && err.stack && logStacktrace) {
		debugErrorVerboseLog("Stack: " + err.stack);
	}

	var returnVal = {errorId:errorId, error:err};
	if (optionalUserData) {
		returnVal.userData = optionalUserData;
	}

	return returnVal;
}


const AWS = require('aws-sdk');

if (process.env.AWS_PROFILE_NAME) {
	debugLog(`Using AWS Credentials from profile '${process.env.AWS_PROFILE_NAME}'`);

	var credentials = new AWS.SharedIniFileCredentials({profile: process.env.AWS_PROFILE_NAME});
	AWS.config.credentials = credentials;
}

debugLog(`Using AWS Access Key: ${AWS.config.credentials.accessKeyId}`);
const s3Client = new AWS.S3({apiVersion: '2006-03-01'});


const s3Put = async (data, bucket, path) => {
	var uploadParams = {
		Bucket: bucket,
		Key: path,
		Body: data
	};
		
	await s3Client.putObject(uploadParams).promise();
};

const s3Get = async (bucket, path) => {
	var getParams = {
		Bucket: bucket,
		Key: path
	};
		
	return await s3Client.getObject(getParams).promise();
};

const s3Delete = async (bucket, path) => {
	var deleteParams = {
		Bucket: bucket,
		Key: path
	};
		
	return await s3Client.deleteObject(deleteParams).promise();
};


module.exports = {
	formatDate: formatDate,
	randomString: randomString,
	ellipsize: ellipsize,
	ellipsizeFront: ellipsizeFront,
	dayMillis: dayMillis,
	weekMillis: weekMillis,
	monthMillis: monthMillis,
	yearMillis: yearMillis,
	toUrlString: toUrlString,
	objectProperties: objectProperties,
	objectHasProperty: objectHasProperty,
	sha256: sha256,
	s3Put: s3Put,
	s3Get: s3Get,
	s3Delete: s3Delete,
	logError: logError,
	descBuffer: descBuffer
};