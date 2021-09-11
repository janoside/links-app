// ref: https://attacomsian.com/blog/nodejs-encrypt-decrypt-data

const crypto = require("crypto");
const utils = require("./utils.js");

if (!process.env.ENCRYPTION_PASSWORD) {
	throw new Error("No ENCRYPTION_PASSWORD found in environment");
}

if (!process.env.PBKDF2_SALT) {
	throw new Error("No PBKDF2_SALT found in environment");
}

const ivByteCount = 16;

const algorithm = 'aes-256-ctr';
const encryptionPassword = process.env.ENCRYPTION_PASSWORD;
const pbkdf2Salt = Buffer.from(process.env.PBKDF2_SALT, "hex");

const keyCache = {};

const encrypt = (plaintext, password=encryptionPassword) => {
	const key = keyFromPassword(password);
	
	const iv = crypto.randomBytes(ivByteCount);
	const cipher = crypto.createCipheriv(algorithm, key, iv);

	const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);

	return Buffer.concat([iv, encrypted]);
};

const decrypt = (ciphertext, password=encryptionPassword) => {
	const key = keyFromPassword(password);

	const iv = Buffer.alloc(ivByteCount);
	ciphertext.copy(iv, 0, 0, ivByteCount);

	const decipher = crypto.createDecipheriv(algorithm, key, iv);

	const ciphertextData = Buffer.alloc(ciphertext.length - ivByteCount);
	ciphertext.copy(ciphertextData, 0, ivByteCount, ciphertext.length);

	const decrpyted = Buffer.concat([decipher.update(ciphertextData), decipher.final()]);

	return decrpyted;
};

const keyFromPassword = (password) => {
	let pwdHash = utils.sha256(password);
	if (!keyCache[pwdHash]) {
		const key = crypto.pbkdf2Sync(password, pbkdf2Salt, 1000, 16, "sha256").toString("hex");

		keyCache[pwdHash] = key;
	}

	return keyCache[pwdHash];
}

module.exports = {
	encrypt,
	decrypt
};