import { z } from 'zod';
import { ELECTION_STATUSES } from '../utils/electionRules.js';
import { isoDateTime, multiLine, paginationQuery, singleLine } from './common.js';

const description = z.union([multiLine('Deskripsi', 0, 2000), z.null()]).transform((value) => value || null);
const eligibleVoterCount = z
  .number({ error: 'Jumlah siswa berhak pilih harus berupa angka.' })
  .int({ error: 'Jumlah siswa berhak pilih harus bilangan bulat.' })
  .min(1, { error: 'Jumlah siswa berhak pilih minimal 1.' })
  .max(100_000, { error: 'Jumlah siswa berhak pilih terlalu besar.' })
  .nullable();

const scheduleIsValid = (data) => !(data.startAt && data.endAt) || data.endAt > data.startAt;
const scheduleIssue = { path: ['endAt'], error: 'Waktu selesai harus setelah waktu mulai.' };

export const createElectionSchema = z
  .strictObject({
    title: singleLine('Judul pemilihan', 5, 150),
    description: description.optional(),
    startAt: isoDateTime('Waktu mulai'),
    endAt: isoDateTime('Waktu selesai'),
    eligibleVoterCount: eligibleVoterCount.optional(),
    resultsPublic: z.boolean().optional(),
  })
  .refine(scheduleIsValid, scheduleIssue);

export const updateElectionSchema = z
  .strictObject({
    title: singleLine('Judul pemilihan', 5, 150).optional(),
    description: description.optional(),
    startAt: isoDateTime('Waktu mulai').optional(),
    endAt: isoDateTime('Waktu selesai').optional(),
    eligibleVoterCount: eligibleVoterCount.optional(),
    resultsPublic: z.boolean().optional(),
    status: z.enum(ELECTION_STATUSES, { error: 'Status pemilihan tidak dikenal.' }).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { error: 'Tidak ada perubahan yang dikirim.' })
  .refine(scheduleIsValid, scheduleIssue);

export const listElectionsQuery = z.object({
  status: z.enum(ELECTION_STATUSES).optional(),
  ...paginationQuery(20, 100),
});
