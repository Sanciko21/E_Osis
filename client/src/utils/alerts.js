/**
 * Helper SweetAlert2 yang dipakai ulang di seluruh aplikasi.
 *
 * Keamanan: judul memakai `titleText` dan isi memakai `text` atau elemen DOM yang
 * dibangun dengan textContent — data dari server (mis. nama kandidat) tidak pernah
 * disisipkan sebagai HTML mentah.
 *
 * Build ESM tanpa injeksi CSS dipakai agar stylesheet ikut di-bundle Vite (ramah CSP).
 */
import Swal from 'sweetalert2/dist/sweetalert2.esm.js';
import 'sweetalert2/dist/sweetalert2.css';
import { formatCandidateNumber } from './election.js';
import { formatDateTime } from './format.js';
import { prefersReducedMotion } from './motion.js';
import { sanitizeNisnInput, validateNisn } from './nisn.js';

/**
 * Saat "kurangi animasi" aktif, animasi popup/ikon dimatikan. Kelas backdrop tetap
 * dipertahankan karena kelas itulah yang memberi warna latar gelap di belakang dialog.
 */
function motionOptions() {
  return prefersReducedMotion()
    ? {
        showClass: { popup: '', backdrop: 'swal2-backdrop-show', icon: '' },
        hideClass: { popup: '', backdrop: 'swal2-backdrop-hide', icon: '' },
      }
    : {};
}

const dialog = Swal.mixin({
  buttonsStyling: false,
  reverseButtons: true,
  heightAuto: false,
  returnFocus: true,
  customClass: {
    popup: 'swal-eosis',
    title: 'swal-eosis__title',
    htmlContainer: 'swal-eosis__body',
    actions: 'swal-eosis__actions',
    confirmButton: 'btn btn--primary',
    cancelButton: 'btn btn--ghost',
    denyButton: 'btn btn--danger',
  },
});

const toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3200,
  timerProgressBar: true,
  customClass: { popup: 'swal-eosis-toast' },
});

