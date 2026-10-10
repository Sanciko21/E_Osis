import {
  applyAppGrants,
  connectAsMigrator,
  dropSchema,
  ensureAppUser,
  ensureDatabase,
  getAdminDbSettings,
  runMigrations,
} from '../../scripts/lib/db-admin.js';
import { assertSafeTestDatabase } from './safety.js';

const quiet = () => {};

/** Sekali sebelum seluruh tes: bangun ulang skema tes dari file migrasi. */
export default async function setup() {
  process.env.NODE_ENV = 'test';
  const settings = getAdminDbSettings();
  assertSafeTestDatabase(settings);

  const server = await connectAsMigrator(settings, { withDatabase: false });
  try {
    await ensureDatabase(server, settings.database);
    await ensureAppUser(server, settings, quiet);
  } finally {
    await server.end();
  }

  const connection = await connectAsMigrator(settings);
  try {
    await dropSchema(connection, settings.schema);
    await runMigrations(connection, settings, quiet);
    await applyAppGrants(connection, settings, quiet);
  } finally {
    await connection.end();
  }
}
