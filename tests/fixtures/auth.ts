// Shared test token for API and E2E tests.
// This token is pre-seeded in backend/seed-test.sql for the test superuser.
// In CI it can be overridden via the TEST_TOKEN environment variable.
export const TEST_TOKEN =
  process.env.TEST_TOKEN ??
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
