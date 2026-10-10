/**
 * Data DEMO untuk pengembangan lokal: satu pemilihan bertanda "[DEMO]" dan tiga pasangan
 * calon fiktif. TIDAK membuat suara apa pun — hasil yang tampil selalu berasal dari suara
 * nyata yang masuk lewat API. Ditolak saat NODE_ENV=production.
 *
 *   npm run db:seed:demo            → status "scheduled", dimulai besok
 *   npm run db:seed:demo -- --open  → status "active", bisa langsung dipakai mencoba voting
 */
import crypto from 'node:crypto';
import { connectAsMigrator, getAdminDbSettings, runCli } from '../scripts/lib/db-admin.js';
import { isDuplicateKeyError } from '../src/utils/errors.js';
import { DEMO_CANDIDATES, DEMO_DESCRIPTION, DEMO_TITLE, demoPhotoUrl } from './demo-data.js';

runCli(async () => {
  const settings = getAdminDbSettings();
  if (settings.nodeEnv === 'production') throw new Error('db:seed:demo ditolak karena NODE_ENV=production.');
  const open = process.argv.includes('--open');

  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const startAt = open ? new Date(now - 5 * 60 * 1000) : new Date(Math.ceil(now / hour) * hour + 24 * hour);
  const endAt = new Date(startAt.getTime() + (open ? 8 : 6) * hour);
  const electionId = crypto.randomUUID();

  const connection = await connectAsMigrator(settings);
  try {
    await connection.query('BEGIN');
    await connection.query(
      `INSERT INTO elections (id, title, description, start_at, end_at, status, results_public, eligible_voter_count)
       VALUES ($1, $2, $3, $4, $5, $6, FALSE, NULL)`,
      [
        electionId,
        DEMO_TITLE,
        DEMO_DESCRIPTION,
        startAt,
        endAt,
        open ? 'active' : 'scheduled',
      ],
    );
    for (const [index, candidate] of DEMO_CANDIDATES.entries()) {
      await connection.query(
        `INSERT INTO candidates (id, election_id, candidate_number, chairperson_name, vice_chairperson_name, photo_url, vision, mission)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          crypto.randomUUID(),
          electionId,
          index + 1,
          candidate.chairpersonName,
          candidate.viceChairpersonName,
          demoPhotoUrl(index + 1),
          candidate.vision,
          candidate.mission,
        ],
      );
    }
    await connection.query('COMMIT');
    console.log(`✓ Pemilihan demo dibuat (${open ? 'active' : 'scheduled'}) dengan ${DEMO_CANDIDATES.length} pasangan calon.`);
    console.log(`  Jadwal (UTC): ${startAt.toISOString()} s.d. ${endAt.toISOString()}`);
  } catch (error) {
    await connection.query('ROLLBACK');
    if (isDuplicateKeyError(error, 'uq_elections_single_active')) throw new Error('Sudah ada pemilihan aktif. Tutup terlebih dahulu atau jalankan tanpa --open.');
    throw error;
  } finally {
    await connection.end();
  }
});
