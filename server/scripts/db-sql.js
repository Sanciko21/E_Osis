// Membuat ulang script SQL Editor Supabase di server/sql (setup.sql, demo.sql, demo-delete.sql).
// Jalankan setiap kali menambah file di server/migrations atau mengubah seeds/demo-data.js.
import fs from 'node:fs/promises';
import path from 'node:path';
import { runCli } from './lib/db-admin.js';
import { GENERATED_SQL_FILES, SQL_DIR } from './lib/setup-sql.js';

runCli(async () => {
  await fs.mkdir(SQL_DIR, { recursive: true });
  for (const [name, build] of Object.entries(GENERATED_SQL_FILES)) {
    const target = path.join(SQL_DIR, name);
    await fs.writeFile(target, await build());
    console.log(`✓ ${path.relative(process.cwd(), target)} diperbarui.`);
  }
});
