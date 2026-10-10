/**
 * Akses database "dari luar aplikasi" untuk menyiapkan data uji dan memeriksa isi tabel.
 * Memakai akun migrasi (bukan akun aplikasi yang hak aksesnya dibatasi).
 */
import pg from 'pg';
import { connectAsMigrator, getAdminDbSettings } from '../../scripts/lib/db-admin.js';
import { assertSafeTestDatabase } from '../setup/safety.js';

let connectionPromise;

export function getAdminConnection() {
  connectionPromise ??= (async () => {
    const settings = getAdminDbSettings();
    assertSafeTestDatabase(settings);
    return connectAsMigrator(settings);
  })();
  return connectionPromise;
}

export async function closeAdminConnection() {
  if (connectionPromise) {
    const connection = await connectionPromise;
    connectionPromise = undefined;
    await connection.end();
  }
}

export async function sql(query, params = []) {
  const connection = await getAdminConnection();
  const { rows } = await connection.query(query, params);
  return rows;
}

const TABLES = ['votes', 'voter_participation', 'candidates', 'elections', 'audit_logs', 'admin_sessions', 'admin_users'];

export async function resetDatabase() {
  await sql(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY`);
}

export async function countRows(table, where = 'TRUE', params = []) {
  const [row] = await sql(`SELECT COUNT(*) AS total FROM ${table} WHERE ${where}`, params);
  return Number(row.total);
}

/** Memasang trigger yang menggagalkan INSERT (simulasi kegagalan database). */
export async function installFailingTrigger(table, message = `Simulasi kegagalan INSERT ${table}`) {
  const name = `trg_test_fail_${table}`;
  await sql(`
    CREATE OR REPLACE FUNCTION test_fail_insert() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION '%', TG_ARGV[0];
    END;
    $$`);
  await sql(`DROP TRIGGER IF EXISTS ${name} ON ${table}`);
  await sql(
    `CREATE TRIGGER ${name} BEFORE INSERT ON ${table}
     FOR EACH ROW EXECUTE FUNCTION test_fail_insert(${pg.escapeLiteral(message)})`,
  );
  return () => sql(`DROP TRIGGER IF EXISTS ${name} ON ${table}`);
}
