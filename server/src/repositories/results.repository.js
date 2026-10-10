/**
 * Query agregasi hasil. Seluruhnya membaca VIEW agregat (v_candidate_vote_counts,
 * v_participation_timeline), bukan tabel votes/voter_participation secara langsung.
 */

/** Perolehan suara setiap kandidat (kandidat tanpa suara tetap muncul dengan 0). */
export async function candidateTallies(db, electionId) {
  const { rows } = await db.query(
    `SELECT c.id, c.candidate_number, c.chairperson_name, c.vice_chairperson_name, c.photo_url,
            COALESCE(v.vote_count, 0) AS vote_count
       FROM candidates c
       LEFT JOIN v_candidate_vote_counts v
              ON v.election_id = c.election_id AND v.candidate_id = c.id
      WHERE c.election_id = $1
      ORDER BY c.candidate_number`,
    [electionId],
  );
  return rows.map((row) => ({
    id: row.id,
    candidateNumber: row.candidate_number,
    chairpersonName: row.chairperson_name,
    viceChairpersonName: row.vice_chairperson_name,
    photoUrl: row.photo_url,
    votes: Number(row.vote_count),
  }));
}

/** Total suara sah (dihitung langsung oleh database). */
export async function totalValidVotes(db, electionId) {
  const {
    rows: [row],
  } = await db.query('SELECT COALESCE(SUM(vote_count), 0) AS total FROM v_candidate_vote_counts WHERE election_id = $1', [
    electionId,
  ]);
  return Number(row.total);
}

/** Jumlah pemilih unik + waktu suara pertama/terakhir. */
export async function participationSummary(db, electionId) {
  const {
    rows: [row],
  } = await db.query(
    `SELECT COUNT(*) AS voters, MIN(voted_at) AS first_voted_at, MAX(voted_at) AS last_voted_at
       FROM v_participation_timeline WHERE election_id = $1`,
    [electionId],
  );
  return { uniqueVoters: Number(row.voters), firstVotedAt: row.first_voted_at, lastVotedAt: row.last_voted_at };
}

/** Jumlah pemilih per interval waktu (bucketSeconds), dikelompokkan oleh database dengan date_bin. */
export async function participationTimeline(db, electionId, bucketSeconds) {
  const { rows } = await db.query(
    `SELECT date_bin(make_interval(secs => $1), voted_at, TIMESTAMPTZ '1970-01-01 00:00:00+00') AS bucket_start,
            COUNT(*) AS voters
       FROM v_participation_timeline
      WHERE election_id = $2
      GROUP BY bucket_start
      ORDER BY bucket_start`,
    [bucketSeconds, electionId],
  );
  return rows.map((row) => ({ bucketStart: row.bucket_start, voters: Number(row.voters) }));
}
