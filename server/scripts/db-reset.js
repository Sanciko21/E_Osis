// Menghapus skema aplikasi (DB_SCHEMA) lalu membangun ulang. HANYA untuk lingkungan lokal/test.
// Pemakaian: npm run db:reset -- --yes
import {
  applyAppGrants,
  connectAsMigrator,
  dropSchema,
  getAdminDbSettings,
  runCli,
  runMigrations,
} from './lib/db-admin.js';

runCli(async () => {
  const settings = getAdminDbSettings();
  if (settings.nodeEnv === 'production') {
    throw new Error('db:reset ditolak karena NODE_ENV=production.');
  }
  if (!process.argv.includes('--yes')) {
    throw new Error(
      `Perintah ini MENGHAPUS SEMUA DATA di skema '${settings.schema}' (database '${settings.database}'). ` +
        'Jalankan ulang dengan: npm run db:reset -- --yes',
    );
  }
  const connection = await connectAsMigrator(settings);
  try {
    await dropSchema(connection, settings.schema);
    console.log(`✓ Skema '${settings.schema}' beserta seluruh isinya dihapus.`);
    await runMigrations(connection, settings);
    await applyAppGrants(connection, settings);
  } finally {
    await connection.end();
  }
});
