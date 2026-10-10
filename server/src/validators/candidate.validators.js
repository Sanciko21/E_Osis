import { z } from 'zod';
import { multiLine, singleLine } from './common.js';

/** Foto lokal hasil upload, atau URL HTTPS eksternal. Skema lain (javascript:, data:, http:) ditolak. */
export const LOCAL_PHOTO_PATTERN = /^\/uploads\/candidates\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

const photoUrl = z
  .string()
  .trim()
  .max(500, { error: 'URL foto maksimal 500 karakter.' })
  .refine(
    (value) => {
      if (LOCAL_PHOTO_PATTERN.test(value)) return true;
      try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password;
      } catch {
        return false;
      }
    },
    { error: 'URL foto harus diawali https:// atau berasal dari upload.' },
  )
  .nullable();

const candidateNumber = z
  .number({ error: 'Nomor urut harus berupa angka.' })
  .int({ error: 'Nomor urut harus bilangan bulat.' })
  .min(1, { error: 'Nomor urut minimal 1.' })
  .max(99, { error: 'Nomor urut maksimal 99.' });

const fields = {
  candidateNumber,
  chairpersonName: singleLine('Nama Ketua', 3, 100),
  viceChairpersonName: singleLine('Nama Wakil Ketua', 3, 100),
  photoUrl: photoUrl.optional(),
  vision: multiLine('Visi', 10, 2000),
  mission: multiLine('Misi', 10, 5000),
};

export const createCandidateSchema = z.strictObject(fields);

export const updateCandidateSchema = z
  .strictObject({
    candidateNumber: fields.candidateNumber.optional(),
    chairpersonName: fields.chairpersonName.optional(),
    viceChairpersonName: fields.viceChairpersonName.optional(),
    photoUrl: fields.photoUrl,
    vision: fields.vision.optional(),
    mission: fields.mission.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { error: 'Tidak ada perubahan yang dikirim.' });
