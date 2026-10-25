import { useEffect } from 'react';
import { supabase } from 'lib/supabase';

const LIMIT = 60 * 60 * 1000;

export function useIdleSignout() {
  useEffect(() => {
    let last = Date.now();
    const bump = () => {
      last = Date.now();
    };
    const events = ['pointerdown', 'keydown', 'scroll', 'visibilitychange'];
    events.forEach((e) => document.addEventListener(e, bump, { passive: true }));
    const t = window.setInterval(() => {
      if (Date.now() - last > LIMIT) void supabase.auth.signOut();
    }, 30_000);
    return () => {
      events.forEach((e) => document.removeEventListener(e, bump));
      window.clearInterval(t);
    };
  }, []);
}
