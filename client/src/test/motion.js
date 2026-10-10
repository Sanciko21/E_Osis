/** matchMedia tiruan yang bisa diatur dari tes (mis. mensimulasikan prefers-reduced-motion). */
let reducedMotion = false;

export function setReducedMotion(value) {
  reducedMotion = value;
}

window.matchMedia = (query) => ({
  matches: query.includes('prefers-reduced-motion: reduce') ? reducedMotion : false,
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return false;
  },
});
