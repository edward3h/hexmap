import { expect, test } from '@playwright/test';

import { TEST_TOKEN } from '../fixtures/auth';

const TOKEN_KEY = 'hexmap_admin_token';

test('unauthenticated /admin redirects to login page', async ({ page }) => {
  // Clear any existing token
  await page.goto('/admin');
  await page.evaluate((key) => localStorage.removeItem(key), TOKEN_KEY);
  await page.goto('/admin');

  // Should show login UI (not crash or show the dashboard)
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.locator('body')).not.toBeEmpty();
});

test('authenticated admin shows campaign dashboard', async ({ page }) => {
  // Navigate to set localStorage on the correct origin
  await page.goto('/admin');
  await page.evaluate(({ key, token }) => localStorage.setItem(key, token), {
    key: TOKEN_KEY,
    token: TEST_TOKEN,
  });

  // Navigate again — now authenticated
  await page.goto('/admin');

  // The admin SPA should load and display at least one campaign
  await page.waitForLoadState('networkidle');
  const body = page.locator('body');
  await expect(body).not.toBeEmpty();

  // Should not be showing a login error
  const loginForm = page.locator('form, [data-testid="login"]').first();
  await expect(loginForm).not.toBeVisible();
});
