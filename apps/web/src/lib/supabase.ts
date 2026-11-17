import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isDemoMode } from 'lib/demo-mode';
import { demoFrom, demoRpc } from 'lib/demo-client';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
export const SUPABASE_HOST = (() => {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
})();

const raw = createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

export const supabase = new Proxy(raw, {
  get(target, prop) {
    if (prop === 'from') {
      return (table: string) => (isDemoMode() ? demoFrom(table) : target.from(table));
    }
    if (prop === 'rpc') {
      return (fn: string, args?: Record<string, unknown>) => (isDemoMode() ? demoRpc(fn, args) : target.rpc(fn, args as never));
    }
    const value = Reflect.get(target, prop, target);
    return typeof value === 'function' ? value.bind(target) : value;
  },
}) as SupabaseClient;
