# Testing Guide

## What this project uses

- Runner: Node built-in test runner (`node:test`)
- Assertion library: Node built-in `node:assert/strict`
- Test file location: `/test`
- Test file naming: `*.test.js`

No external framework is required.

## Commands

- `npm test`
  - Runs all tests in `test/**/*.test.js`
- `npm run test:watch`
  - Re-runs tests on file changes
- `npm run test:coverage`
  - Runs tests and prints built-in Node coverage report
- `npm run test:image-debug`
  - Runs the old manual image-debug script (`bin/test.js`)

## Current starter tests

- `test/gzip-base64-inverse.test.js`
  - Covers `app/utils.js` (`gzipBase64Inverse`)
- `test/app-utils-core.test.js`
  - Covers deterministic helper behavior in `app/app-utils/src/utils.js`
- `test/root-router.integration.test.js`
  - Integration-style route tests via direct Express router invocation (no network sockets)
- `test/core-app-flows.test.js`
  - Core application flow tests using fake DB/S3/encryptor dependencies

## How to add a new test

1. Create a new file in `/test`, for example `test/my-feature.test.js`.
2. Add:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
```

3. Import the module under test.
4. Write small tests with one behavior per `test(...)` block.
5. Run `npm test`.

## Notes

- The test command intentionally scopes to `test/**/*.test.js` so old ad-hoc scripts are not auto-run.
- Prefer testing pure functions first; add mocks/stubs only when testing side effects (DB, S3, HTTP).
- Core app logic supports test dependency injection through:
  - `coreApp.__setTestDependencies({ db, s3Bucket, encryptor })`
  - `coreApp.__resetTestDependencies()`
