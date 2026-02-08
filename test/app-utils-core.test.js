const test = require("node:test");
const assert = require("node:assert/strict");

const utils = require("../app/app-utils/src/utils.js");

test("intArray includes both endpoints", () => {
	assert.deepEqual(utils.intArray(3, 6), [3, 4, 5, 6]);
});

test("sha256 returns expected hash", () => {
	assert.equal(
		utils.sha256("hello"),
		"2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
	);
});

test("ellipsizeMiddle keeps both sides for odd remaining chars", () => {
	assert.equal(utils.ellipsizeMiddle("abcdef", 5, "...", true), "a...f");
	assert.equal(utils.ellipsizeMiddle("abcdef", 5, "...", false), "a...f");
});

test("ellipsizeMiddle returns original string when short enough", () => {
	assert.equal(utils.ellipsizeMiddle("abc", 4, "..."), "abc");
});

test("objectProperties returns own enumerable keys only", () => {
	const proto = { inherited: true };
	const obj = Object.create(proto);
	obj.ownOne = 1;
	obj.ownTwo = 2;

	assert.deepEqual(utils.objectProperties(obj), ["ownOne", "ownTwo"]);
});

test("stdev computes population standard deviation", () => {
	const result = utils.stdev([2, 4, 4, 4, 5, 5, 7, 9]);
	assert.ok(Math.abs(result - 2) < 1e-12);
});
