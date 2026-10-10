export async function insert(db, entry) {
  await db.query(
    `INSERT INTO audit_logs (admin_user_id, action, entity_type, entity_id, election_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      entry.adminUserId ?? null,
      entry.action,
      entry.entityType,
      entry.entityId ?? null,
      entry.electionId ?? null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
    ],
  );
}

export async function list(db, { electionId, limit, offset }) {
  const where = electionId ? 'WHERE l.election_id = $1' : '';
  const params = electionId ? [electionId] : [];
  const { rows } = await db.query(
    `SELECT l.id, l.action, l.entity_type, l.entity_id, l.election_id, l.metadata, l.created_at,
            u.id AS admin_id, u.name AS admin_name, u.email AS admin_email, u.role AS admin_role
       FROM audit_logs l
       LEFT JOIN admin_users u ON u.id = l.admin_user_id
       ${where}
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );
  const {
    rows: [{ total }],
  } = await db.query(`SELECT COUNT(*) AS total FROM audit_logs l ${where}`, params);
  return {
    total,
    items: rows.map((row) => ({
      id: Number(row.id),
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      electionId: row.election_id,
      metadata: row.metadata,
      createdAt: row.created_at,
      admin: row.admin_id
        ? { id: row.admin_id, name: row.admin_name, email: row.admin_email, role: row.admin_role }
        : null,
    })),
  };
}
