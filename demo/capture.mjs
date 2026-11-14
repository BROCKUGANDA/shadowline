/**
 * SHADOWLINE e2e capture for the demo film.
 * Walks the real production deploy at https://shadowline.aiazimara.com
 * (public landing -> demo login -> all 11 modules) and saves 1920x1080
 * PNG stills + a HAR-ish capture log. Deterministic: fixed viewport,
 * deviceScaleFactor 2 (screenshots downscaled later), reduced motion.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.SHADOWLINE_CAPTURE_URL ?? 'https://shadowline.aiazimara.com';
const OUT = path.resolve(import.meta.dirname ?? '.', 'assets', 'captures');
fs.mkdirSync(OUT, { recursive: true });

const SHOTS = [
  { name: '01-landing', path: '/', wait: 3500 },
];

const MODULES = [
  ['02-command', 'Command Center'],
  ['03-players', 'Player Explorer'],
  ['04-lab', 'Tracking Laboratory'],
  ['05-drills', 'Combine Drill Explorer'],
  ['06-mri', 'Movement Intelligence'],
  ['07-coverage', 'NFL Coverage Analysis'],
  ['08-translation', 'Combine-to-Game Translation'],
  ['09-compare', 'Athlete Comparison'],
  ['10-reports', 'Scouting Report Generator'],
  ['11-research', 'Research Evidence & Model Audit'],
  ['12-health', 'Dataset & Pipeline Health'],
];

const log = [];
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 2,
  reducedMotion: 'reduce',
  colorScheme: 'dark',
});
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') log.push(`console.error: ${m.text()}`); });

await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(SHOTS[0].wait);
await page.screenshot({ path: `${OUT}/01-landing.png` });
log.push('landing captured');

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/02-login.png` });

await page.fill('input[type="email"]', 'demo@shadowline.io');
await page.fill('input[type="password"]', 'shadowline-demo');
await page.click('button[type="submit"]');
await page.waitForURL('**/app', { timeout: 30000 });
await page.waitForLoadState('networkidle', { timeout: 60000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/03-app-shell.png` });
log.push('logged in, app shell captured');

for (const [name, label] of MODULES) {
  try {
    await page.getByRole('button', { name: label, exact: true }).first().click();
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    log.push(`module ${label} captured`);
  } catch (err) {
    log.push(`module ${label} FAILED: ${err.message.split('\n')[0]}`);
  }
}

await page.goto(`${BASE}/api/health`, { waitUntil: 'load', timeout: 30000 }).catch(() => {});
await ctx.close();
await browser.close();

fs.writeFileSync(`${OUT}/capture-log.json`, JSON.stringify({ capturedAt: new Date().toISOString(), base: BASE, log }, null, 2));
console.log(log.join('\n'));
