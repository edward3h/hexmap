-- backend/seed-test.sql
-- Test fixtures: a superuser with a non-expiring session token.
-- WARNING: never use these credentials in production.

-- INSERT IGNORE makes this script idempotent (safe to run multiple times).
INSERT IGNORE INTO users (id, email, display_name) VALUES
  (9001, 'test-admin@example.com', 'Test Admin');

INSERT IGNORE INTO user_roles (user_id, role_type, campaign_id, team_id) VALUES
  (9001, 'superuser', 0, 0);

-- Hardcoded session token used by Playwright tests via TEST_TOKEN env var.
-- Token: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
-- Note: MySQL TIMESTAMP max is 2038-01-19; use 2037 to stay within range.
-- REPLACE INTO ensures a previously-inserted row with a bad expires_at gets corrected.
REPLACE INTO sessions (token, user_id, expires_at) VALUES (
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  9001,
  '2037-12-31 23:59:59'
);
