import { createContext, useContext, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { myPartnerId } from 'lib/api';

export type ViewMode = 'all' | 'self';

const KEY = 'patabin.view-mode';

type ViewModeContextValue = {
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  myPartnerId: string | null;
  resolving: boolean;
  isSelf: boolean;
};

const ViewModeContext = createContext<ViewModeContextValue | null>(null);

function readStoredMode(): ViewMode {
  try {
    return localStorage.getItem(KEY) === 'self' ? 'self' : 'all';
  } catch {
    return 'all';
  }
}

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const [viewMode, setMode] = useState<ViewMode>(readStoredMode);

  const myPartner = useQuery({ queryKey: ['my-partner'], queryFn: myPartnerId, staleTime: 60_000 });

  const setViewMode = (m: ViewMode) => {
    setMode(m);
    try {
      localStorage.setItem(KEY, m);
    } catch {
      // storage unavailable (private mode etc.) — keep in-memory only
    }
  };

  const value = useMemo<ViewModeContextValue>(
    () => ({
      viewMode,
      setViewMode,
      myPartnerId: myPartner.data ?? null,
      resolving: myPartner.isPending,
      isSelf: viewMode === 'self' && !!myPartner.data,
    }),
    [viewMode, myPartner.data, myPartner.isPending],
  );

  return <ViewModeContext.Provider value={value}>{children}</ViewModeContext.Provider>;
}

export function useViewMode(): ViewModeContextValue {
  const ctx = useContext(ViewModeContext);
  if (!ctx) throw new Error('useViewMode must be used within ViewModeProvider');
  return ctx;
}
