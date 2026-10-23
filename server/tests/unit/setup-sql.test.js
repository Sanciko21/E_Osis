import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { GENERATED_SQL_FILES, PASSWORD_PLACEHOLDER, SQL_DIR, buildDemoVotesSql, buildSetupSql } from '../../scripts/lib/setup-sql.js';
import { DEMO_CANDIDATES, DEMO_ELIGIBLE_VOTERS, DEMO_NISN_PREFIX, DEMO_VOTES } from '../../seeds/demo-data.js';

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

  it('demo-votes.sql: minimal 1000 pemilih dummy, satu suara per NISN, NISN valid & tidak dobel saat diulang', () => {
    const total = DEMO_VOTES.reduce((sum, count) => sum + count, 0);
    expect(total).toBeGreaterThanOrEqual(1000);
    expect(DEMO_VOTES).toHaveLength(DEMO_CANDIDATES.length);
    expect(DEMO_ELIGIBLE_VOTERS).toBeGreaterThanOrEqual(total);
    // NISN dummy terakhir tetap 10 digit (lolos CHECK chk_participation_nisn).
    expect(`${DEMO_NISN_PREFIX}${String(total).padStart(10 - DEMO_NISN_PREFIX.length, '0')}`).toMatch(/^[0-9]{10}$/);

    const sql = buildDemoVotesSql();
    expect(sql).toContain(`generate_series(1, ${total})`);
    expect(sql).toContain('CASE WHEN n <= 418 THEN 1 WHEN n <= 770 THEN 2 ELSE 3 END');
    // Suara hanya dibuat untuk NISN yang benar-benar baru tercatat → aman dijalankan ulang.
    expect(sql).toMatch(/ON CONFLICT \(election_id, nisn\) DO NOTHING\s+RETURNING nisn/);
    expect(sql).toMatch(/FROM recorded r\s+JOIN voters v ON v\.nisn = r\.nisn/);
    // Hanya pemilihan [DEMO]; tidak pernah menyentuh pemilihan lain.
    expect(sql).toContain("title LIKE '[DEMO]%'");
    expect(sql).not.toMatch(/\bpublic\.\w/);
  });
});
