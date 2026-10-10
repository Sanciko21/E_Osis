const COLUMNS = `id, title, description, start_at, end_at, status, results_public,
  eligible_voter_count, created_at, updated_at`;

const LOCKS = Object.freeze({ share: ' FOR SHARE', update: ' FOR UPDATE' });

/** Kolom yang boleh diperbarui beserta nama kolom database-nya (allowlist). */
const UPDATABLE = Object.freeze({
  title: 'title',
  description: 'description',
  startAt: 'start_at',
  endAt: 'end_at',
  status: 'status',
  resultsPublic: 'results_public',
  eligibleVoterCount: 'eligible_voter_count',
});

export function mapElection(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startAt: row.start_at,
    endAt: row.end_at,
    status: row.status,
    resultsPublic: Boolean(row.results_public),
    eligibleVoterCount: row.eligible_voter_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function findById(db, id, { lock } = {}) {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM elections WHERE id = $1${LOCKS[lock] ?? ''}`, [id]);
  return rows[0] ? mapElection(rows[0]) : null;
}

/**
 * Status pemilihan + waktu database untuk validasi voting. Baris dikunci FOR SHARE:
 * banyak pemilih boleh membaca bersamaan, tetapi panitia yang menutup pemilihan
 * (UPDATE, butuh kunci eksklusif) harus menunggu transaksi suara yang sedang berjalan.
 */
export async function findForVoting(db, id) {
  const { rows } = await db.query(
    `SELECT id, status, start_at, end_at, clock_timestamp() AS db_now
       FROM elections WHERE id = $1 FOR SHARE`,
    [id],
  );
  if (!rows[0]) return null;
  const row = rows[0];
  return { id: row.id, status: row.status, startAt: row.start_at, endAt: row.end_at, now: row.db_now };
}

export async function findActive(db) {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM elections WHERE status = 'active' LIMIT 1`);
  return rows[0] ? mapElection(rows[0]) : null;
}

/**
 * Pemilihan publik yang paling relevan untuk ditampilkan:
 * aktif → terjadwal terdekat → selesai terbaru. Draft tidak pernah tampil.
 */
export async function findCurrentPublic(db) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM elections
      WHERE status IN ('active', 'scheduled', 'completed')
      ORDER BY array_position(ARRAY['active', 'scheduled', 'completed'], status),
               CASE WHEN status = 'scheduled' THEN start_at END ASC,
               CASE WHEN status = 'completed' THEN end_at END DESC
      LIMIT 1`,
  );
  return rows[0] ? mapElection(rows[0]) : null;
}

/** Pemilihan "utama" untuk dashboard admin (termasuk draft). */
export async function findDashboardFocus(db) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM elections
      ORDER BY array_position(ARRAY['active', 'scheduled', 'completed', 'draft'], status),
               CASE WHEN status = 'scheduled' THEN start_at END ASC,
               CASE WHEN status = 'completed' THEN end_at END DESC,
               updated_at DESC
      LIMIT 1`,
  );
  return rows[0] ? mapElection(rows[0]) : null;
}

export async function listForAdmin(db, { status, limit, offset }) {
  const where = status ? 'WHERE e.status = $1' : '';
  const params = status ? [status] : [];
  const { rows } = await db.query(
    `SELECT ${COLUMNS.replace(/(\w+)/g, 'e.$1')},
            (SELECT COUNT(*) FROM candidates c WHERE c.election_id = e.id) AS candidate_count,
            (SELECT COUNT(*) FROM v_participation_timeline p WHERE p.election_id = e.id) AS voter_count
       FROM elections e
       ${where}
      ORDER BY array_position(ARRAY['active', 'scheduled', 'draft', 'completed'], e.status), e.start_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );
  const {
    rows: [{ total }],
  } = await db.query(`SELECT COUNT(*) AS total FROM elections e ${where}`, params);
  return {
    total,
    items: rows.map((row) => ({
      ...mapElection(row),
      candidateCount: row.candidate_count,
      voterCount: row.voter_count,
    })),
  };
}

export async function countByStatus(db) {
  const { rows } = await db.query('SELECT status, COUNT(*) AS total FROM elections GROUP BY status');
  const counts = { draft: 0, scheduled: 0, active: 0, completed: 0 };
  for (const row of rows) counts[row.status] = row.total;
  return counts;
}

export async function insert(db, election) {
  await db.query(
    `INSERT INTO elections (id, title, description, start_at, end_at, status, results_public, eligible_voter_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      election.id,
      election.title,
      election.description ?? null,
      election.startAt,
      election.endAt,
      election.status ?? 'draft',
      Boolean(election.resultsPublic),
      election.eligibleVoterCount ?? null,
    ],
  );
}

export async function update(db, id, changes) {
  const assignments = [];
  const values = [];
  for (const [field, value] of Object.entries(changes)) {
    const column = UPDATABLE[field];
    if (!column) throw new Error(`Field tidak boleh diperbarui: ${field}`);
    values.push(value ?? null);
    assignments.push(`${column} = $${values.length}`);
  }
  if (assignments.length === 0) return;
  values.push(id);
  await db.query(`UPDATE elections SET ${assignments.join(', ')} WHERE id = $${values.length}`, values);
}

export async function remove(db, id) {
  const result = await db.query('DELETE FROM elections WHERE id = $1', [id]);
  return result.rowCount > 0;
}

export async function countVoters(db, id) {
  const {
    rows: [row],
  } = await db.query('SELECT COUNT(*) AS total FROM v_participation_timeline WHERE election_id = $1', [id]);
  return row.total;
}
