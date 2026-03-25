import { expect, test } from '@playwright/test';

import { TEST_TOKEN } from '../fixtures/auth';

test('GET /api/auth/me without token returns 401', async ({ request }) => {
  const response = await request.get('/api/auth/me');
  expect(response.status()).toBe(401);
});

test('GET /api/auth/me with valid token returns user details', async ({ request }) => {
  const response = await request.get('/api/auth/me', {
    headers: { Authorization: `Bearer ${TEST_TOKEN}` },
  });
  const text = await response.text();
  expect(response.status(), `Response body: ${text}`).toBe(200);
  const body = JSON.parse(text);
  expect(body.email).toBe('test-admin@example.com');
  expect(body.display_name).toBe('Test Admin');
  expect(Array.isArray(body.roles)).toBe(true);
});

test('GET /api/auth/me with invalid token returns 401', async ({ request }) => {
  const response = await request.get('/api/auth/me', {
    headers: { Authorization: 'Bearer invalid-token' },
  });
  expect(response.status()).toBe(401);
});
