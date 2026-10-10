/**
 * Manajemen akun admin lewat CLI (aman untuk production; tidak ada endpoint HTTP
 * untuk membuat admin).
 *
 *   npm run admin:create -- --email ketua@sekolah.sch.id --name "Ketua Panitia" --role admin
 *   npm run admin:list
 *   npm run admin:reset-password -- --email ketua@sekolah.sch.id
 *   npm run admin:deactivate -- --email ketua@sekolah.sch.id
 *   npm run admin:activate -- --email ketua@sekolah.sch.id
 *
 * Tanpa koneksi database — mencetak SQL untuk ditempel ke SQL Editor Supabase:
 *   npm run admin:sql -- --email ketua@sekolah.sch.id --name "Ketua Panitia" --role admin
 *   npm run admin:sql -- --email ketua@sekolah.sch.id --reset        (ganti password)
 *
 * Password dibaca dari prompt (tampil "*", diketik dua kali; dengan --show terlihat dan cukup
 * sekali), variabel ADMIN_PASSWORD, atau dibuat acak dengan --generate (ditampilkan sekali).
 */
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { hashPassword, validatePasswordPolicy } from '../src/utils/security.js';
import { connectAsMigrator, getAdminDbSettings, runCli } from './lib/db-admin.js';
import { generatePassword, promptPassword } from './lib/passwords.js';

const ROLES = ['admin', 'observer'];
const PASSWORD_QUESTION = 'Password baru (min. 12 karakter, huruf & angka): ';

async function obtainPassword({ generate, show }) {
  if (generate) {
    const password = generatePassword();
    return { password, generated: true };
  }
  if (process.env.ADMIN_PASSWORD) return { password: process.env.ADMIN_PASSWORD, generated: false };
  // Terlihat di layar: salah ketik langsung tampak, jadi tidak perlu diulang.
  if (show) return { password: await promptPassword(PASSWORD_QUESTION, { mask: false }), generated: false };
  const first = await promptPassword(PASSWORD_QUESTION);
  const second = await promptPassword('Ulangi password: ');
  if (first !== second) throw new Error('Kedua password tidak sama.');
  return { password: first, generated: false };
}

function assertPolicy(password) {
  const problems = validatePasswordPolicy(password);
  if (problems.length) throw new Error(`Password harus ${problems.join(', ')}.`);
}

function assertEmail(email) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Gunakan --email dengan alamat email valid.');
}

function assertNewAccount(values) {
  if (!ROLES.includes(values.role)) throw new Error(`--role harus salah satu dari: ${ROLES.join(', ')}`);
  const name = values.name?.trim();
  if (!name || name.length < 3) throw new Error('Gunakan --name dengan nama minimal 3 karakter.');
  return name;
}

/**
 * Mencetak SQL pembuatan akun (atau ganti password dengan --reset) untuk SQL Editor Supabase.
 * Hash Argon2id dibuat di komputer ini: SQL Editor tidak dapat membuatnya, dan password
 * aslinya tidak pernah dikirim ke Supabase.
 */
async function printAdminSql(values, email, schema) {
  assertEmail(email);
  const name = values.reset ? null : assertNewAccount(values);
  const { password, generated } = await obtainPassword(values);
  assertPolicy(password);
  const hash = pg.escapeLiteral(await hashPassword(password));
  const target = (table) => `${pg.escapeIdentifier(schema)}.${table}`;
  const emailLiteral = pg.escapeLiteral(email);

  const sql = values.reset
    ? `DO $eosis$
BEGIN
  UPDATE ${target('admin_users')} SET password_hash = ${hash} WHERE email = ${emailLiteral};
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Akun admin % tidak ditemukan.', ${emailLiteral};
  END IF;
  -- Semua sesi login lama akun ini dicabut.
  DELETE FROM ${target('admin_sessions')}
   WHERE admin_user_id IN (SELECT id FROM ${target('admin_users')} WHERE email = ${emailLiteral});
END
$eosis$;`
    : `INSERT INTO ${target('admin_users')} (id, name, email, password_hash, role)
VALUES (${pg.escapeLiteral(crypto.randomUUID())}, ${pg.escapeLiteral(name)}, ${emailLiteral}, ${hash}, ${pg.escapeLiteral(values.role)});`;

  if (generated) {
    console.log(`Password ${email} (simpan sekarang, hanya ditampilkan sekali — JANGAN ikut ditempel): ${password}\n`);
  }
  console.log('-- Salin SQL di bawah ini ke Supabase → SQL Editor, lalu klik Run.');
  console.log(sql);
}

runCli(async () => {
  const command = process.argv[2];
  const { values } = parseArgs({
    args: process.argv.slice(3),
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      role: { type: 'string', default: 'admin' },
      generate: { type: 'boolean', default: false },
      reset: { type: 'boolean', default: false },
      show: { type: 'boolean', default: false },
    },
  });
  const email = values.email?.trim().toLowerCase();
  const settings = getAdminDbSettings();
  if (command === 'sql') {
    await printAdminSql(values, email, settings.schema);
    return;
  }
  const connection = await connectAsMigrator(settings);

  try {
    if (command === 'list') {
      const { rows } = await connection.query(
        'SELECT email, name, role, is_active, last_login_at FROM admin_users ORDER BY created_at',
      );
      console.table(rows);
      return;
    }

    assertEmail(email);
    const {
      rows: [existing],
    } = await connection.query('SELECT id, is_active FROM admin_users WHERE email = $1', [email]);

    switch (command) {
      case 'create': {
        if (existing) throw new Error(`Akun ${email} sudah ada. Gunakan admin:reset-password bila perlu.`);
        const name = assertNewAccount(values);
        const { password, generated } = await obtainPassword(values);
        assertPolicy(password);
        await connection.query(
          'INSERT INTO admin_users (id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
          [crypto.randomUUID(), name, email, await hashPassword(password), values.role],
        );
        console.log(`✓ Akun ${values.role} ${email} dibuat.`);
        if (generated) console.log(`  Password (hanya ditampilkan sekali): ${password}`);
        break;
      }
      case 'reset-password': {
        if (!existing) throw new Error(`Akun ${email} tidak ditemukan.`);
        const { password, generated } = await obtainPassword(values);
        assertPolicy(password);
        await connection.query('UPDATE admin_users SET password_hash = $1 WHERE id = $2', [
          await hashPassword(password),
          existing.id,
        ]);
        await connection.query('DELETE FROM admin_sessions WHERE admin_user_id = $1', [existing.id]);
        console.log(`✓ Password ${email} diganti dan semua sesi lamanya dihapus.`);
        if (generated) console.log(`  Password baru (hanya ditampilkan sekali): ${password}`);
        break;
      }
      case 'deactivate':
      case 'activate': {
        if (!existing) throw new Error(`Akun ${email} tidak ditemukan.`);
        const active = command === 'activate';
        await connection.query('UPDATE admin_users SET is_active = $1 WHERE id = $2', [active, existing.id]);
        if (!active) await connection.query('DELETE FROM admin_sessions WHERE admin_user_id = $1', [existing.id]);
        console.log(`✓ Akun ${email} ${active ? 'diaktifkan' : 'dinonaktifkan (semua sesi dihapus)'}.`);
        break;
      }
      default:
        throw new Error('Perintah tidak dikenal. Gunakan: create | list | reset-password | deactivate | activate | sql');
    }
  } finally {
    await connection.end();
  }
});
