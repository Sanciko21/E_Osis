import '@testing-library/jest-dom/vitest';
import 'vitest-canvas-mock';
import { cleanup } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import Swal from 'sweetalert2/dist/sweetalert2.esm.js';
import { afterEach, beforeEach } from 'vitest';
import { setReducedMotion } from './motion.js';

/* ---- API browser yang tidak tersedia di jsdom ---- */

if (!window.HTMLDialogElement.prototype.showModal) {
  window.HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  window.HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Animasi "muncul saat di-scroll" (Motion whileInView): di jsdom setiap elemen dianggap langsung
// terlihat, dan seluruh animasi Motion diselesaikan seketika agar tes tidak bergantung waktu.
globalThis.IntersectionObserver ??= class {
  constructor(callback) {
    this.callback = callback;
  }
  observe(target) {
    this.callback([{ target, isIntersecting: true, intersectionRatio: 1 }], this);
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
};
MotionGlobalConfig.skipAnimations = true;

// jsdom belum mengimplementasikan innerText; SweetAlert2 memakainya untuk `titleText`.
if (!('innerText' in window.HTMLElement.prototype)) {
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
    configurable: true,
    get() {
      return this.textContent;
    },
    set(value) {
      this.textContent = value;
    },
  });
}

window.Element.prototype.scrollIntoView ??= function scrollIntoView() {};
window.scrollTo = () => {};
globalThis.requestAnimationFrame ??= (callback) => setTimeout(() => callback(Date.now()), 0);
globalThis.cancelAnimationFrame ??= (id) => clearTimeout(id);
URL.createObjectURL ??= () => 'blob:mock';
URL.revokeObjectURL ??= () => {};

beforeEach(() => {
  setReducedMotion(false);
});

afterEach(() => {
  cleanup();
  Swal.close();
  document.querySelectorAll('.swal2-container').forEach((node) => node.remove());
  document.body.removeAttribute('class');
  document.body.removeAttribute('style');
});
