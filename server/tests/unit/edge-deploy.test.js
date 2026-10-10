import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getConfig, initConfig, SERVER_ROOT } from '../../src/config/env.js';
import { deleteLocalPhoto, saveCandidatePhoto } from '../../src/services/upload.service.js';
import { getDummyPasswordHash, hashPassword, verifyPassword } from '../../src/utils/security.js';
import { createCandidateSchema } from '../../src/validators/candidate.validators.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0]);
const SUPABASE_URL = 'https://proyekuji.supabase.co';
const PUBLIC_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/candidate-photos/candidates/`;

describe('Password Argon2id (hash-wasm, tanpa modul native)', () => {
  it('hash baru memakai parameter aplikasi dan dapat diverifikasi', async () => {
    const hash = await hashPassword('Rahasia#Admin2026');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
    expect(await verifyPassword(hash, 'Rahasia#Admin2026')).toBe(true);
    expect(await verifyPassword(hash, 'Rahasia#Admin2027')).toBe(false);
  });

  it('hash buatan modul argon2 native (urutan parameter m,p,t) tetap diterima', async () => {
    // Modul argon2 native (dipakai sebelumnya) menulis parameter berurutan m,p,t; hash-wasm m,t,p.
    const nativeHash = await hashPassword('Contoh#Password2026');
    const reordered = nativeHash.replace('m=65536,t=3,p=1', 'm=65536,p=1,t=3');
    expect(await verifyPassword(reordered, 'Contoh#Password2026')).toBe(true);
  });

  it('hash rusak/bukan Argon2 ditolak tanpa melempar error', async () => {
    expect(await verifyPassword('bukan-hash', 'apa saja')).toBe(false);
    expect(await verifyPassword('', 'apa saja')).toBe(false);
  });

  it('hash dummy (penyama waktu login) memakai parameter yang sama dengan hash asli', async () => {
    expect(await getDummyPasswordHash()).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
  });
});

describe('Foto kandidat di Supabase Storage (PHOTO_STORAGE=supabase)', () => {
  let fetchMock;

  function useSupabaseStorage(key = 'sb_secret_kunciuji') {
    initConfig({ ...process.env, PHOTO_STORAGE: 'supabase', SUPABASE_URL, SUPABASE_SECRET_KEYS: JSON.stringify({ default: key }) });
  }

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    initConfig(process.env);
  });

  it('mengunggah ke bucket dengan nama file acak dan menyimpan URL publik HTTPS', async () => {
    useSupabaseStorage();
    const saved = await saveCandidatePhoto(PNG, '/tidak-dipakai');
    expect(saved.contentType).toBe('image/png');
    expect(saved.url).toMatch(new RegExp(`^${PUBLIC_PREFIX.replaceAll('.', '\\.')}[0-9a-f-]{36}\\.png$`));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${SUPABASE_URL}/storage/v1/object/candidate-photos/candidates/${saved.url.slice(PUBLIC_PREFIX.length)}`);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ apikey: 'sb_secret_kunciuji', 'Content-Type': 'image/png', 'x-upsert': 'false' });
    expect(init.headers.Authorization).toBeUndefined(); // kunci sb_secret bukan JWT
    // URL publik lolos validasi photo_url yang sudah ada (HTTPS).
    expect(
      createCandidateSchema.safeParse({
        candidateNumber: 1,
        chairpersonName: 'Andi Saputra',
        viceChairpersonName: 'Bunga Lestari',
        vision: 'Visi pasangan calon uji.',
        mission: 'Misi pasangan calon uji.',
        photoUrl: saved.url,
      }).success,
    ).toBe(true);
  });

  it('kunci service_role lama (JWT) juga dikirim sebagai Bearer', async () => {
    useSupabaseStorage('eyJhbGciOiJIUzI1NiJ9.uji.tandatangan');
    await saveCandidatePhoto(PNG, '/tidak-dipakai');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer eyJhbGciOiJIUzI1NiJ9.uji.tandatangan');
  });

  it('gagal unggah → error 502 yang jelas; file bukan gambar ditolak sebelum mengunggah', async () => {
    useSupabaseStorage();
    fetchMock.mockResolvedValueOnce(new Response('Bucket not found', { status: 404 }));
    await expect(saveCandidatePhoto(PNG, '/tidak-dipakai')).rejects.toMatchObject({ status: 502, code: 'PHOTO_STORAGE_FAILED' });
    await expect(saveCandidatePhoto(Buffer.from('bukan gambar'), '/tidak-dipakai')).rejects.toMatchObject({ code: 'INVALID_IMAGE' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('hanya menghapus foto milik bucket aplikasi; URL lain tidak disentuh', async () => {
    useSupabaseStorage();
    const fileName = '0f8fad5b-d9cb-469f-a165-70867728950e.png';
    await deleteLocalPhoto(`${PUBLIC_PREFIX}${fileName}`, '/tidak-dipakai');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${SUPABASE_URL}/storage/v1/object/candidate-photos`);
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(init.body)).toEqual({ prefixes: [`candidates/${fileName}`] });

    for (const other of ['https://contoh.com/foto.png', `${PUBLIC_PREFIX}../rahasia.png`, `${PUBLIC_PREFIX}foto.png`, null]) {
      await deleteLocalPhoto(other, '/tidak-dipakai');
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('bawaan tetap folder lokal (server Node.js & pengembangan)', () => {
    expect(getConfig().uploads.storage).toEqual({ driver: 'local' });
  });
});

describe('Supabase Edge Function "api"', () => {
  const functionDir = path.resolve(SERVER_ROOT, '..', 'supabase', 'functions', 'api');
  const denoImports = JSON.parse(fs.readFileSync(path.join(functionDir, 'deno.json'), 'utf8')).imports;
  const lock = JSON.parse(fs.readFileSync(path.join(SERVER_ROOT, 'package-lock.json'), 'utf8'));

  it('setiap paket npm yang diimpor server/src dipetakan di deno.json dengan versi yang sama', () => {
    const sourceFiles = fs.readdirSync(path.join(SERVER_ROOT, 'src'), { recursive: true }).filter((file) => file.endsWith('.js'));
    const packages = new Set();
    for (const file of sourceFiles) {
      const code = fs.readFileSync(path.join(SERVER_ROOT, 'src', file), 'utf8');
      for (const [, specifier] of code.matchAll(/from '([^'.][^']*)'/g)) {
        if (!specifier.startsWith('node:')) packages.add(specifier);
      }
    }
    expect([...packages].sort()).toEqual(Object.keys(denoImports).sort());
    for (const name of packages) {
      expect(denoImports[name], name).toBe(`npm:${name}@${lock.packages[`node_modules/${name}`].version}`);
    }
  });

  it('server/src tidak memakai modul native (tidak berjalan di Edge Functions)', () => {
    expect(Object.keys(denoImports)).not.toContain('argon2');
    expect(lock.packages['node_modules/argon2']).toBeUndefined();
  });
});
