import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { GENERATED_SQL_FILES, PASSWORD_PLACEHOLDER, SQL_DIR, buildSetupSql } from '../../scripts/lib/setup-sql.js';

describe('Script SQL Editor Supabase (server/sql)', () => {
  it.each(Object.keys(GENERATED_SQL_FILES))(
    '%s selalu sama dengan hasil generator (bila gagal: jalankan "npm run db:sql", jangan isi password di file)',
    async (name) => {
      const saved = fs.readFileSync(path.join(SQL_DIR, name), 'utf8').replace(/\r\n/g, '\n');
      expect(saved).toBe(await GENERATED_SQL_FILES[name]());
    },
  );

  it('memaksa password role aplikasi diganti dan tidak pernah membuat tabel di public', async () => {
    const sql = await buildSetupSql();
    // Teks pengganti hanya sekali (aman untuk Replace All) dan tidak pernah ikut pesan error.
    expect(sql.split(PASSWORD_PLACEHOLDER)).toHaveLength(2);
    expect(sql).toMatch(/RAISE EXCEPTION 'Langkah 1: password belum diisi/);
    expect(sql.indexOf('SET search_path TO "eosis"')).toBeLessThan(sql.indexOf('CREATE TABLE elections'));
    expect(sql).not.toMatch(/\bpublic\.\w/);
  });
});
