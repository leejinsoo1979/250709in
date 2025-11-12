import { useEffect } from 'react';

let lockCount = 0;
let originalOverflow: string | null = null;

export const useScrollLock = (active: boolean) => {
  useEffect(() => {
    if (!active || typeof document === 'undefined') {
      return;
    }

    lockCount += 1;
    if (lockCount === 1) {
      originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0 && typeof document !== 'undefined') {
        document.body.style.overflow = originalOverflow ?? '';
        originalOverflow = null;
      }
    };
  }, [active]);
};
