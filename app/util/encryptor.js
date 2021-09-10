// ref: https://attacomsian.com/blog/nodejs-encrypt-decrypt-data

const crypto = require('crypto');

if (!process.env.ENCRYPTION_KEY) {
	throw new Error("No ENCRYPTION_KEY found in environment");
}

const algorithm = 'aes-256-ctr';
const encryptionKey = process.env.ENCRYPTION_KEY;
const iv = crypto.randomBytes(16);

const encrypt = (plaintext, password=encryptionKey) => {
    const cipher = crypto.createCipheriv(algorithm, password, iv);

    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);

    return {
        iv: iv.toString('hex'),
        content: encrypted.toString('hex')
    };
};

const decrypt = (ciphertext) => {
    const decipher = crypto.createDecipheriv(algorithm, secretKey, Buffer.from(hash.iv, 'hex'));

    const decrpyted = Buffer.concat([decipher.update(Buffer.from(ciphertext.content, 'hex')), decipher.final()]);

    return decrpyted.toString();
};

module.exports = {
    encrypt,
    decrypt
};