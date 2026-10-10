import { m } from 'motion/react';
import { useEffect, useId, useRef } from 'react';
import { dialogPanel } from '../../lib/motionPresets.js';
import { prefersReducedMotion } from '../../utils/motion.js';
import Icon from './Icon.jsx';

/**
 * Dialog modal berbasis elemen <dialog> bawaan peramban: fokus terkunci di dalam dialog,
 * tombol Esc menutup, dan fokus dikembalikan ke elemen pemicu saat ditutup. Panel muncul dengan
 * transisi Motion (tanpa animasi bila pengguna memilih "kurangi animasi").
 */
export default function Dialog({ open, onClose, title, description, children, footer, size = 'md' }) {
  const ref = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (open && !node.open) {
      const trigger = document.activeElement;
      node.showModal();
      return () => {
        if (node.open) node.close();
        if (trigger instanceof HTMLElement) trigger.focus();
      };
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const handleCancel = (event) => {
      event.preventDefault();
      onCloseRef.current?.();
    };
    node.addEventListener('cancel', handleCancel);
    return () => node.removeEventListener('cancel', handleCancel);
  }, []);

  const closeOnBackdrop = (event) => {
    if (event.target === ref.current) onClose?.();
  };

  return (
    <dialog
      ref={ref}
      className={`dialog dialog--${size}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClick={closeOnBackdrop}
    >
      {open && (
        <m.div
          className="dialog__panel"
          variants={dialogPanel}
          initial={prefersReducedMotion() ? false : 'hidden'}
          animate="show"
        >
          <header className="dialog__header">
            <div>
              <h2 id={titleId} className="dialog__title">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="dialog__description">
                  {description}
                </p>
              )}
            </div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup dialog">
              <Icon name="x" />
            </button>
          </header>
          <div className="dialog__body">{children}</div>
          {footer && <footer className="dialog__footer">{footer}</footer>}
        </m.div>
      )}
    </dialog>
  );
}
