const test = require("node:test");
const assert = require("node:assert/strict");

const coreApp = require("../app/app.js");
const rootRouter = require("../routes/rootRouter.js");

const findRouteLayer = (method, path) => {
	const normalizedMethod = method.toLowerCase();
	return rootRouter.stack.find((layer) => (
		layer.route
		&& layer.route.path === path
		&& layer.route.methods[normalizedMethod]
	));
};

const invokeRoute = async ({ method, path, req, res }) => {
	const layer = findRouteLayer(method, path);
	assert.ok(layer, `Route not found: ${method} ${path}`);

	await new Promise((resolve, reject) => {
		let settled = false;
		const finish = (err) => {
			if (settled) {
				return;
			}
			settled = true;
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		};

		try {
			const maybePromise = layer.route.stack[0].handle(req, res, finish);
			Promise.resolve(maybePromise).then(() => finish()).catch(finish);
		} catch (err) {
			finish(err);
		}
	});
};

const createMockResponse = () => {
	return {
		locals: {},
		redirectTarget: null,
		renderedView: null,
		cookiesSet: [],
		cookie(name, value, options) {
			this.cookiesSet.push({ name, value, options: options || {} });
			return this;
		},
		render(viewName) {
			this.renderedView = viewName;
			return this;
		},
		redirect(target) {
			this.redirectTarget = target;
			return this;
		}
	};
};

test("GET /item/:itemId redirects unauthenticated users to /", async () => {
	const req = {
		params: { itemId: "test-item-id" },
		session: {},
		path: "/item/test-item-id"
	};
	const res = createMockResponse();

	await invokeRoute({
		method: "GET",
		path: "/item/:itemId",
		req,
		res
	});

	assert.equal(res.redirectTarget, "/");
	assert.equal(req.session.redirectUrl, "/item/test-item-id");
});

test("GET /changeSetting updates cookie and redirects back to referer", async () => {
	const req = {
		query: { name: "uiTheme", value: "dark" },
		session: {},
		cookies: {},
		headers: { referer: "/settings" }
	};
	const res = createMockResponse();

	await invokeRoute({
		method: "GET",
		path: "/changeSetting",
		req,
		res
	});

	assert.equal(res.redirectTarget, "/settings");
	assert.deepEqual(req.session.userSettings, { uiTheme: "dark" });
	assert.equal(res.cookiesSet.length, 1);
	assert.equal(res.cookiesSet[0].name, "user-settings");
	assert.ok(res.cookiesSet[0].value.includes("uiTheme"));
	assert.ok(res.cookiesSet[0].value.includes("dark"));
});

test("GET /item/:itemId renders item for authenticated owner and increments view count", async (t) => {
	const storedItem = {
		_id: "item-123",
		username: "alice",
		text: "hello",
		viewCount: 2
	};
	const updateCalls = [];

	coreApp.__setTestDependencies({
		db: {
			findOne: async (collection, query) => {
				assert.equal(collection, "items");
				assert.deepEqual(query, { _id: "item-123" });

				return { ...storedItem };
			},
			updateOne: async (collection, query, changeObj) => {
				updateCalls.push({ collection, query, changeObj });
				return { modifiedCount: 1 };
			}
		}
	});

	t.after(() => {
		coreApp.__resetTestDependencies();
		delete global.db;
	});

	const req = {
		params: { itemId: "item-123" },
		session: {
			user: { _id: "user-1", username: "alice" },
			username: "alice"
		},
		path: "/item/item-123"
	};
	const res = createMockResponse();

	await invokeRoute({
		method: "GET",
		path: "/item/:itemId",
		req,
		res
	});

	assert.equal(res.redirectTarget, null);
	assert.equal(res.renderedView, "item");
	assert.ok(res.locals.item);
	assert.equal(res.locals.item.viewCount, 3);
	assert.equal(updateCalls.length, 1);
	assert.deepEqual(updateCalls[0], {
		collection: "items",
		query: { _id: "item-123" },
		changeObj: { $set: res.locals.item }
	});
});
