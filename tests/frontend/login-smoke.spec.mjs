import { test, expect } from '@playwright/test';

test('login page loads and renders', async ({ page }) => {
  await page.goto('http://localhost:8000/login');

  await expect(page.locator('body')).not.toBeEmpty();

  await expect(page.locator('text=Sign in with Google')).toBeVisible();

  await expect(page).toHaveTitle(/MoneyFlow/);
});
