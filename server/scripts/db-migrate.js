// Menerapkan file migrasi SQL yang belum dijalankan (server/migrations/*.sql) ke skema DB_SCHEMA.
import { connectAsMigrator, getAdminDbSettings, runCli, runMigrations } from './lib/db-admin.js';

runCli(async () => {
  const settings = getAdminDbSettings();
  const connection = await connectAsMigrator(settings);
  try {
    await runMigrations(connection, settings);
  } finally {
    await connection.end();
  }
});
