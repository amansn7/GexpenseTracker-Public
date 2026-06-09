import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'https://your-production-domain.com';
const OUT = join(process.cwd(), 'mobile-screenshots');
mkdirSync(OUT, { recursive: true });

const SESSION_COOKIE = {
  name: 'session',
  value: '<your-session-cookie>',
  domain: 'your-production-domain.com',
  path: '/',
  secure: true,
  httpOnly: true,
  sameSite: 'Lax',
};

const VIEWPORTS = [
  { name: 'iphone-se',  width: 375, height: 667 },
  { name: 'iphone-14',  width: 390, height: 844 },
];

async function shot(page, label, vp) {
  const file = join(OUT, `${vp.name}--${label}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  ✓ ${file}`);
  return file;
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 30 });

  for (const vp of VIEWPORTS) {
    console.log(`\n════ ${vp.name} (${vp.width}×${vp.height}) ════`);

    const ctx = await browser.newContext({
      viewport:          { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      isMobile:          true,
      hasTouch:          true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });

    await ctx.addCookies([SESSION_COOKIE]);

    const page = await ctx.newPage();

    console.log(`  Navigating to ${BASE_URL}`);
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(2000);

    // Check if login page appeared (session expired/invalid)
    const isLogin = await page.evaluate(() =>
      (document.body.innerText || '').includes('Sign in with Google')
    );
    if (isLogin) {
      console.error('  ✗ Session cookie rejected — still on login page. Cookie may have expired.');
      await ctx.close();
      continue;
    }

    console.log('  Logged in via cookie. Capturing screenshots...');

    // ── 1. Inbox default view ─────────────────────────────────
    await shot(page, '1-inbox', vp);

    // ── 2. Sidebar open ───────────────────────────────────────
    const burger = page.locator('[aria-label="Open navigation"]').first();
    if (await burger.isVisible().catch(() => false)) {
      await burger.click();
      await page.waitForTimeout(500);
      await shot(page, '2-sidebar', vp);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    }

    // ── 3. Detail panel (click first transaction row) ─────────
    const firstTx = page.locator('[class*="tx-row"], [class*="txrow"], tr[data-id], li[data-id]').first();
    if (await firstTx.isVisible().catch(() => false)) {
      await firstTx.click();
      await page.waitForTimeout(700);
      await shot(page, '3-detail-panel', vp);
      const closeBtn = page.locator('[aria-label*="lose"], [aria-label*="Back"]').first();
      if (await closeBtn.isVisible().catch(() => false)) await closeBtn.click();
      await page.waitForTimeout(400);
    }

    // ── 4. Dashboard ──────────────────────────────────────────
    const burger2 = page.locator('[aria-label="Open navigation"]').first();
    if (await burger2.isVisible().catch(() => false)) {
      await burger2.click();
      await page.waitForTimeout(400);
      const dashBtn = page.locator('button', { hasText: /Dashboard|Picture/i }).first();
      if (await dashBtn.isVisible().catch(() => false)) {
        await dashBtn.click();
        await page.waitForTimeout(800);
        await shot(page, '4-dashboard', vp);
      } else {
        await page.keyboard.press('Escape');
      }
    }

    // ── 5. Reports ────────────────────────────────────────────
    const burger3 = page.locator('[aria-label="Open navigation"]').first();
    if (await burger3.isVisible().catch(() => false)) {
      await burger3.click();
      await page.waitForTimeout(400);
      const reportsBtn = page.locator('button', { hasText: /Reports/i }).first();
      if (await reportsBtn.isVisible().catch(() => false)) {
        await reportsBtn.click();
        await page.waitForTimeout(800);
        await shot(page, '5-reports', vp);
      } else {
        await page.keyboard.press('Escape');
      }
    }

    // ── 6. Inbox scrolled ─────────────────────────────────────
    const burger4 = page.locator('[aria-label="Open navigation"]').first();
    if (await burger4.isVisible().catch(() => false)) {
      await burger4.click();
      await page.waitForTimeout(300);
      const inboxBtn = page.locator('button', { hasText: /Inbox|Review/i }).first();
      if (await inboxBtn.isVisible().catch(() => false)) {
        await inboxBtn.click();
        await page.waitForTimeout(600);
      } else {
        await page.keyboard.press('Escape');
      }
    }
    await page.evaluate(() => window.scrollTo(0, 400));
    await page.waitForTimeout(400);
    await shot(page, '6-inbox-scrolled', vp);

    await ctx.close();
    console.log(`  Context ${vp.name} closed.`);
  }

  await browser.close();
  console.log(`\n✓ Done. Screenshots in: ${OUT}/`);
})().catch(err => {
  console.error('Script error:', err.message);
  process.exit(1);
});
