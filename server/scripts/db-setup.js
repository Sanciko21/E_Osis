// Langkah lengkap: buat database (bila perlu) + role aplikasi, jalankan migrasi, terapkan grant.
import {
  applyAppGrants,
  connectAsMigrator,
  ensureAppUser,
  ensureDatabase,
  getAdminDbSettings,
  runCli,
  runMigrations,
} from './lib/db-admin.js';

runCli(async () => {
  const settings = getAdminDbSettings();
  const server = await connectAsMigrator(settings, { withDatabase: false });
  try {
    await ensureDatabase(server, settings.database);
    console.log(`✓ Database '${settings.database}' siap.`);
    await ensureAppUser(server, settings);
  } finally {
    await server.end();
  }

  const connection = await connectAsMigrator(settings);
  try {
    await runMigrations(connection, settings);
    await applyAppGrants(connection, settings);
  } finally {
    await connection.end();
  }
  console.log('Selesai. Lanjutkan dengan: npm run db:seed');
});
