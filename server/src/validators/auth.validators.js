import { z } from 'zod';

export const loginSchema = z.strictObject({
  email: z
    .string({ error: 'Email wajib diisi.' })
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'Format email tidak valid.' }).max(191)),
  password: z
    .string({ error: 'Kata sandi wajib diisi.' })
    .min(1, { error: 'Kata sandi wajib diisi.' })
    .max(200, { error: 'Kata sandi terlalu panjang.' }),
});
