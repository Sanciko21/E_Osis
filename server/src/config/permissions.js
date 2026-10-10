/**
 * Peran dan izin administratif yang eksplisit.
 * Endpoint admin memeriksa IZIN (bukan nama peran) sehingga peran baru cukup
 * ditambahkan di sini tanpa mengubah route.
 */
export const ROLES = Object.freeze({
  ADMIN: 'admin', // Panitia pemilihan: mengelola pemilihan, jadwal, kandidat, publikasi hasil
  OBSERVER: 'observer', // Pengawas: hanya dapat melihat dashboard, hasil sementara, dan audit log
});

export const PERMISSIONS = Object.freeze({
  DASHBOARD_VIEW: 'dashboard:view',
  ELECTIONS_VIEW: 'elections:view',
  ELECTIONS_MANAGE: 'elections:manage',
  ELECTIONS_CHANGE_STATUS: 'elections:change-status',
  RESULTS_VIEW_INTERIM: 'results:view-interim',
  RESULTS_PUBLISH: 'results:publish',
  CANDIDATES_MANAGE: 'candidates:manage',
  AUDIT_VIEW: 'audit:view',
});

const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.ADMIN]: Object.freeze(Object.values(PERMISSIONS)),
  [ROLES.OBSERVER]: Object.freeze([
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.ELECTIONS_VIEW,
    PERMISSIONS.RESULTS_VIEW_INTERIM,
    PERMISSIONS.AUDIT_VIEW,
  ]),
});

export function hasPermission(role, permission) {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function permissionsFor(role) {
  return [...(ROLE_PERMISSIONS[role] ?? [])];
}
