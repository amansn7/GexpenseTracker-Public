import { test, expect } from '@playwright/test';

test('unauthenticated user is redirected to login from inbox', async ({ page }) => {
  await page.goto('http://localhost:8000/');
  await page.waitForURL('**/login');
  await expect(page.locator('text=Sign in with Google')).toBeVisible();
});

test('inbox heading reference exists on login page redirect', async ({ page }) => {
  await page.goto('http://localhost:8000/');
  await page.waitForURL('**/login');
  await expect(page).toHaveTitle(/MoneyFlow/);
});
