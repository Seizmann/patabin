import { createClient } from '@supabase/supabase-js';

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

export const supabase = createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
