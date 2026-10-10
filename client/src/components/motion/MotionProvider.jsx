import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';

/**
 * Motion for React dimuat ringan: LazyMotion + fitur domAnimation (animasi, hover/tap, inView,
 * exit) dengan komponen `m`. `strict` mencegah komponen `motion.*` penuh ikut ter-bundle.
 * reducedMotion="user" mematikan animasi transform bila pengguna memilih "kurangi animasi".
 */
export default function MotionProvider({ children }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
