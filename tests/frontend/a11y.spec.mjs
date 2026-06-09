import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const SEED_SCRIPT = path.join(__dirname, 'scripts', 'create-test-session.py');
const VENV_PYTHON = path.join(ROOT, '.venv', 'bin', 'python');

let sessionToken;

test.describe.configure({ mode: 'serial' });

test.describe('Accessibility', () => {
  test.beforeAll(async () => {
    sessionToken = execSync(`${VENV_PYTHON} "${SEED_SCRIPT}"`, {
      encoding: 'utf-8',
      cwd: ROOT,
    }).trim();
    expect(sessionToken).toMatch(/^[0-9a-f]{64}$/);
  });

  test('login page has no a11y violations', async ({ page }) => {
    await page.goto('http://localhost:8000/login');
    await page.waitForLoadState('networkidle');
    const { default: AxeBuilder } = await import('@axe-core/playwright');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toHaveLength(0);
  });

  const authenticatedTest = (name, view) => {
    test(`${name} has no a11y violations`, async ({ browser }) => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();

      await ctx.addCookies([
        {
          name: 'session',
          value: sessionToken,
          domain: 'localhost',
          path: '/',
          httpOnly: true,
          sameSite: 'Lax',
        },
      ]);

      await ctx.addInitScript((v) => {
        localStorage.setItem('mf_view', v);
        localStorage.removeItem('mf_onboarding_step');
      }, view);

      await page.goto('http://localhost:8000/');
      await page.waitForLoadState('networkidle');

      await page.waitForSelector('[data-screen-label]', { timeout: 15000 });

      const { default: AxeBuilder } = await import('@axe-core/playwright');
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .disableRules(['color-contrast', 'label'])
        .analyze();
      expect(results.violations).toHaveLength(0);

      await ctx.close();
    });
  };

  authenticatedTest('dashboard', 'dashboard');
  authenticatedTest('inbox', 'inbox');
  authenticatedTest('settings', 'settings');
});
