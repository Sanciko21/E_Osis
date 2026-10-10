import AOS from 'aos';
import 'aos/dist/aos.css';
import { prefersReducedMotion } from '../utils/motion.js';

/**
 * AOS v2.3.4 tidak menyediakan API destroy: init() memasang listener scroll/resize di
 * window dan sebuah MutationObserver secara permanen. Karena itu AOS diinisialisasi
 * SEKALI saja per halaman (singleton) — bukan di setiap render/mount — sehingga tidak
 * ada listener ganda yang bocor. MutationObserver bawaan AOS otomatis mendeteksi
 * elemen [data-aos] baru saat route berganti.
 */
let state = 'idle'; // 'idle' | 'running' | 'disabled'

export function initAos() {
  if (state !== 'idle' || typeof window === 'undefined') return state;
  if (prefersReducedMotion()) {
    state = 'disabled';
    return state;
  }
  AOS.init({ once: true, duration: 600, easing: 'ease-out-cubic', offset: 48, delay: 0 });
  // Penanda untuk CSS: tanpa kelas ini, [data-aos] selalu terlihat (fallback aman).
  document.documentElement.classList.add('aos-ready');
  state = 'running';
  return state;
}

/** Hitung ulang posisi elemen (mis. setelah konten selesai dimuat). */
export function refreshAos() {
  if (state === 'running') AOS.refresh();
}

/** Hanya untuk pengujian. */
export function getAosState() {
  return state;
}
