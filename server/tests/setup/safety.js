/**
 * Pengaman agar tes destruktif (TRUNCATE/DROP SCHEMA) TIDAK PERNAH berjalan terhadap data
 * pengembangan atau produksi: NODE_ENV harus "test" dan DB_SCHEMA wajib berakhiran "_test".
 * Seluruh objek tes berada di skema tersendiri, sehingga aman walau database-nya sama
 * (mis. satu proyek Supabase).
 */
export function assertSafeTestDatabase(settings) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(`Tes dibatalkan: NODE_ENV harus "test" (sekarang "${process.env.NODE_ENV}").`);
  }
  if (!/_test$/.test(settings.schema)) {
    throw new Error(
      `Tes dibatalkan: DB_SCHEMA "${settings.schema}" harus berakhiran "_test". ` +
        'Salin server/.env.test.example menjadi server/.env.test dan gunakan skema khusus tes.',
    );
  }
}
