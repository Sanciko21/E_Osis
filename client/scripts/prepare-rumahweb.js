/**
 * Melengkapi hasil `vite build --mode rumahweb` (client/dist) dengan berkas hosting cPanel:
 *   .htaccess        → HTTPS, fallback halaman React, header keamanan, /api → proxy PHP
 *   api/index.php    → proxy ke Supabase Edge Function (satu origin → cookie admin berfungsi)
 *   api/.user.ini    → PHP meneruskan isi request mentah (unggah foto)
 *   assets/.htaccess → cache panjang untuk file ber-hash
 * Templat ada di deploy/rumahweb/. Konfigurasi dibaca dari client/.env.rumahweb.
 *
 * Dijalankan oleh: npm run build:rumahweb
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const CLIENT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE_DIR = path.resolve(CLIENT_DIR, '..', 'deploy', 'rumahweb');
const DIST_DIR = path.join(CLIENT_DIR, 'dist');

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const env = loadEnv('rumahweb', CLIENT_DIR, '');
const basePath = `/${(env.BASE_PATH ?? '').trim().replace(/^\/+|\/+$/g, '')}/`.replace('//', '/');
const upstream = (env.SUPABASE_FUNCTIONS_URL ?? '').trim().replace(/\/+$/, '');

if (!fs.existsSync(path.join(CLIENT_DIR, '.env.rumahweb'))) {
  fail('client/.env.rumahweb belum ada. Salin dari client/.env.rumahweb.example lalu sesuaikan.');
}
if (!/^https:\/\/[a-z0-9]{20}\.supabase\.co\/functions\/v1$/.test(upstream)) {
  fail('SUPABASE_FUNCTIONS_URL harus berbentuk https://<project-ref>.supabase.co/functions/v1');
}
if (!/^\/([A-Za-z0-9._-]+\/)*$/.test(basePath)) {
  fail(`BASE_PATH tidak valid: "${env.BASE_PATH}". Contoh: /E-Voting/`);
}
if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  fail('client/dist/index.html tidak ditemukan. Jalankan lewat "npm run build:rumahweb".');
}

const fill = (text) => text.replaceAll('__BASE_PATH__', basePath).replaceAll('__UPSTREAM__', upstream);
const copy = (relative) => {
  const target = path.join(DIST_DIR, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, fill(fs.readFileSync(path.join(TEMPLATE_DIR, relative), 'utf8')));
};

copy('.htaccess');
copy('api/index.php');
copy('api/.user.ini');
fs.writeFileSync(
  path.join(DIST_DIR, 'assets', '.htaccess'),
  '# File ber-hash: aman di-cache lama (nama berubah setiap build).\n' +
    '<IfModule mod_headers.c>\n  Header set Cache-Control "public, max-age=31536000, immutable"\n</IfModule>\n',
);

console.log(`✓ Build Rumahweb siap di client/dist (folder ${basePath}, API → ${upstream})`);
console.log(`  Unggah SELURUH isi client/dist (termasuk file .htaccess & folder api) ke public_html${basePath}`);
