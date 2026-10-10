import { useEffect } from 'react';

export function useDocumentTitle(title) {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · E-OSIS` : 'E-OSIS · Pemilihan Ketua & Wakil Ketua OSIS';
    return () => {
      document.title = previous;
    };
  }, [title]);
}
