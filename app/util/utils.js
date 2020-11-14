const { DateTime } = require("luxon");
const debugLog = require("debug")("app:utils");


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
	objectHasProperty: objectHasProperty
};