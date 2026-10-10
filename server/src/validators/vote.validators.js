import { z } from 'zod';
import { createNisnValidator, normalizeNisn } from '../utils/nisn.js';
import { uuid } from './common.js';

/**
 * Body voting hanya boleh berisi NISN dan ID kandidat. Field lain (mis. jumlah suara,
 * status, hasil) ditolak — backend tidak pernah mempercayai data seperti itu dari klien.
 */
export function createVoteSchema(nisnPattern) {
  const isValidNisn = createNisnValidator(nisnPattern);
  return z.strictObject({
    nisn: z
      .string({ error: 'NISN wajib diisi.' })
      .transform(normalizeNisn)
      // abort: berhenti pada aturan pertama yang gagal agar pesan error tidak menumpuk.
      .refine((value) => value.length > 0, { error: 'NISN wajib diisi.', abort: true })
      .refine((value) => /^[0-9]+$/.test(value), { error: 'NISN hanya boleh berisi angka.', abort: true })
      .refine((value) => value.length === 10, { error: 'NISN harus terdiri dari 10 digit.', abort: true })
      .refine(isValidNisn, { error: 'NISN tidak sesuai ketentuan sekolah.', abort: true }),
    candidateId: uuid('Pasangan calon tidak valid.'),
  });
}
