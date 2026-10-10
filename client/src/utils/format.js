const LOCALE = 'id-ID';

const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short',
});
const dateFormatter = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
const shortDateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const timeFormatter = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
const clockFormatter = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });
const numberFormatter = new Intl.NumberFormat(LOCALE);
const percentFormatter = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 0, maximumFractionDigits: 1 });

const valid = (value) => value !== null && value !== undefined && !Number.isNaN(new Date(value).getTime());

export const formatDateTime = (value) => (valid(value) ? dateTimeFormatter.format(new Date(value)) : '—');
export const formatDate = (value) => (valid(value) ? dateFormatter.format(new Date(value)) : '—');
export const formatShortDateTime = (value) => (valid(value) ? shortDateTimeFormatter.format(new Date(value)) : '—');
export const formatTime = (value) => (valid(value) ? timeFormatter.format(new Date(value)) : '—');
export const formatClock = (value) => (valid(value) ? clockFormatter.format(new Date(value)) : '—');
export const formatNumber = (value) => (Number.isFinite(value) ? numberFormatter.format(value) : '—');
export const formatPercent = (value) => (Number.isFinite(value) ? `${percentFormatter.format(value)}%` : '—');

/** Rentang jadwal ringkas: "9 Oktober 2026, 07.30–12.00 WIB" atau "9 Okt 2026 07.30 — 10 Okt 2026 12.00". */
export function formatDateRange(start, end) {
  if (!valid(start) || !valid(end)) return '—';
  const from = new Date(start);
  const to = new Date(end);
  if (dateFormatter.format(from) === dateFormatter.format(to)) {
    return `${dateFormatter.format(from)}, ${clockFormatter.format(from)}–${timeFormatter.format(to)}`;
  }
  return `${shortDateTimeFormatter.format(from)} — ${shortDateTimeFormatter.format(to)}`;
}

/** Durasi singkat dalam Bahasa Indonesia, mis. "2 hari 3 jam" atau "45 menit". */
export function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return 'sebentar lagi';
  const minutes = Math.floor(milliseconds / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours > 0 ? `${days} hari ${hours} jam` : `${days} hari`;
  if (hours > 0) return mins > 0 ? `${hours} jam ${mins} menit` : `${hours} jam`;
  return mins > 0 ? `${mins} menit` : 'kurang dari 1 menit';
}

/** Nilai untuk <input type="datetime-local"> dalam zona waktu perangkat. */
export function toDateTimeLocalValue(value) {
  if (!valid(value)) return '';
  const date = new Date(value);
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Mengubah nilai datetime-local (waktu lokal perangkat) menjadi ISO-8601 UTC. */
export function fromDateTimeLocalValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Nama zona waktu perangkat untuk keterangan formulir (mis. "Asia/Jakarta"). */
export function deviceTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'zona waktu perangkat';
}
