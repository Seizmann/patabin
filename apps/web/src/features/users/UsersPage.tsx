import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from 'lib/supabase';
import { useAuth } from 'lib/auth';
import { usePageTitle } from 'hooks/usePageTitle';
import { Btn, Card, Field, Notice, PageTitle, Skeleton } from 'components/ui/base';

type ProfileRow = { id: string; role: 'su_admin' | 'patabin_admin'; display_name: string; is_active: boolean; must_change_password: boolean };

const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users`;

async function callFn(action: string, body: Record<string, unknown>): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...body }),
  });
  const json = (await res.json()) as { error?: string };
  if (!res.ok) return json.error ?? 'সমস্যা হয়েছে';
  return '';
}

export default function UsersPage() {
  usePageTitle('ব্যবহারকারী');
  const { session } = useAuth();
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busyId, setBusyId] = useState('');
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('patabin_admin');

  const { data: profiles = [], isPending } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, role, display_name, is_active, must_change_password').order('created_at');
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
  });

  const run = async (id: string, action: string, body: Record<string, unknown>) => {
    setBusyId(id);
    setError('');
    setOk('');
    const err = await callFn(action, body);
    if (err) setError('কাজটি হয়নি।');
    else {
      setOk('সম্পন্ন হয়েছে।');
      await qc.invalidateQueries({ queryKey: ['users'] });
    }
    setBusyId('');
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setOk('');
    if (!email || !displayName) {
      setError('ইমেইল ও নাম দিন');
      return;
    }
    setBusyId('create');
    const err = await callFn('create_user', { email, temp_password: tempPassword, display_name: displayName, role, partner_name: displayName });
    setBusyId('');
    if (err) setError(err === 'email_taken' ? 'এই ইমেইল আগে থেকে আছে।' : 'কাজটি হয়নি।');
    else {
      setOk('ব্যবহারকারী তৈরি হয়েছে; প্রথম প্রবেশে পাসওয়ার্ড বদলাতে হবে।');
      setCreating(false);
      setEmail('');
      setTempPassword('');
      setDisplayName('');
      await qc.invalidateQueries({ queryKey: ['users'] });
    }
  };

  const resetPassword = async (id: string) => {
    const pass = window.prompt('নতুন সাময়িক পাসওয়ার্ড (অন্তত ১০ অক্ষর):') ?? '';
    if (!pass || pass.length < 10) {
      setError('পাসওয়ার্ড অন্তত ১০ অক্ষরের দিন।');
      return;
    }
    await run(id, 'reset_password', { user_id: id, temp_password: pass });
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageTitle tag="PataBin" title="ব্যবহারকারী" right={<Btn onClick={() => setCreating(!creating)}>তৈরি করুন</Btn>} />
      {ok && <Notice tone="ok">{ok}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      {creating && (
        <Card className="p-5">
          <form onSubmit={create} className="grid grid-cols-2 gap-4" noValidate>
            <Field label="নাম">
              <input className="field" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </Field>
            <Field label="ইমেইল">
              <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="সাময়িক পাসওয়ার্ড">
              <input className="field" type="text" value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} minLength={10} />
            </Field>
            <Field label="ভূমিকা">
              <select className="field" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="patabin_admin">অ্যাডমিন</option>
                <option value="su_admin">অ্যাডমিন (সুপার)</option>
              </select>
            </Field>
            <div className="col-span-2">
              <Btn type="submit" busy={!!busyId}>
                তৈরি করুন
              </Btn>
            </div>
          </form>
        </Card>
      )}

      {isPending && (
        <div className="flex flex-col gap-2" aria-busy>
          {[0, 1].map((n) => (
            <Skeleton key={n} className="h-16 w-full" />
          ))}
        </div>
      )}

      {profiles.map((p) => (
        <Card key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="p-title">{p.display_name}</p>
            <p className="p-caption">
              {p.role === 'su_admin' ? 'সুপার অ্যাডমিন' : 'অ্যাডমিন'} · {p.is_active ? 'সক্রিয়' : 'নিষ্ক্রিয়'}
              {p.must_change_password ? ' · পাসওয়ার্ড বদলাতে হবে' : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn variant="ghost" busy={busyId === p.id} onClick={() => void run(p.id, 'set_active', { user_id: p.id, is_active: !p.is_active })}>
              {p.is_active ? 'নিষ্ক্রিয় করুন' : 'সক্রিয় করুন'}
            </Btn>
            <Btn variant="ghost" onClick={() => void resetPassword(p.id)}>
              পাসওয়ার্ড রিসেট
            </Btn>
            {session?.user.id !== p.id && (
              <Btn
                variant="ghost"
                busy={busyId === p.id}
                onClick={() => void run(p.id, 'set_role', { user_id: p.id, role: p.role === 'su_admin' ? 'patabin_admin' : 'su_admin' })}
              >
                ভূমিকা বদল
              </Btn>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
