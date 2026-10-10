// Menerapkan hak akses minimum untuk akun aplikasi (DB_USER) lalu menampilkan hasilnya.
import { applyAppGrants, connectAsMigrator, getAdminDbSettings, listGrants, runCli } from './lib/db-admin.js';

runCli(async () => {
  const settings = getAdminDbSettings();
  const connection = await connectAsMigrator(settings);
  try {
    if (await applyAppGrants(connection, settings)) {
      console.log('  Hak akses saat ini:');
      for (const grant of await listGrants(connection, settings)) console.log(`   ${grant}`);
    }
  } finally {
    await connection.end();
  }
});
