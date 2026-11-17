import { useState, useEffect, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from 'lib/supabase';
import { useAuth } from 'lib/auth';
import { usePageTitle } from 'hooks/usePageTitle';
import { Btn, Card, Field, Notice, PageTitle, Skeleton } from 'components/ui/base';
import { useDialog } from 'components/ui/Dialog';

type ProfileRow = { id: string; role: 'su_admin' | 'patabin_admin' | 'patabin_partner' | 'patabin_demo_admin'; display_name: string; is_active: boolean; must_change_password: boolean };

const ROLE_BN: Record<ProfileRow['role'], string> = {
  su_admin: 'সুপার অ্যাডমিন',
  patabin_admin: 'অ্যাডমিন',
  patabin_partner: 'ইনভেস্টর',
  patabin_demo_admin: 'ডেমো অ্যাডমিন',
};

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
  const dialog = useDialog();
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [busyId, setBusyId] = useState('');
  const [creating, setCreating] = useState(false);
  const [permTarget, setPermTarget] = useState<ProfileRow | null>(null);
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
    if (!email || !displayName || tempPassword.length < 10) {
      setError('ইমেইল, নাম দিন আর সাময়িক পাসওয়ার্ড অন্তত ১০ অক্ষরের দিন');
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
    const pass = await dialog.prompt({ title: 'সাময়িক পাসওয়ার্ড', message: 'নতুন সাময়িক পাসওয়ার্ড দিন (অন্তত ১০ অক্ষর)।', confirmText: 'সেট করুন' });
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
              <input className="field" type="password" value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} minLength={10} />
            </Field>
            <Field label="ভূমিকা">
              <select className="field" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="patabin_admin">অ্যাডমিন</option>
                <option value="su_admin">অ্যাডমিন (সুপার)</option>
                <option value="patabin_partner">ইনভেস্টর</option>
                <option value="patabin_demo_admin">ডেমো অ্যাডমিন</option>
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
              {ROLE_BN[p.role]} · {p.is_active ? 'সক্রিয়' : 'নিষ্ক্রিয়'}
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
              <>
                <Btn variant="ghost" onClick={() => setPermTarget(p)}>
                  পারমিশন
                </Btn>
                <Field label="ভূমিকা">
                  <select
                    className="field min-h-[44px] w-auto py-1.5"
                    value={p.role}
                    disabled={busyId === p.id}
                    onChange={(e) => void run(p.id, 'set_role', { user_id: p.id, role: e.target.value })}
                  >
                    <option value="patabin_admin">অ্যাডমিন</option>
                    <option value="su_admin">অ্যাডমিন (সুপার)</option>
                    <option value="patabin_partner">ইনভেস্টর</option>
                    <option value="patabin_demo_admin">ডেমো অ্যাডমিন</option>
                  </select>
                </Field>
              </>
            )}
          </div>
        </Card>
      ))}
      {permTarget && <PermSheet target={permTarget} onClose={() => setPermTarget(null)} />}
    </div>
  );
}

function PermSheet({ target, onClose }: { target: ProfileRow; onClose: () => void }) {
  const qc = useQueryClient();
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { data: catalog = [] } = useQuery({
    queryKey: ['permissions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('permissions').select('key, label_bn').order('sort');
      if (error) throw error;
      return (data ?? []) as { key: string; label_bn: string }[];
    },
  });
  const { data: roleDefaults = [] } = useQuery({
    queryKey: ['role-permissions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('role_permissions').select('role, permission_key');
      if (error) throw error;
      return (data ?? []) as { role: ProfileRow['role']; permission_key: string }[];
    },
  });
  const { data: overrides = [] } = useQuery({
    queryKey: ['profile-permissions', target.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('profile_permissions').select('permission_key, allowed').eq('profile_id', target.id);
      if (error) throw error;
      return (data ?? []) as { permission_key: string; allowed: boolean }[];
    },
  });

  const roleDefault = (key: string) => roleDefaults.some((x) => x.role === target.role && x.permission_key === key);
  const effective = (key: string) => {
    const o = overrides.find((x) => x.permission_key === key);
    return o ? o.allowed : roleDefault(key);
  };
  const hasOverride = (key: string) => overrides.some((x) => x.permission_key === key);

  const toggle = async (key: string) => {
    setBusyKey(key);
    setError('');
    const next = !effective(key);
    const err = await callFn('set_permissions', { user_id: target.id, permission_key: key, allowed: next === roleDefault(key) ? null : next });
    setBusyKey('');
    if (err) setError('পরিবর্তন হয়নি।');
    else await qc.invalidateQueries({ queryKey: ['profile-permissions', target.id] });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="card relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-b-none p-5 lg:rounded-b-[24px]" role="dialog" aria-modal="true" aria-label="পারমিশন">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="p-title">পারমিশন — {target.display_name}</p>
            <p className="p-caption">{ROLE_BN[target.role]} · ডিফল্ট থেকে বদলালে ওভাররাইড হবে</p>
          </div>
          <Btn variant="ghost" onClick={onClose}>
            বন্ধ
          </Btn>
        </div>
        {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
        <div className="mt-4 flex flex-col divide-y divide-hairline">
          {catalog.map((c) => (
            <div key={c.key} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-semibold">{c.label_bn}</p>
                <p className="p-caption">
                  ডিফল্ট: {roleDefault(c.key) ? 'আছে' : 'নেই'}
                  {hasOverride(c.key) ? ' · ওভাররাইড করা' : ''}
                </p>
              </div>
              <Btn variant={effective(c.key) ? 'solid' : 'ghost'} busy={busyKey === c.key} onClick={() => void toggle(c.key)}>
                {effective(c.key) ? 'আছে' : 'নেই'}
              </Btn>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
