import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getConfig } from '../config/env.js';
import { LOCAL_PHOTO_PATTERN } from '../validators/candidate.validators.js';
import { AppError, Errors } from '../utils/errors.js';
import { logger, describeError } from '../utils/logger.js';

export const CANDIDATE_PHOTO_SUBDIR = 'candidates';
const STORED_FILE_NAME = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;
const STORAGE_TIMEOUT_MS = 15_000;

/** Jenis gambar dideteksi dari "magic bytes" isi file — bukan dari nama/ekstensi/MIME klien. */
const IMAGE_SIGNATURES = Object.freeze([
  { contentType: 'image/jpeg', extension: 'jpg', matches: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    contentType: 'image/png',
    extension: 'png',
    matches: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    contentType: 'image/webp',
    extension: 'webp',
    matches: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  },
]);

export function detectImageType(buffer) {
  return IMAGE_SIGNATURES.find((signature) => signature.matches(buffer)) ?? null;
}

/* ---------------------------------------------- Supabase Storage (Edge Functions) */

/** Header otorisasi Storage API: kunci baru (sb_secret_…) cukup di "apikey"; kunci lama (JWT) juga di Bearer. */
function storageHeaders(storage, extra = {}) {
  const headers = { apikey: storage.serverKey, ...extra };
  if (storage.serverKey.startsWith('eyJ')) headers.Authorization = `Bearer ${storage.serverKey}`;
  return headers;
}

function publicPhotoPrefix(storage) {
  return `${storage.supabaseUrl}/storage/v1/object/public/${storage.bucket}/${CANDIDATE_PHOTO_SUBDIR}/`;
}

async function uploadToSupabase(storage, fileName, buffer, contentType) {
  const objectPath = `${CANDIDATE_PHOTO_SUBDIR}/${fileName}`;
  let response;
  try {
    response = await fetch(`${storage.supabaseUrl}/storage/v1/object/${storage.bucket}/${objectPath}`, {
      method: 'POST',
      headers: storageHeaders(storage, { 'Content-Type': contentType, 'Cache-Control': 'max-age=86400', 'x-upsert': 'false' }),
      body: buffer,
      signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS),
    });
  } catch (error) {
    throw new AppError(502, 'PHOTO_STORAGE_FAILED', 'Foto gagal diunggah ke penyimpanan. Coba lagi.', { cause: error });
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    logger.error('Upload foto ke Supabase Storage gagal', { status: response.status, bucket: storage.bucket, detail });
    throw new AppError(502, 'PHOTO_STORAGE_FAILED', 'Foto gagal diunggah ke penyimpanan. Coba lagi.');
  }
  return `${publicPhotoPrefix(storage)}${fileName}`;
}

async function deleteFromSupabase(storage, fileName) {
  try {
    const response = await fetch(`${storage.supabaseUrl}/storage/v1/object/${storage.bucket}`, {
      method: 'DELETE',
      headers: storageHeaders(storage, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefixes: [`${CANDIDATE_PHOTO_SUBDIR}/${fileName}`] }),
      signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS),
    });
    if (!response.ok) logger.warn('Gagal menghapus foto lama di Supabase Storage', { status: response.status });
  } catch (error) {
    logger.warn('Gagal menghapus foto lama di Supabase Storage', describeError(error));
  }
}

/* ------------------------------------------------------------------ API modul */

/**
 * Menyimpan foto kandidat ke penyimpanan aktif (PHOTO_STORAGE): folder lokal UPLOAD_DIR atau
 * Supabase Storage. Mengembalikan URL yang disimpan di kolom photo_url.
 */
export async function saveCandidatePhoto(buffer, uploadsDir) {
  const type = detectImageType(buffer);
  if (!type) throw Errors.invalidImage();
  // Nama file acak dari server: tidak ada input pengguna dalam path (aman dari path traversal).
  const fileName = `${crypto.randomUUID()}.${type.extension}`;
  const storage = getConfig().uploads.storage;
  if (storage.driver === 'supabase') {
    return { url: await uploadToSupabase(storage, fileName, buffer, type.contentType), contentType: type.contentType };
  }
  const directory = path.join(uploadsDir, CANDIDATE_PHOTO_SUBDIR);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, fileName), buffer, { flag: 'wx' });
  return { url: `/uploads/${CANDIDATE_PHOTO_SUBDIR}/${fileName}`, contentType: type.contentType };
}

/**
 * Menghapus foto hasil upload aplikasi ini (folder lokal atau bucket Supabase milik aplikasi).
 * URL eksternal lain tidak pernah disentuh. Gagal hapus tidak fatal.
 */
export async function deleteLocalPhoto(url, uploadsDir) {
  if (!url) return;
  const storage = getConfig().uploads.storage;
  if (storage.driver === 'supabase' && url.startsWith(publicPhotoPrefix(storage))) {
    const fileName = url.slice(publicPhotoPrefix(storage).length);
    if (STORED_FILE_NAME.test(fileName)) await deleteFromSupabase(storage, fileName);
    return;
  }
  if (!LOCAL_PHOTO_PATTERN.test(url)) return;
  const fileName = path.basename(url);
  const filePath = path.join(uploadsDir, CANDIDATE_PHOTO_SUBDIR, fileName);
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') logger.warn('Gagal menghapus file foto lama', describeError(error));
  }
}
