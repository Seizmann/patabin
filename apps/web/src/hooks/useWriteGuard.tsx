import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from 'lib/auth';
import AccessDeniedPopup from 'components/AccessDeniedPopup';

const AUTO_DISMISS_MS = 3200;

/**
 * For read-only (patabin_partner) accounts: write buttons stay visible, but
 * any write action is intercepted and an animated "no permission" popup is
 * shown instead. Use `guard(fn)` to wrap a write handler, `pop()` to show the
 * popup directly (e.g. from drag handlers), and render `denied` once per page.
 */
export function useWriteGuard() {
  const { readOnly } = useAuth();
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const pop = useCallback(() => {
    setOpen(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(false), AUTO_DISMISS_MS);
  }, []);

  const guard = useCallback(
    <A,>(fn: (...args: A[]) => void) =>
      (...args: A[]) => {
        if (!readOnly) return fn(...args);
        pop();
      },
    [readOnly, pop],
  );

  const denied: ReactNode = open ? <AccessDeniedPopup onClose={() => setOpen(false)} /> : null;

  return { guard, pop, denied, canWrite: !readOnly };
}
