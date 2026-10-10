import { prefersReducedMotion } from '../utils/motion.js';

/**
 * Preset animasi Motion for React (https://motion.dev) yang dipakai bersama di beranda.
 * Hanya opacity & transform yang dianimasikan sehingga tata letak tidak bergeser.
 */
const EASE_OUT = [0.22, 1, 0.36, 1];

/** Pembungkus daftar kartu: anak-anaknya muncul bergantian (stagger). */
export const staggerList = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

/** Fade-in + slide-up untuk tiap kartu di dalam staggerList. */
export const riseItem = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE_OUT } },
};

/** Kartu sedikit membesar saat masuk (kartu pasangan calon). */
export const popItem = {
  hidden: { opacity: 0, y: 32, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, ease: EASE_OUT } },
};

/** Hover lift & umpan balik tekan untuk kartu informasi (tombol .btn memakai :active di CSS). */
export const liftOnHover = { y: -6, transition: { duration: 0.25, ease: EASE_OUT } };
export const pressFeedback = { scale: 0.98 };

/** Panel dialog: muncul dari bawah dengan sedikit skala. */
export const dialogPanel = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.32, ease: EASE_OUT } },
};

/** Isi accordion FAQ: tinggi & opacity dianimasikan saat dibuka/ditutup. */
export const accordionBody = {
  collapsed: { height: 0, opacity: 0, transition: { duration: 0.25, ease: EASE_OUT } },
  open: { height: 'auto', opacity: 1, transition: { duration: 0.32, ease: EASE_OUT } },
};

/**
 * Props pemicu animasi saat elemen masuk viewport. Bila pengguna memilih "kurangi animasi",
 * elemen langsung tampil di keadaan akhir (tanpa menunggu scroll) sehingga konten tidak pernah
 * tersembunyi.
 */
export function revealOnScroll({ amount = 0.15 } = {}) {
  if (prefersReducedMotion()) return { initial: false, animate: 'show' };
  return { initial: 'hidden', whileInView: 'show', viewport: { once: true, amount } };
}
