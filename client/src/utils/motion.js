/** True bila pengguna meminta animasi dikurangi (pengaturan aksesibilitas OS/peramban). */
export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * Atribut AOS untuk sebuah elemen. Mengembalikan objek kosong bila animasi dikurangi,
 * sehingga elemen tidak pernah tersembunyi menunggu animasi.
 * Catatan: JANGAN memakai atribut ini pada elemen yang dianimasikan GSAP.
 */
export function aos(animation, { delay, duration, offset } = {}) {
  if (prefersReducedMotion()) return {};
  const attributes = { 'data-aos': animation };
  if (delay) attributes['data-aos-delay'] = String(delay);
  if (duration) attributes['data-aos-duration'] = String(duration);
  if (offset !== undefined) attributes['data-aos-offset'] = String(offset);
  return attributes;
}
