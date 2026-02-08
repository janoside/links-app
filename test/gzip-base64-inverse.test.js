const test = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("node:zlib");

const linksUtils = require("../app/utils.js");

test("gzipBase64Inverse returns decoded text for valid gzipped base64", () => {
	const original = "hello from links.rest";
	const encoded = zlib.gzipSync(original).toString("base64");

	const result = linksUtils.gzipBase64Inverse(encoded);

	assert.equal(result, original);
});

test("gzipBase64Inverse returns input when value is not valid gzipped base64", () => {
	const invalid = "this-is-not-valid-gzip";

	const result = linksUtils.gzipBase64Inverse(invalid);

	assert.equal(result, invalid);
});
