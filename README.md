# Links App

A link organizing app.

Add links, descriptions, tags. Search.

## Testing

This project uses Node's built-in test runner (`node:test`), so no extra test framework dependency is required.

- Run all tests once:
  - `npm test`
- Watch mode (re-run on file changes):
  - `npm run test:watch`
- Run tests with coverage:
  - `npm run test:coverage`
- Run the old image debugging script (previously `npm test`):
  - `npm run test:image-debug`

Tests live in `/test` and use `*.test.js` naming so Node discovers them automatically.
The suite includes unit tests, route integration tests, and core-flow tests with DB/S3 test doubles.

For a full walkthrough, see `/docs/testing.md`.
