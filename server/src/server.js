import { createApp } from './app.js';
import { closePool, connectionHint, getPool } from './config/database.js';
import { getConfig } from './config/env.js';
import { purgeExpiredSessions } from './services/auth.service.js';
import { describeError, logger } from './utils/logger.js';

const SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
// Port Transaction pooler Supabase: tidak mempertahankan search_path per koneksi.
const SUPABASE_TRANSACTION_POOLER_PORT = 6543;

/** Gagal cepat bila database tidak terjangkau atau skema belum dimigrasi/diberi hak akses. */
async function checkDatabase(dbConfig) {
  let ready;
  try {
    const { rows } = await getPool().query("SELECT to_regclass('elections') IS NOT NULL AS ready");
    ready = rows[0].ready;
  } catch (error) {
    logger.error('Tidak dapat terhubung ke PostgreSQL. Periksa DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_SSL di server/.env', {
      error: describeError(error),
      hint: connectionHint(error) ?? undefined,
    });
    return false;
  }
  if (!ready) {
    logger.error(
      `Tabel E-OSIS tidak ditemukan di skema "${dbConfig.schema}" (atau akun ${dbConfig.user} belum diberi hak akses). ` +
        'Jalankan: npm run db:setup',
    );
  }
  return ready;
}

async function main() {
  const config = getConfig();

  if (config.db.port === SUPABASE_TRANSACTION_POOLER_PORT) {
    logger.warn(
      'DB_PORT=6543 adalah Transaction pooler Supabase, yang tidak cocok untuk server ini. ' +
        'Gunakan Session pooler (port 5432) atau koneksi langsung.',
    );
  }
  if (!(await checkDatabase(config.db))) process.exit(1);

  const app = createApp({ config });
  const server = app.listen(config.port, config.host, () => {
    logger.info(`E-OSIS API berjalan di http://${config.host}:${config.port} (${config.env})`);
  });

  const cleanup = setInterval(() => {
    purgeExpiredSessions(config.session).catch((error) =>
      logger.warn('Pembersihan sesi kedaluwarsa gagal', { error: describeError(error) }),
    );
  }, SESSION_CLEANUP_INTERVAL_MS);
  cleanup.unref();

  const shutdown = (signal) => {
    logger.info(`${signal} diterima, menghentikan server...`);
    clearInterval(cleanup);
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  logger.error('Server gagal dijalankan', { error: describeError(error, { includeStack: true }) });
  process.exit(1);
});
