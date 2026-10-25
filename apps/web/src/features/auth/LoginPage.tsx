import { useState, type FormEvent } from 'react';
import bn from 'i18n/bn';
import { supabase } from 'lib/supabase';
import { Btn, Card, Field, Notice, PageTitle } from 'components/ui/base';
import { usePageTitle } from 'hooks/usePageTitle';
import loginBg from 'assets/images/backgrounds/login-bg.webp';

export default function LoginPage() {
  usePageTitle(bn.login, 'পাতাবিনে প্রবেশ করে আপনার চকলেট ব্যবসার হিসাব রাখুন।');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(bn.loginFailed);
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
          <Btn type="submit" busy={busy} disabled={!email || !password}>
            {bn.loginBtn}
          </Btn>
        </form>
      </Card>
    </div>
  );
}
