import { useState } from 'react';

export type ViewMode = 'all' | 'self';

const KEY = 'patabin.view-mode';

export function useViewMode(): [ViewMode, (m: ViewMode) => void] {
  const [mode, setMode] = useState<ViewMode>(() => {
    try {
      return localStorage.getItem(KEY) === 'self' ? 'self' : 'all';
    } catch {
      return 'all';
    }
  });

  const setModePersisted = (m: ViewMode) => {
    setMode(m);
    try {
      localStorage.setItem(KEY, m);
    } catch {
      // storage unavailable (private mode etc.) — keep in-memory only
    }
  };

  return [mode, setModePersisted];
}
