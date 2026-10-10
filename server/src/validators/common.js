import { z } from 'zod';
import { stripControlChars } from '../utils/sanitize.js';

// Pesan validasi bawaan dalam Bahasa Indonesia.
z.config(z.locales.id());

/** UUID (dinormalisasi huruf kecil, sesuai format yang disimpan database). */
export const uuid = (message = 'ID tidak valid.') => z.uuid({ error: message }).transform((value) => value.toLowerCase());

/** Teks satu baris: dipangkas, karakter kontrol dihapus, panjang dibatasi. */
export const singleLine = (label, min, max) =>
  z
    .string({ error: `${label} wajib diisi.` })
    .transform((value) => stripControlChars(value).replace(/\s+/g, ' ').trim())
    .pipe(
      z
        .string()
        .min(min, { error: `${label} minimal ${min} karakter.` })
        .max(max, { error: `${label} maksimal ${max} karakter.` }),
    );

/** Teks panjang (boleh multi-baris). */
export const multiLine = (label, min, max) =>
  z
    .string({ error: `${label} wajib diisi.` })
    .transform((value) => stripControlChars(value, { multiline: true }).trim())
    .pipe(
      z
        .string()
        .min(min, { error: `${label} minimal ${min} karakter.` })
        .max(max, { error: `${label} maksimal ${max} karakter.` }),
    );

/** Waktu ISO-8601 dengan zona waktu eksplisit (mis. 2026-10-20T07:30:00+07:00 atau ...Z). */
export const isoDateTime = (label) =>
  z.iso
    .datetime({ offset: true, error: `${label} harus berupa tanggal & waktu yang valid.` })
    .transform((value) => new Date(value));

export const paginationQuery = (defaultSize = 20, maxSize = 100) => ({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(maxSize).default(defaultSize),
});

export const idParams = z.object({ id: uuid() });

/** Mengubah error zod menjadi daftar { field, message } yang mudah ditampilkan. */
export function toFieldErrors(error) {
  return error.issues.map((issue) => ({
    field: issue.path.length ? issue.path.join('.') : null,
    message: issue.message,
  }));
}
