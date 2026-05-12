Run the unit tests with `bun run test`
When touching native code, run the tests with `bun run test:native` to ensure native code is covered.
Always write unit tests for all new functionality.
Place unit tests next to the file they test using the `*.test.ts` suffix.
Place integration and end-to-end tests in the top-level `test/` directory.
Do not use `__test__` or `__tests__` directories.
Make sure to mock timeouts and intervals in tests.
Use descriptive test names.
Group related tests using describe blocks.
Aim for high code coverage.
Avoid duplication of testing scenarios.
