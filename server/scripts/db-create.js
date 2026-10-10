// Membuat database (bila belum ada) dan role aplikasi berhak minimum. Butuh akun berhak CREATEROLE.
import { connectAsMigrator, ensureAppUser, ensureDatabase, getAdminDbSettings, runCli } from './lib/db-admin.js';

runCli(async () => {
  const settings = getAdminDbSettings();
  const connection = await connectAsMigrator(settings, { withDatabase: false });
  try {
    await ensureDatabase(connection, settings.database);
    console.log(`✓ Database '${settings.database}' siap.`);
    await ensureAppUser(connection, settings);
  } finally {
    await connection.end();
  }
});
