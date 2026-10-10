import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { name: 'ponsel', width: 360, height: 740 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
];

const PAGES = [
  { path: '/', heading: /Suaramu Menentukan/ },
  { path: '/hasil', heading: /Hasil|Pemilihan/ },
  { path: '/admin/login', heading: 'Masuk sebagai admin' },
];

for (const viewport of VIEWPORTS) {
  test.describe(`[17] tampilan responsif — ${viewport.name} (${viewport.width}px)`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const page of PAGES) {
      test(`${page.path} tanpa scroll horizontal & judul terlihat`, async ({ page: browserPage }) => {
        await browserPage.goto(page.path);
        await expect(browserPage.getByRole('heading', { level: 1, name: page.heading })).toBeVisible();
        await browserPage.waitForLoadState('networkidle');
        const overflow = await browserPage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }

    test('menu navigasi menyesuaikan lebar layar', async ({ page }) => {
      await page.goto('/');
      const navLink = page
        .getByRole('navigation', { name: 'Navigasi utama' })
        .getByRole('link', { name: 'Pasangan Calon', exact: true });
      const toggle = page.getByRole('button', { name: 'Buka menu navigasi' });
      if (viewport.width < 900) {
        await expect(toggle).toBeVisible();
        await expect(navLink).toBeHidden();
        await toggle.click();
        await expect(navLink).toBeVisible();
      } else {
        await expect(toggle).toBeHidden();
        await expect(navLink).toBeVisible();
      }
    });
  });
}

test('tombol utama hero (menuju kartu pasangan calon) langsung bisa dipakai walau animasi pembuka berjalan', async ({ page }) => {
  await page.goto('/');
  // Klik segera tanpa menunggu timeline GSAP selesai. Tidak ada lagi tombol login di hero.
  await expect(page.locator('.hero').getByText(/Login/i)).toHaveCount(0);
  await page.locator('.hero').getByRole('link', { name: /Pasangan Calon$/ }).click({ timeout: 1500 });
  await expect(page).toHaveURL(/#kandidat$/);
});

test('alamat bilik suara lama (/pilih) dialihkan ke kartu pasangan calon di beranda', async ({ page }) => {
  await page.goto('/pilih');
  await expect(page).toHaveURL(/\/#kandidat$/);
  await expect(page.getByRole('heading', { name: 'Kenali calon pemimpin OSIS' })).toBeInViewport();
});

test('hak cipta PTI AM 2026 UNDIKSHA tampil di beranda dan footer', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.hero__copyright')).toHaveText(/PTI AM 2026 UNDIKSHA/);
  await expect(page.locator('.footer__copyright')).toHaveText(/PTI AM 2026 UNDIKSHA/);
});

test('dengan prefers-reduced-motion semua konten langsung terlihat tanpa animasi', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  // Elemen AOS maupun Motion (kartu langkah, tahapan, paslon, FAQ) tidak boleh tertinggal transparan.
  await page.mouse.wheel(0, 20000);
  const hidden = await page.evaluate(() =>
    [...document.querySelectorAll('main [data-aos], main [style*="opacity"]')].filter(
      (element) => getComputedStyle(element).opacity === '0',
    ).length,
  );
  expect(hidden).toBe(0);
  await expect(page.getByRole('heading', { name: 'Yang sering ditanyakan' })).toBeVisible();
  await context.close();
});
