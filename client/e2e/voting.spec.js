import { expect, test } from '@playwright/test';

/** NISN acak 10 digit (diawali "00") agar setiap run memakai NISN baru. */
function randomNisn() {
  return `00${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
}

test.describe('Memilih langsung dari kartu pasangan calon (backend + PostgreSQL sungguhan)', () => {
  test.beforeEach(async ({ request }) => {
    const response = await request.get('/api/elections/current');
    const { data } = await response.json();
    test.skip(!data?.votingOpen, 'Tidak ada pemilihan yang sedang dibuka. Jalankan sql/demo.sql atau: npm run db:seed:demo -- --open');
  });

  test('siswa menekan "Pilih" di kartu, mengisi NISN, konfirmasi, lalu NISN yang sama ditolak', async ({ page }) => {
    const nisn = randomNisn();
    await page.goto('/');
    const dialog = page.locator('.swal2-popup');
    const nisnInput = dialog.getByLabel('Nomor Induk Siswa Nasional (NISN)');

    await page.getByRole('button', { name: 'Pilih Paslon 01' }).click();
    await expect(dialog).toContainText('Masukkan NISN-mu');
    await nisnInput.fill('123');
    await dialog.getByRole('button', { name: 'Lanjut' }).click();
    await expect(dialog).toContainText('NISN harus terdiri dari 10 digit');
    await nisnInput.fill(nisn);
    await dialog.getByRole('button', { name: 'Lanjut' }).click();

    await expect(dialog).toContainText('Yakin dengan pilihanmu?');
    await expect(dialog).toContainText('01');
    await dialog.getByRole('button', { name: 'Ya, Saya Yakin' }).click();
    await expect(dialog).toContainText('Suara berhasil disimpan!');
    await dialog.getByRole('button', { name: 'Selesai' }).click();
    await expect(dialog).toBeHidden();

    // Siswa berikutnya / percobaan ulang dengan NISN yang sama pada paslon lain.
    await page.getByRole('button', { name: /^Pilih Paslon 0[2-9]/ }).first().click();
    await nisnInput.fill(nisn);
    await dialog.getByRole('button', { name: 'Lanjut' }).click();
    await dialog.getByRole('button', { name: 'Ya, Saya Yakin' }).click();
    await expect(dialog).toContainText('NISN ini sudah digunakan untuk memilih!');
  });

  test('"Batal" dan "Kembali" pada dialog tidak mengirim suara', async ({ page }) => {
    const requests = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/vote')) requests.push(request.url());
    });
    await page.goto('/');
    const dialog = page.locator('.swal2-popup');

    await page.getByRole('button', { name: 'Pilih Paslon 01' }).click();
    await dialog.getByRole('button', { name: 'Batal' }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: 'Pilih Paslon 01' }).click();
    await dialog.getByLabel('Nomor Induk Siswa Nasional (NISN)').fill(randomNisn());
    await dialog.getByRole('button', { name: 'Lanjut' }).click();
    await dialog.getByRole('button', { name: 'Kembali' }).click();
    await expect(dialog).toBeHidden();
    expect(requests).toHaveLength(0);
  });
});

test.describe('Dashboard admin (opsional)', () => {
  test.skip(!process.env.E2E_ADMIN_EMAIL || !process.env.E2E_ADMIN_PASSWORD, 'Isi E2E_ADMIN_EMAIL & E2E_ADMIN_PASSWORD.');

  test('login, melihat grafik dari database, lalu logout', async ({ page }) => {
    await page.goto('/admin/login');
    await page.getByLabel('Email', { exact: true }).fill(process.env.E2E_ADMIN_EMAIL);
    await page.getByLabel('Kata sandi', { exact: true }).fill(process.env.E2E_ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Masuk' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard pemilihan' })).toBeVisible();
    await expect(page.locator('.stat-grid').getByText('Total suara sah')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Rincian perolehan suara' })).toBeVisible();
    await page.getByRole('button', { name: 'Keluar' }).click();
    await expect(page.getByText('Anda telah keluar dari dashboard admin.')).toBeVisible();
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Masuk sebagai admin' })).toBeVisible();
  });
});
