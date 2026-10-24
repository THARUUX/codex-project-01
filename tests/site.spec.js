import { test, expect } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Software WebGL is expensive in CI. Lower DPR keeps the actual 3D runtime
// running while retaining the full desktop layout and browser interactions.
test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 0.5 });

async function ready(page) {
  await page.waitForFunction(() => { const s = window.Alpine?.store('status'); return s?.headerView === true && s.isLoading === false && s.isTransitioning === false; }, null, { timeout: 150_000 });
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.locator('body')).not.toHaveClass(/on-transition/);
  await expect(page.locator('main')).toHaveCSS('opacity', '1');
  if (await page.locator('.c-page-hero').count()) {
    await expect(page.locator('.c-page-hero .slush-text')).toHaveClass(/is-on/);
  }
  await expect(page.locator('header')).not.toHaveAttribute('inert');
}
function watch(page) {
  const errors = [], missing = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) missing.push(`${response.status()} ${response.url()}`); });
  page.on('request', request => {
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.hostname !== '127.0.0.1') external.push(request.url());
  });
  return { errors, missing, external };
}

test('all 27 pages and their declared local assets are served', async ({ request }) => {
  async function pages(dir) {
    const result = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = join(dir, entry.name);
      if (entry.isDirectory()) result.push(...await pages(file));
      else if (entry.name.endsWith('.html')) result.push(file);
    }
    return result;
  }
  const files = await pages('site');
  expect(files).toHaveLength(27);
  const paths = new Set();
  for (const file of files) {
    paths.add('/' + file.slice(5).replace(/index\.html$/, ''));
    const html = await readFile(file, 'utf8');
    for (const match of html.matchAll(/(?:src|href|poster)="(\/(?:assets|_astro)\/[^"#?]+)"/g)) paths.add(match[1]);
    expect(html).not.toContain('googletagmanager.com');
    expect(html).not.toContain('webfont.fontplus.jp');
  }
  for (const path of paths) {
    const response = await request.head(path);
    expect(response.status(), path).toBe(200);
  }
  const range = await request.get('/assets/video/about.mp4', { headers: { Range: 'bytes=0-99' } });
  expect(range.status()).toBe(206);
  expect((await range.body()).length).toBe(100);
  expect((await request.get('/this-page-does-not-exist/')).status()).toBe(404);
});

test('desktop introduction, animated hero, scrolling and page transitions', async ({ page }) => {
  const observed = watch(page);
  await page.goto('/');
  await ready(page);
  await expect(page.locator('#webgl canvas')).toBeVisible();
  await expect(page.locator('.kv-copy')).toBeVisible();
  await expect(page.locator('header a[href="/about/"]').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/desktop-home.png' });
  await page.mouse.wheel(0, 1200);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  await page.screenshot({ path: 'test-results/desktop-scroll.png' });
  await page.locator('header a[href="/about/"]').first().click();
  await expect(page).toHaveURL(/\/about\/$/);
  await ready(page);
  await expect(page.locator('main')).toContainText('About');
  await page.screenshot({ path: 'test-results/desktop-about.png' });
  await page.locator('header a[href="/product/zeroz/"]').first().click();
  await expect(page).toHaveURL(/\/product\/zeroz\/$/);
  await ready(page);
  await expect(page.locator('main')).toContainText('/zeroz');
  await page.screenshot({ path: 'test-results/desktop-product.png' });
  expect(observed.errors).toEqual([]);
  expect(observed.missing).toEqual([]);
  expect(observed.external).toEqual([]);
});

test('interview carousel and article navigation', async ({ page }) => {
  const observed = watch(page);
  await page.goto('/interview/');
  await ready(page);
  await expect(page.getByText('/ Takashi Doi', { exact: false }).first()).toBeVisible();
  await page.screenshot({ path: 'test-results/desktop-interview.png' });
  const slides = page.locator('.interview-navi .slider-heo__item');
  await page.mouse.move(640, 400);
  const step = await slides.nth(1).evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m41);
  await page.mouse.wheel(0, 200);
  await expect.poll(() => slides.nth(1).evaluate(el => el.classList.contains('-current'))).toBe(true);
  await expect.poll(() => slides.first().evaluate((el, width) => Math.abs(new DOMMatrix(getComputedStyle(el).transform).m41 + width), step)).toBeLessThan(2);
  await page.screenshot({ path: 'test-results/desktop-carousel-next.png' });
  await page.mouse.wheel(0, -200);
  await expect.poll(() => slides.first().evaluate(el => el.classList.contains('-current'))).toBe(true);
  await expect.poll(() => slides.first().evaluate(el => Math.abs(new DOMMatrix(getComputedStyle(el).transform).m41))).toBeLessThan(2);
  const article = page.locator('a[href*="takashidoi_01"]').filter({ visible: true }).first();
  await article.click();
  await expect(page).toHaveURL(/\/interview\/takashidoi_01\/?$/);
  await ready(page);
  await expect(page.locator('main')).toContainText('土井');
  await page.screenshot({ path: 'test-results/desktop-article.png' });
  expect(observed.errors).toEqual([]);
  expect(observed.missing).toEqual([]);
});

test('mobile layout, menu opening, navigation and no horizontal overflow', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1' });
  const page = await context.newPage();
  const observed = watch(page);
  await page.goto('http://127.0.0.1:5173/');
  await ready(page);
  await page.screenshot({ path: 'test-results/mobile-home.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('header .button-open').click();
  await expect.poll(() => page.evaluate(() => window.Alpine.store('status').naviOpened)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile-menu.png' });
  await page.locator('header a[href="/science_technology/"]').filter({ visible: true }).last().click();
  await expect(page).toHaveURL(/\/science_technology\/$/);
  await ready(page);
  await expect(page.locator('main')).toContainText('ケンフェロール');
  await page.screenshot({ path: 'test-results/mobile-science.png' });
  expect(observed.errors).toEqual([]);
  expect(observed.missing).toEqual([]);
  expect(observed.external).toEqual([]);
  await context.close();
});
