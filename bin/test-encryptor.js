require("dotenv").config();

const fs = require("fs");
const crypto = require("crypto");
const encrpytor = require("../app/util/encryptor.js");

const x = crypto.randomBytes(16).toString("hex");
console.log("x: " + x);

const fileBuffer = fs.readFileSync("./public/img/icon/favicon-32x32.png");

console.log("fileBuffer.length: " + fileBuffer.length);
console.log("fileBuffer: " + fileBuffer.toString("base64").substring(0, 100));

const cipher = encrpytor.encrypt(fileBuffer);

console.log("cipher.length: " + cipher.length);
console.log("cipher: " + cipher.toString("base64").substring(0, 100));
console.log("cipher: " + cipher.toString("base64"));

const plain = encrpytor.decrypt(cipher);

console.log("plain.length: " + plain.length);
console.log("plain: " + plain.toString("base64").substring(0, 100));





console.log("NEXT");

const cipher2 = Buffer.from("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", "base64");


const plain2 = encrpytor.decrypt(cipher2);

console.log("plain2.length: " + plain2.length);
console.log("plain2: " + plain2.toString("base64").substring(0, 100));