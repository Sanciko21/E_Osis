/**
 * Penulisan data pemungutan suara. Sengaja HANYA berisi operasi INSERT:
 * aplikasi tidak memiliki fungsi (maupun hak akses database) untuk membaca NISN,
 * membaca baris suara individual, mengubah, atau menghapus suara.
 */

/**
 * Mencatat bahwa NISN telah memilih. UNIQUE(election_id, nisn) membuat INSERT kedua
 * untuk NISN yang sama gagal dengan unique_violation (23505) — termasuk saat dua request
 * paralel: INSERT kedua menunggu transaksi pertama selesai, lalu ditolak setelah COMMIT.
 */
export async function insertParticipation(db, { electionId, nisn }) {
  await db.query('INSERT INTO voter_participation (election_id, nisn) VALUES ($1, $2)', [electionId, nisn]);
}

/**
 * Menyimpan suara tanpa identitas. created_on memakai DEFAULT kolom (hanya tanggal UTC)
 * agar waktu suara tidak dapat dicocokkan dengan waktu partisipasi.
 */
export async function insertVote(db, { id, electionId, candidateId }) {
  await db.query('INSERT INTO votes (id, election_id, candidate_id) VALUES ($1, $2, $3)', [
    id,
    electionId,
    candidateId,
  ]);
}
