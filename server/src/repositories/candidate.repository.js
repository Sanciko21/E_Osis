const COLUMNS = `id, election_id, candidate_number, chairperson_name, vice_chairperson_name,
  photo_url, vision, mission, created_at, updated_at`;

const UPDATABLE = Object.freeze({
  candidateNumber: 'candidate_number',
  chairpersonName: 'chairperson_name',
  viceChairpersonName: 'vice_chairperson_name',
  photoUrl: 'photo_url',
  vision: 'vision',
  mission: 'mission',
});

export function mapCandidate(row) {
  return {
    id: row.id,
    electionId: row.election_id,
    candidateNumber: row.candidate_number,
    chairpersonName: row.chairperson_name,
    viceChairpersonName: row.vice_chairperson_name,
    photoUrl: row.photo_url,
    vision: row.vision,
    mission: row.mission,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listByElection(db, electionId) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM candidates WHERE election_id = $1 ORDER BY candidate_number`,
    [electionId],
  );
  return rows.map(mapCandidate);
}

export async function findById(db, id) {
  const { rows } = await db.query(`SELECT ${COLUMNS} FROM candidates WHERE id = $1`, [id]);
  return rows[0] ? mapCandidate(rows[0]) : null;
}

/** Memastikan kandidat terdaftar pada pemilihan tersebut (dikunci FOR SHARE selama transaksi suara). */
export async function existsInElectionForVoting(db, candidateId, electionId) {
  const { rows } = await db.query('SELECT id FROM candidates WHERE id = $1 AND election_id = $2 FOR SHARE', [
    candidateId,
    electionId,
  ]);
  return rows.length > 0;
}

export async function countByElection(db, electionId) {
  const {
    rows: [row],
  } = await db.query('SELECT COUNT(*) AS total FROM candidates WHERE election_id = $1', [electionId]);
  return row.total;
}

export async function insert(db, candidate) {
  await db.query(
    `INSERT INTO candidates
       (id, election_id, candidate_number, chairperson_name, vice_chairperson_name, photo_url, vision, mission)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      candidate.id,
      candidate.electionId,
      candidate.candidateNumber,
      candidate.chairpersonName,
      candidate.viceChairpersonName,
      candidate.photoUrl ?? null,
      candidate.vision,
      candidate.mission,
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
  await db.query(`UPDATE candidates SET ${assignments.join(', ')} WHERE id = $${values.length}`, values);
}

export async function remove(db, id) {
  const result = await db.query('DELETE FROM candidates WHERE id = $1', [id]);
  return result.rowCount > 0;
}
