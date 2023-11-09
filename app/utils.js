const zlib = require('zlib');
const appUtils = require("./app-utils");
const utils = appUtils.utils;



function gzipBase64Inverse(base64Data) {
	try {
		const decodedData = Buffer.from(base64Data, 'base64');
		const originalString = zlib.gunzipSync(decodedData).toString('utf8');

		return originalString;

	} catch (err) {
		utils.logError("w9488hwude", err);

		return base64Data;
	}
}


module.exports = {
	gzipBase64Inverse: gzipBase64Inverse
}