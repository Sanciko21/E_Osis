import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { LOCAL_PHOTO_PATTERN } from '../validators/candidate.validators.js';
import { Errors } from '../utils/errors.js';
import { logger, describeError } from '../utils/logger.js';

export const CANDIDATE_PHOTO_SUBDIR = 'candidates';

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

export async function saveCandidatePhoto(buffer, uploadsDir) {
  const type = detectImageType(buffer);
  if (!type) throw Errors.invalidImage();
  const directory = path.join(uploadsDir, CANDIDATE_PHOTO_SUBDIR);
  await fs.mkdir(directory, { recursive: true });
  // Nama file acak dari server: tidak ada input pengguna dalam path (aman dari path traversal).
  const fileName = `${crypto.randomUUID()}.${type.extension}`;
  await fs.writeFile(path.join(directory, fileName), buffer, { flag: 'wx' });
  return { url: `/uploads/${CANDIDATE_PHOTO_SUBDIR}/${fileName}`, contentType: type.contentType };
}

/** Menghapus foto lokal (hanya URL hasil upload milik aplikasi ini). Gagal hapus tidak fatal. */
export async function deleteLocalPhoto(url, uploadsDir) {
  if (!url || !LOCAL_PHOTO_PATTERN.test(url)) return;
  const fileName = path.basename(url);
  const filePath = path.join(uploadsDir, CANDIDATE_PHOTO_SUBDIR, fileName);
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') logger.warn('Gagal menghapus file foto lama', describeError(error));
  }
}
