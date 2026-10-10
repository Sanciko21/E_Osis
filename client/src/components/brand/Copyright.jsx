/** Pemegang hak cipta aplikasi — satu sumber untuk beranda dan footer. */
export const COPYRIGHT_HOLDER = 'PTI AM 2026 UNDIKSHA';

export default function Copyright({ className = '' }) {
  return (
    <p className={`copyright ${className}`.trim()}>
      <span aria-hidden="true">©</span>
      <span className="sr-only">Hak cipta</span> {COPYRIGHT_HOLDER}
    </p>
  );
}
