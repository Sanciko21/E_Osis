function mapAdmin(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isActive: Boolean(row.is_active),
    lastLoginAt: row.last_login_at ?? null,
  };
}

/** Dipakai khusus untuk login (memuat password_hash). */
export async function findByEmailForLogin(db, email) {
  const { rows } = await db.query(
    'SELECT id, name, email, role, is_active, last_login_at, password_hash FROM admin_users WHERE email = $1',
    [email],
  );
  if (!rows[0]) return null;
  return { ...mapAdmin(rows[0]), passwordHash: rows[0].password_hash };
}

export async function touchLastLogin(db, id) {
  await db.query('UPDATE admin_users SET last_login_at = now() WHERE id = $1', [id]);
}
