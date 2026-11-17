import { useEffect, useState, type FormEvent } from 'react';
import bn from 'i18n/bn';
import { supabase } from 'lib/supabase';
import { authErrorText } from 'lib/errors';
import { Btn, Card, Field, Notice, PageTitle } from 'components/ui/base';
import { toBnDigits } from '@patabin/shared';
import { usePageTitle } from 'hooks/usePageTitle';
import loginBg from 'assets/images/backgrounds/login-bg.webp';

const DELAYS = [30, 60, 120];

export default function LoginPage() {
  usePageTitle(bn.login, 'পাতাবিনে প্রবেশ করে আপনার চকলেট ব্যবসার হিসাব রাখুন।');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fails, setFails] = useState(0);
  const [lockUntil, setLockUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const locked = lockUntil > now;
  const waitSec = Math.ceil((lockUntil - now) / 1000);

  useEffect(() => {
    if (!locked) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [locked]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (locked) return;
    setError('');
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (!error) {
      setFails(0);
      setLockUntil(0);
      return;
    }
    if (error.status === 429 || error.code === 'over_request_rate_limit') {
      setError(bn.rateLimited);
      return;
    }
    const n = fails + 1;
    setFails(n);
    setError(authErrorText(error));
    if (n >= DELAYS.length) {
      const delay = DELAYS[Math.min(n - DELAYS.length, DELAYS.length - 1)] ?? 120;
      setLockUntil(Date.now() + delay * 1000);
      setNow(Date.now());
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <img src={loginBg} alt="" aria-hidden className="fixed inset-0 -z-10 h-full w-full object-cover" />
      <Card className="w-full max-w-sm p-7">
        <PageTitle tag="PataBin" title={bn.login} />
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field label={bn.email}>
            <input
              className="field"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              aria-label={bn.email}
            />
          </Field>
          <Field label={bn.password}>
            <input
              className="field"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              aria-label={bn.password}
            />
          </Field>
          {error && <Notice tone="error">{error}</Notice>}
          {locked && <Notice tone="error">{`${toBnDigits(waitSec)} ${bn.retryIn}`}</Notice>}
          <Btn type="submit" busy={busy} disabled={locked || !email || !password}>
            {bn.loginBtn}
          </Btn>
        </form>
      </Card>
    </div>
  );
}
