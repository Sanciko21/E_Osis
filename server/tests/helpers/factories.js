import crypto from 'node:crypto';
import { hashPassword } from '../../src/utils/security.js';
import { sql } from './db.js';

const HOUR = 60 * 60 * 1000;
export const TEST_PASSWORD = 'PasswordUji2026';

export async function createElection(overrides = {}) {
  const now = Date.now();
  const election = {
    id: crypto.randomUUID(),
    title: 'Pemilihan Ketua OSIS Uji',
    description: 'Pemilihan untuk pengujian otomatis.',
    status: 'active',
    startAt: new Date(now - HOUR),
    endAt: new Date(now + HOUR),
    resultsPublic: false,
    eligibleVoterCount: null,
    ...overrides,
  };
  await sql(
    `INSERT INTO elections (id, title, description, start_at, end_at, status, results_public, eligible_voter_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      election.id,
      election.title,
      election.description,
      election.startAt,
      election.endAt,
      election.status,
      election.resultsPublic,
      election.eligibleVoterCount,
    ],
  );
  return election;
}

export async function createCandidate(electionId, candidateNumber, overrides = {}) {
  const candidate = {
    id: crypto.randomUUID(),
    electionId,
    candidateNumber,
    chairpersonName: `Ketua Nomor ${candidateNumber}`,
    viceChairpersonName: `Wakil Nomor ${candidateNumber}`,
    photoUrl: null,
    vision: 'Visi pasangan calon untuk pengujian.',
    mission: 'Misi pertama pengujian.\nMisi kedua pengujian.',
    ...overrides,
  };
  await sql(
    `INSERT INTO candidates (id, election_id, candidate_number, chairperson_name, vice_chairperson_name, photo_url, vision, mission)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      candidate.id,
      electionId,
      candidateNumber,
      candidate.chairpersonName,
      candidate.viceChairpersonName,
      candidate.photoUrl,
      candidate.vision,
      candidate.mission,
    ],
  );
  return candidate;
}

/** Pemilihan aktif lengkap dengan beberapa pasangan calon. */
export async function createOpenElection({ candidates = 2, ...overrides } = {}) {
  const election = await createElection(overrides);
  const list = [];
  for (let number = 1; number <= candidates; number += 1) list.push(await createCandidate(election.id, number));
  return { election, candidates: list };
}

const hashCache = new Map();
export async function createAdmin({ role = 'admin', email, password = TEST_PASSWORD, isActive = true } = {}) {
  if (!hashCache.has(password)) hashCache.set(password, await hashPassword(password));
  const admin = {
    id: crypto.randomUUID(),
    name: role === 'admin' ? 'Admin Uji' : 'Pengawas Uji',
    email: email ?? `${role}-${crypto.randomUUID().slice(0, 8)}@sekolah.test`,
    role,
    password,
  };
  await sql('INSERT INTO admin_users (id, name, email, password_hash, role, is_active) VALUES ($1, $2, $3, $4, $5, $6)', [
    admin.id,
    admin.name,
    admin.email,
    hashCache.get(password),
    role,
    isActive,
  ]);
  return admin;
}

let nisnCounter = 0;
/** NISN unik untuk tes; sengaja diawali "00" untuk menguji angka nol di depan. */
export function nextNisn() {
  nisnCounter += 1;
  return `00${String(process.pid % 1000).padStart(3, '0')}${String(nisnCounter).padStart(5, '0')}`;
}
