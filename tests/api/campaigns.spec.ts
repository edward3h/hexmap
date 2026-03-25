import { expect, test } from '@playwright/test';

import { TEST_TOKEN } from '../fixtures/auth';

test('GET /api/campaigns returns a list of campaigns', async ({ request }) => {
  const response = await request.get('/api/campaigns');
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(Array.isArray(body)).toBe(true);
});

test('GET /api/campaigns/1 returns the Gratus 2025 campaign', async ({ request }) => {
  const response = await request.get('/api/campaigns/1');
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.name).toBe('Gratus 2025');
});

test('GET /api/campaigns/1/map-data returns map data with expected shape', async ({
  request,
}) => {
  const response = await request.get('/api/campaigns/1/map-data');
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(Array.isArray(body.teams)).toBe(true);
  expect(Array.isArray(body.map)).toBe(true);
  expect(Array.isArray(body.attacks)).toBe(true);
  expect(body.teams.length).toBeGreaterThan(0);
});

test('GET /api/campaigns/1/teams returns team list', async ({ request }) => {
  const response = await request.get('/api/campaigns/1/teams');
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(Array.isArray(body)).toBe(true);
});

test('protected write endpoint returns 401 without token', async ({ request }) => {
  const response = await request.patch('/api/campaigns/1/tiles/1', {
    data: { team: 'green' },
  });
  expect(response.status()).toBe(401);
});

test('protected write endpoint succeeds with valid token', async ({ request }) => {
  // Just verify the endpoint is accessible (200 or 404 for non-existent tile)
  // rather than creating real data modifications
  const response = await request.patch('/api/campaigns/1/tiles/9999', {
    headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    data: { team: 'green' },
  });
  // 404 = tile not found (auth passed), 200 = success — both mean auth worked
  expect([200, 404]).toContain(response.status());
});
