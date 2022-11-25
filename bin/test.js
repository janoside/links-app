const fs = require("fs");
const sharp = require("sharp");
const gm = require('gm');

const appUtils = require("../app/app-utils");
const utils = appUtils.utils;
const passwordUtils = appUtils.passwordUtils;
const encryptionUtils = appUtils.encryptionUtils;
const s3Utils = appUtils.s3Utils;




(async () => {
	try {
		let imgBuffer = fs.readFileSync("/Users/danjanosik/Downloads/Screen Shot 2021-10-08 at 3.21.31 PM.png");
		console.log("loading file");

		console.log(`imgFull: ${utils.descBuffer(imgBuffer)}`);

		let buffer0 = await sharp(imgBuffer, {failOnError:false}).resize({width: 600, fit: "inside"}).png().toBuffer();
		console.log(`img0: ${utils.descBuffer(buffer0)}`);

		//await s3Bucket.put(ciphertext0, `img/${savedLinkId}/w${appConfig.images.widths[0]}`);

		fs.writeFileSync("/Users/danjanosik/Downloads/abc.png", buffer0);

		console.log("done");

		await gm(imgBuffer).identify((err, data) => {
			if (err) {
				utils.logError("xyz1", err);

			} else {
				console.log("image from file is good" + JSON.stringify(data));
			}
			
		});

		await gm(buffer0).identify((err, data) => {
			if (err) {
				utils.logError("xyz2", err);

			} else {
				console.log("resized image is good: " + JSON.stringify(data));
			}
			
		});

	} catch (e) {
		utils.logError("crap", e);
	}
	

})();

//process.exit(0);