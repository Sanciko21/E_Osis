export async function insert(db, { id, adminUserId, csrfToken, userAgent, absoluteHours }) {
  await db.query(
    `INSERT INTO admin_sessions (id, admin_user_id, csrf_token, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, now() + make_interval(hours => $5))`,
    [id, adminUserId, csrfToken, userAgent, absoluteHours],
  );
}

/**
 * Sesi valid jika: belum melewati batas absolut, belum idle melebihi batas,
 * dan akun admin masih aktif. Akun yang dinonaktifkan langsung kehilangan akses.
 */
export async function findValid(db, id, idleMinutes) {
  const { rows } = await db.query(
    `SELECT s.id AS session_id, s.csrf_token, s.last_seen_at, s.expires_at,
            EXTRACT(EPOCH FROM now() - s.last_seen_at)::integer AS idle_seconds,
            u.id, u.name, u.email, u.role
       FROM admin_sessions s
       JOIN admin_users u ON u.id = s.admin_user_id
      WHERE s.id = $1
        AND u.is_active = TRUE
        AND s.expires_at > now()
        AND s.last_seen_at > now() - make_interval(mins => $2)`,
    [id, idleMinutes],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    sessionId: row.session_id,
    csrfToken: row.csrf_token,
    idleSeconds: Number(row.idle_seconds),
    expiresAt: row.expires_at,
    user: { id: row.id, name: row.name, email: row.email, role: row.role },
  };
}

export async function touch(db, id) {
  await db.query('UPDATE admin_sessions SET last_seen_at = now() WHERE id = $1', [id]);
}

export async function remove(db, id) {
  await db.query('DELETE FROM admin_sessions WHERE id = $1', [id]);
}

export async function removeExpired(db, idleMinutes) {
  const result = await db.query(
    `DELETE FROM admin_sessions
      WHERE expires_at <= now() OR last_seen_at <= now() - make_interval(mins => $1)`,
    [idleMinutes],
  );
  return result.rowCount;
}
