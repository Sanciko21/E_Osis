import { getPool } from '../config/database.js';
import { permissionsFor } from '../config/permissions.js';
import * as adminRepository from '../repositories/admin.repository.js';
import * as sessionRepository from '../repositories/session.repository.js';
import { Errors } from '../utils/errors.js';
import { TOKEN_FORMAT, getDummyPasswordHash, randomToken, sha256Hex, verifyPassword } from '../utils/security.js';
import { AUDIT_ACTIONS, recordAudit } from './audit.service.js';

/** Interval minimal pembaruan last_seen_at agar tidak menulis ke database di setiap request. */
const TOUCH_INTERVAL_SECONDS = 60;

export function toAuthUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, permissions: permissionsFor(user.role) };
}

/**
 * Login admin. Pesan kegagalan selalu sama (akun tidak ada / password salah / akun
 * nonaktif) dan verifikasi hash tetap dijalankan agar tidak bisa dipakai menebak email.
 */
export async function login({ email, password, userAgent, ip }, sessionConfig) {
  const pool = getPool();
  const admin = await adminRepository.findByEmailForLogin(pool, email);
  const passwordValid = await verifyPassword(admin?.passwordHash ?? (await getDummyPasswordHash()), password);

  if (!admin || !passwordValid || !admin.isActive) {
    const reason = !admin ? 'unknown_account' : !passwordValid ? 'invalid_password' : 'inactive_account';
    await recordAudit(pool, {
      actorId: admin?.id ?? null,
      action: AUDIT_ACTIONS.LOGIN_FAILED,
      entityType: 'admin_user',
      entityId: admin?.id ?? null,
      metadata: { reason, ip },
    });
    throw Errors.invalidCredentials();
  }

  const token = randomToken();
  const csrfToken = randomToken();
  await sessionRepository.insert(pool, {
    id: sha256Hex(token),
    adminUserId: admin.id,
    csrfToken,
    userAgent: userAgent ? String(userAgent).slice(0, 255) : null,
    absoluteHours: sessionConfig.absoluteHours,
  });
  await adminRepository.touchLastLogin(pool, admin.id);
  await recordAudit(pool, {
    actorId: admin.id,
    action: AUDIT_ACTIONS.LOGIN_SUCCESS,
    entityType: 'admin_user',
    entityId: admin.id,
    metadata: { ip },
  });
  return { token, csrfToken, user: toAuthUser(admin) };
}

/** Memvalidasi token cookie. Mengembalikan null jika tidak valid/kedaluwarsa. */
export async function resolveSession(token, sessionConfig) {
  if (typeof token !== 'string' || !TOKEN_FORMAT.test(token)) return null;
  const pool = getPool();
  const session = await sessionRepository.findValid(pool, sha256Hex(token), sessionConfig.idleMinutes);
  if (!session) return null;
  if (session.idleSeconds >= TOUCH_INTERVAL_SECONDS) await sessionRepository.touch(pool, session.sessionId);
  return { sessionId: session.sessionId, csrfToken: session.csrfToken, user: toAuthUser(session.user) };
}

/** Mencabut sesi milik token lama (dipakai saat login ulang dari peramban yang sama). */
export async function revokeSessionToken(token) {
  if (typeof token !== 'string' || !TOKEN_FORMAT.test(token)) return;
  await sessionRepository.remove(getPool(), sha256Hex(token));
}

export async function logout(auth, ip) {
  const pool = getPool();
  await sessionRepository.remove(pool, auth.sessionId);
  await recordAudit(pool, {
    actorId: auth.user.id,
    action: AUDIT_ACTIONS.LOGOUT,
    entityType: 'admin_user',
    entityId: auth.user.id,
    metadata: { ip },
  });
}

export async function purgeExpiredSessions(sessionConfig) {
  return sessionRepository.removeExpired(getPool(), sessionConfig.idleMinutes);
}
