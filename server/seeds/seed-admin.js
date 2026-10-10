/**
 * Seed akun admin & pengawas untuk LINGKUNGAN LOKAL. Ditolak saat NODE_ENV=production
 * (gunakan `npm run admin:create`). Tidak ada password bawaan di kode: password diambil
 * dari SEED_ADMIN_PASSWORD / SEED_OBSERVER_PASSWORD, atau dibuat acak dan ditampilkan sekali.
 */
import crypto from 'node:crypto';
import { hashPassword, validatePasswordPolicy } from '../src/utils/security.js';
import { connectAsMigrator, getAdminDbSettings, runCli } from '../scripts/lib/db-admin.js';
import { generatePassword } from '../scripts/lib/passwords.js';

runCli(async () => {
  const settings = getAdminDbSettings();
  if (settings.nodeEnv === 'production') {
    throw new Error('db:seed hanya untuk lingkungan lokal. Di production gunakan: npm run admin:create');
  }

  const accounts = [
    {
      role: 'admin',
      name: 'Admin Panitia (Lokal)',
      email: (process.env.SEED_ADMIN_EMAIL || 'admin@eosis.local').toLowerCase(),
      password: process.env.SEED_ADMIN_PASSWORD,
    },
    {
      role: 'observer',
      name: 'Pengawas (Lokal)',
      email: (process.env.SEED_OBSERVER_EMAIL || 'pengawas@eosis.local').toLowerCase(),
      password: process.env.SEED_OBSERVER_PASSWORD,
    },
  ];

  const connection = await connectAsMigrator(settings);
  try {
    for (const account of accounts) {
      const { rowCount } = await connection.query('SELECT id FROM admin_users WHERE email = $1', [account.email]);
      if (rowCount > 0) {
        console.log(`• ${account.email} sudah ada — dilewati.`);
        continue;
      }
      const generated = !account.password;
      const password = account.password || generatePassword();
      const problems = validatePasswordPolicy(password);
      if (problems.length) throw new Error(`Password ${account.email} harus ${problems.join(', ')}.`);

      await connection.query(
        'INSERT INTO admin_users (id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
        [crypto.randomUUID(), account.name, account.email, await hashPassword(password), account.role],
      );
      console.log(`✓ Akun ${account.role} dibuat: ${account.email}`);
      console.log(
        generated
          ? `  Password (simpan sekarang, hanya ditampilkan sekali): ${password}`
          : '  Password diambil dari variabel environment.',
      );
    }
  } finally {
    await connection.end();
  }
});
