import { gsap } from "gsap";
import { useLayoutEffect, useRef } from "react";
import { prefersReducedMotion } from "../../utils/motion.js";
import Icon from "./Icon.jsx";

/**
 * Angka statistik dengan animasi hitung naik (GSAP) saat dashboard dimuat/diperbarui.
 * Teks animasi diisi langsung lewat ref (React tidak mengelola isinya) dan disembunyikan
 * dari pembaca layar; nilai akhir selalu tersedia di teks sr-only.
 */
export function AnimatedNumber({ value, format }) {
  const ref = useRef(null);
  const displayed = useRef(0);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (!Number.isFinite(value)) {
      node.textContent = "—";
      return undefined;
    }
    if (prefersReducedMotion()) {
      node.textContent = format(value);
      displayed.current = value;
      return undefined;
    }
    const counter = { current: displayed.current };
    const context = gsap.context(() => {
      gsap.to(counter, {
        current: value,
        duration: 0.9,
        ease: "power2.out",
        onUpdate: () => {
          displayed.current = counter.current;
          node.textContent = format(Math.round(counter.current));
        },
        onComplete: () => {
          displayed.current = value;
          node.textContent = format(value);
        },
      });
    });
    return () => {
      context.revert();
      node.textContent = format(value);
    };
  }, [value, format]);

  return (
    <>
      <span ref={ref} aria-hidden="true" className="stat__value-anim" />
      <span className="sr-only">
        {Number.isFinite(value) ? format(value) : "tidak tersedia"}
      </span>
    </>
  );
}

export default function StatCard({
  icon,
  label,
  value,
  format,
  suffix,
  note,
  tone = "default",
}) {
  return (
    <div className={`stat stat--${tone}`}>
      <div className="stat__head">
        <span className="stat__icon" aria-hidden="true">
          <Icon name={icon} size={20} />
        </span>
        <span className="stat__label">{label}</span>
      </div>
      <p className="stat__value">
        <AnimatedNumber value={value} format={format} />
        {suffix && <span className="stat__suffix">{suffix}</span>}
      </p>
      {note && <p className="stat__note">{note}</p>}
    </div>
  );
}
