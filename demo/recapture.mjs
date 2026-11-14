import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = 'https://shadowline.aiazimara.com';
const OUT = 'assets/captures';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, reducedMotion: 'reduce', colorScheme: 'dark' });
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 });
await page.fill('input[type="email"]', 'demo@shadowline.io');
await page.fill('input[type="password"]', 'shadowline-demo');
await page.click('button[type="submit"]');
await page.waitForURL('**/app', { timeout: 30000 });
await page.waitForLoadState('networkidle', { timeout: 60000 });

for (const [name, label, extraWait] of [
  ['11-research', 'Research Evidence & Model Audit', 12000],
  ['07-coverage', 'NFL Coverage Analysis', 8000],
  ['12-health', 'Dataset & Pipeline Health', 8000],
]) {
  await page.getByRole('button', { name: label, exact: true }).first().click();
  await page.waitForTimeout(extraWait);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('captured', name);
}
await ctx.close();
await browser.close();
