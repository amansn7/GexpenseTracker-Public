import { test, expect } from '@playwright/test';

test('unauthenticated user hits / and is redirected to /login', async ({ page }) => {
  await page.goto('http://localhost:8000/');
  await page.waitForURL('**/login');
  await expect(page).toHaveURL(/\/login/);
});

test('login page shows MoneyFlow branding and sign-in button', async ({ page }) => {
  await page.goto('http://localhost:8000/login');
  await expect(page.locator('h1')).toContainText('MoneyFlow');
  await expect(page.locator('text=Sign in with Google')).toBeVisible();
  await expect(page).toHaveTitle(/MoneyFlow/);
});
