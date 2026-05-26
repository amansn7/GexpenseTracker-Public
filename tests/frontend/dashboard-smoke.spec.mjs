import { test, expect } from '@playwright/test';

test('unauthenticated user is redirected to login from dashboard', async ({ page }) => {
  await page.goto('http://localhost:8000/dashboard');
  await page.waitForURL('**/login');
  await expect(page.locator('text=Sign in with Google')).toBeVisible();
});