function fire(options) {
  return dialog.fire({ ...motionOptions(), ...options });
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function candidateSummary(candidate) {
  const wrapper = element('div', 'swal-candidate');
  const number = element('div', 'swal-candidate__number');
  number.append(element('span', 'swal-candidate__number-label', 'Nomor urut'));
  number.append(element('strong', 'swal-candidate__number-value', formatCandidateNumber(candidate.candidateNumber)));
  const names = element('dl', 'swal-candidate__names');
  names.append(element('dt', null, 'Ketua'), element('dd', null, candidate.chairpersonName));
  names.append(element('dt', null, 'Wakil Ketua'), element('dd', null, candidate.viceChairpersonName));
  wrapper.append(number, names);
  return wrapper;
}

/* ------------------------------------------------------------------ Voting */

/**
 * Langkah pertama memilih langsung dari kartu pasangan calon: meminta NISN.
 * Mengembalikan NISN 10 digit, atau null bila dibatalkan. Format dicek di dialog
 * (spasi yang terketik dibuang); keputusan akhir tetap di server.
 */
export async function promptNisn(candidate) {
  const content = element('div', 'swal-vote');
  content.append(element('p', 'swal-vote__lead', 'Pasangan calon yang kamu pilih:'));
  content.append(candidateSummary(candidate));
  content.append(element('p', 'swal-vote__note', 'NISN hanya dipakai untuk memastikan satu siswa memilih satu kali.'));
  const result = await fire({
    titleText: 'Masukkan NISN-mu',
    html: content,
    input: 'text',
    inputLabel: 'Nomor Induk Siswa Nasional (NISN)',
    inputPlaceholder: '10 digit angka',
    inputAttributes: { inputmode: 'numeric', autocomplete: 'off', spellcheck: 'false' },
    showCancelButton: true,
    confirmButtonText: 'Lanjut',
    cancelButtonText: 'Batal',
    allowOutsideClick: false,
    didOpen: () => {
      const input = Swal.getInput();
      input?.addEventListener('input', () => {
        input.value = sanitizeNisnInput(input.value);
      });
    },
    inputValidator: (value) => validateNisn(sanitizeNisnInput(value)) ?? undefined,
  });
  return result.isConfirmed ? sanitizeNisnInput(result.value) : null;
}

/**
 * Konfirmasi sebelum mengirim suara. Mengembalikan true HANYA jika tombol
 * "Ya, Saya Yakin" ditekan. Tombol "Kembali" difokuskan lebih dulu agar Enter
 * tidak langsung mengirim suara secara tidak sengaja.
 */
export async function confirmVote(candidate) {
  const content = element('div', 'swal-vote');
  content.append(element('p', 'swal-vote__lead', 'Kamu akan memilih pasangan calon berikut:'));
  content.append(candidateSummary(candidate));
  content.append(element('p', 'swal-vote__note', 'Pilihan yang sudah dikirim tidak dapat diubah.'));
  const result = await fire({
    icon: 'question',
    titleText: 'Yakin dengan pilihanmu?',
    html: content,
    showCancelButton: true,
    confirmButtonText: 'Ya, Saya Yakin',
    cancelButtonText: 'Kembali',
    focusCancel: true,
    allowOutsideClick: false,
  });
  return result.isConfirmed === true;
}

/** Dialog proses (tidak bisa ditutup) selama suara dikirim ke server. */
export function showVoteProcessing() {
  fire({
    titleText: 'Menyimpan suaramu…',
    text: 'Mohon tunggu dan jangan menutup halaman ini.',
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => Swal.showLoading(),
  });
}

export function showVoteSuccess() {
  return fire({
    icon: 'success',
    titleText: 'Suara berhasil disimpan!',
    text: 'Terima kasih telah menggunakan hak pilihmu. Pilihanmu tersimpan secara rahasia.',
    confirmButtonText: 'Selesai',
  });
}

export function showAlreadyVoted() {
  return fire({
    icon: 'warning',
    titleText: 'NISN ini sudah digunakan untuk memilih!',
    text: 'Setiap NISN hanya dapat memilih satu kali. Jika kamu merasa belum pernah memilih, segera hubungi panitia pemilihan.',
    confirmButtonText: 'Mengerti',
  });
}

export function showElectionNotStarted(startAt) {
  return fire({
    icon: 'info',
    titleText: 'Pemungutan suara belum dimulai',
    text: startAt
      ? `Pemungutan suara dibuka pada ${formatDateTime(startAt)}. Silakan kembali sesuai jadwal.`
      : 'Silakan kembali sesuai jadwal yang diumumkan panitia.',
    confirmButtonText: 'Mengerti',
  });
}

export function showElectionEnded() {
  return fire({
    icon: 'info',
    titleText: 'Pemungutan suara sudah berakhir',
    text: 'Waktu memilih telah habis sehingga suara tidak dapat dikirim lagi.',
    confirmButtonText: 'Mengerti',
  });
}

/** Server memastikan transaksi dibatalkan: suara pasti BELUM tersimpan. */
export function showVoteNotRecorded() {
  return fire({
    icon: 'error',
    titleText: 'Suara belum tersimpan',
    text: 'Terjadi gangguan pada server dan suaramu belum tercatat. Silakan coba kirim lagi.',
    confirmButtonText: 'Coba Lagi',
  });
}

/**
 * Hasil transaksi tidak diketahui (timeout/koneksi putus/respons tidak jelas).
 * Pesan sengaja TIDAK mengklaim berhasil maupun gagal.
 */
export function showVoteStatusUnknown() {
  const content = element('div', 'swal-vote');
  content.append(
    element(
      'p',
      null,
      'Koneksi terputus sebelum server memberi jawaban, jadi kami belum dapat memastikan apakah suaramu sudah tersimpan.',
    ),
  );
  const list = element('ul', 'swal-list');
  list.append(
    element('li', null, 'Kirim ulang pilihanmu satu kali lagi. Sistem tetap menolak suara ganda.'),
    element('li', null, 'Jika muncul pesan "NISN ini sudah digunakan untuk memilih!", berarti suaramu sudah tercatat.'),
    element('li', null, 'Jika masih ragu, hubungi panitia pemilihan.'),
  );
  content.append(list);
  return fire({ icon: 'warning', titleText: 'Status suara belum dapat dipastikan', html: content, confirmButtonText: 'Mengerti' });
}

/**
 * Dialog yang sesuai untuk suara yang gagal dikirim dari kartu pasangan calon.
 * Mengembalikan true bila data pemilihan perlu dimuat ulang (jadwal/kandidat berubah).
 */
export async function showVoteFailure(problem, { startAt } = {}) {
  switch (problem?.code) {
    case 'ALREADY_VOTED':
      await showAlreadyVoted();
      return false;
    case 'ELECTION_NOT_STARTED':
      await showElectionNotStarted(startAt);
      return true;
    case 'ELECTION_ENDED':
      await showElectionEnded();
      return true;
    case 'INVALID_CANDIDATE':
      await showApiError(problem, 'Pasangan calon tidak valid');
      return true;
    case 'VALIDATION_ERROR':
      await showApiError(problem, 'Data belum valid');
      return false;
    case 'VOTE_NOT_RECORDED':
      await showVoteNotRecorded();
      return false;
    default:
      if (problem?.outcomeUnknown) await showVoteStatusUnknown();
      else await showApiError(problem, 'Suara tidak dapat dikirim');
      return false;
  }
}

/* ------------------------------------------------------------------- Umum */

/** Pesan error jaringan / server / database yang mudah dipahami. */
export function showApiError(error, titleText = 'Terjadi kesalahan') {
  let text = error?.message || 'Terjadi kesalahan yang tidak terduga.';
  if (error?.kind === 'network') text = 'Tidak dapat terhubung ke server. Periksa koneksi internet lalu coba lagi.';
  else if (error?.kind === 'timeout') text = 'Server terlalu lama merespons. Silakan coba lagi.';
  else if (error?.status >= 500) text = 'Server atau database sedang mengalami gangguan. Silakan coba beberapa saat lagi.';
  const footer = error?.requestId ? `Kode referensi: ${error.requestId}` : undefined;
  return fire({ icon: 'error', titleText, text, confirmButtonText: 'Tutup', ...(footer ? { footer: element('small', null, footer) } : {}) });
}

export function showSuccessToast(message) {
  return toast.fire({ ...motionOptions(), icon: 'success', titleText: message });
}

/* -------------------------------------------------------------- Admin auth */

export function showLoginSuccess(name) {
  return toast.fire({ ...motionOptions(), icon: 'success', titleText: `Login berhasil. Selamat datang, ${name}!` });
}

export function showLoginFailed(message = 'Email atau kata sandi salah.') {
  return fire({ icon: 'error', titleText: 'Login gagal', text: message, confirmButtonText: 'Coba Lagi' });
}

export function showSessionExpired() {
  return fire({
    icon: 'info',
    titleText: 'Sesi berakhir',
    text: 'Sesi admin Anda telah berakhir. Silakan login kembali.',
    confirmButtonText: 'Login',
  });
}

/* ------------------------------------------------------ Admin konfirmasi */

async function confirmAction({ icon = 'warning', titleText, content, confirmButtonText, danger = false }) {
  const result = await fire({
    icon,
    titleText,
    html: content,
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText: 'Batal',
    focusCancel: true,
    customClass: {
      popup: 'swal-eosis',
      title: 'swal-eosis__title',
      htmlContainer: 'swal-eosis__body',
      actions: 'swal-eosis__actions',
      confirmButton: danger ? 'btn btn--danger' : 'btn btn--primary',
      cancelButton: 'btn btn--ghost',
    },
  });
  return result.isConfirmed === true;
}

export function confirmDeleteCandidate(candidate) {
  const content = element('div', 'swal-vote');
  content.append(element('p', null, 'Pasangan calon berikut akan dihapus permanen:'));
  content.append(candidateSummary(candidate));
  return confirmAction({ titleText: 'Hapus pasangan calon?', content, confirmButtonText: 'Ya, Hapus', danger: true });
}

export function confirmOpenElection(election) {
  const content = element('div', 'swal-vote');
  content.append(element('p', null, `"${election.title}" akan dibuka untuk pemungutan suara.`));
  content.append(
    element(
      'p',
      'swal-vote__note',
      `Siswa dapat memilih mulai ${formatDateTime(election.startAt)} hingga ${formatDateTime(election.endAt)}. ` +
        'Setelah dibuka, data pasangan calon dan waktu mulai dikunci.',
    ),
  );
  return confirmAction({ icon: 'question', titleText: 'Buka pemungutan suara?', content, confirmButtonText: 'Ya, Buka' });
}

export function confirmCloseElection(election) {
  const content = element('div', 'swal-vote');
  content.append(element('p', null, `"${election.title}" akan ditutup permanen.`));
  content.append(element('p', 'swal-vote__note', 'Setelah ditutup, siswa tidak dapat memilih lagi dan pemilihan tidak dapat dibuka kembali.'));
  return confirmAction({ titleText: 'Tutup pemilihan?', content, confirmButtonText: 'Ya, Tutup', danger: true });
}

export function confirmScheduleElection(election) {
  const content = element('div', 'swal-vote');
  content.append(element('p', null, `"${election.title}" akan diumumkan di halaman publik.`));
  content.append(element('p', 'swal-vote__note', 'Pemungutan suara belum dibuka sampai panitia menekan "Buka Pemungutan Suara".'));
  return confirmAction({ icon: 'question', titleText: 'Umumkan jadwal pemilihan?', content, confirmButtonText: 'Ya, Umumkan' });
}

export function confirmUnscheduleElection(election) {
  const content = element('div', 'swal-vote');
  content.append(element('p', null, `"${election.title}" akan dikembalikan menjadi draf dan disembunyikan dari publik.`));
  return confirmAction({ icon: 'question', titleText: 'Kembalikan ke draf?', content, confirmButtonText: 'Ya, Jadikan Draf' });
}

export function confirmDeleteElection(election) {
  const content = element('div', 'swal-vote');
  content.append(element('p', null, `"${election.title}" beserta seluruh pasangan calonnya akan dihapus permanen.`));
  return confirmAction({ titleText: 'Hapus pemilihan?', content, confirmButtonText: 'Ya, Hapus', danger: true });
}

export function confirmResultsVisibility(election, makePublic) {
  const content = element('div', 'swal-vote');
  content.append(
    element(
      'p',
      null,
      makePublic
        ? `Hasil "${election.title}" akan dapat dilihat publik setelah pemilihan selesai.`
        : `Hasil "${election.title}" akan disembunyikan dari halaman publik.`,
    ),
  );
  return confirmAction({
    icon: 'question',
    titleText: makePublic ? 'Publikasikan hasil?' : 'Sembunyikan hasil?',
    content,
    confirmButtonText: makePublic ? 'Ya, Publikasikan' : 'Ya, Sembunyikan',
  });
}

export function closeAlerts() {
  Swal.close();
}
