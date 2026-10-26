import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from 'lib/supabase';
import type { Session } from '@supabase/supabase-js';

type Profile = { id: string; role: 'su_admin' | 'patabin_admin'; display_name: string; must_change_password: boolean; is_active: boolean };

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  suAdmin: boolean;
  refreshProfile: () => void;
};

const Ctx = createContext<AuthState>({ session: null, profile: null, loading: true, suAdmin: false, refreshProfile: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s && window.location.pathname !== '/login') window.location.replace('/login');
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id;
  const { data, refetch } = useQuery<Profile>({
    queryKey: ['profile', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data: row, error: dbErr } = await supabase
        .from('profiles')
        .select('id, role, display_name, must_change_password, is_active')
        .eq('id', uid!)
        .single();
      if (!row || dbErr) {
        await supabase.auth.signOut();
        throw new Error('no-profile');
      }
      return row;
    },
  });

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile: data as AuthState['profile'] ?? null,
      loading: loading || (!!session && data === undefined),
      suAdmin: data?.role === 'su_admin',
      refreshProfile: () => void refetch(),
    }),
    [session, data, loading, uid, refetch],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
