import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import bn from 'i18n/bn';
import { supabase } from 'lib/supabase';
import { useAuth } from 'lib/auth';
import { Btn, Card, Field, Notice, PageTitle } from 'components/ui/base';
import { toBnDigits } from '@patabin/shared';
import { usePageTitle } from 'hooks/usePageTitle';

export default function ChangePasswordPage() {
  usePageTitle(bn.changePasswordTitle);
  const { session, refreshProfile } = useAuth();
  const nav = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!session) return;
    if (next.length < 10) {
      setError(`${bn.passwordMin} (${toBnDigits(10)})`);
      return;
    }
    if (next !== again) {
      setError(bn.passwordMismatch);
      return;
    }
    setBusy(true);
    const { error: currentError } = await supabase.auth.signInWithPassword({ email: session.user.email ?? '', password: current });
    if (currentError) {
      setBusy(false);
      setError(bn.loginFailed);
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password: next });
    if (!updateError) {
      const { error: rpcError } = await supabase.rpc('complete_password_change');
      if (!rpcError) {
        refreshProfile();
        nav('/');
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    setError(bn.loginFailed);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <Card className="w-full max-w-sm p-7">
        <PageTitle tag="PataBin" title={bn.changePasswordTitle} />
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field label={bn.oldPassword}>
            <input className="field" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </Field>
          <Field label={bn.newPassword}>
            <input className="field" type="password" minLength={10} required value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field label={bn.confirmPassword}>
            <input className="field" type="password" minLength={10} required value={again} onChange={(e) => setAgain(e.target.value)} />
          </Field>
          {error && <Notice tone="error">{error}</Notice>}
          <Btn type="submit" busy={busy}>
            {bn.save}
          </Btn>
        </form>
      </Card>
    </div>
  );
}
