import { execFileSync } from 'node:child_process';
import { need, loadSecrets } from './secrets';

const s = loadSecrets();
const baseUrl = need(s, 'SUPABASE_URL').replace(/\/$/, '');
const serviceKey = need(s, 'SUPABASE_SERVICE_ROLE_KEY');

type AdminUser = { id: string; email: string | null };

function admin(request: string, init?: RequestInit): Promise<unknown> {
  return fetch(`${baseUrl}/auth/v1/${request}`, {
    ...init,
    headers: { Apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', ...init?.headers },
  }).then(async (r) => {
    const text = await r.text();
    if (!r.ok) throw new Error(`admin ${request}: ${r.status} ${text}`);
    return text ? JSON.parse(text) : null;
  });
}

async function adminListUsers(): Promise<AdminUser[]> {
  const res = (await admin('admin/users?per_page=50')) as { users?: AdminUser[] };
  return res?.users ?? [];
}

async function upsertUser(email: string, password: string): Promise<string> {
  const users = await adminListUsers();
  const hit = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (hit) return hit.id;
  const created = (await admin('admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password, email_confirm: true }),
  })) as AdminUser;
  if (!created?.id) throw new Error(`could not create user for ${email}`);
  return created.id;
}

function psql(sql: string): string {
  try {
    return execFileSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-q', '-t', need(s, 'SUPABASE_DB_URL'), '-c', sql], { encoding: 'utf8' });
  } catch (e) {
    if (e instanceof Error && 'stderr' in e) throw new Error(`psql failed: ${String((e as { stderr?: Buffer }).stderr ?? '').slice(0, 500)}`);
    throw e;
  }
}

const suId = await upsertUser(need(s, 'SU_ADMIN_EMAIL'), need(s, 'SU_ADMIN_PASSWORD'));
const paId = await upsertUser(need(s, 'PATABIN_ADMIN_EMAIL'), need(s, 'PATABIN_ADMIN_PASSWORD'));

psql(`
begin;
insert into public.profiles (id, role, display_name, must_change_password, is_active)
values ('${suId}', 'su_admin', $salang$${need(s, 'SU_ADMIN_NAME')}$salang$, true, true)
on conflict (id) do update set role = excluded.role, display_name = excluded.display_name;
insert into public.profiles (id, role, display_name, must_change_password, is_active)
values ('${paId}', 'patabin_admin', $salang$${need(s, 'PATABIN_ADMIN_NAME')}$salang$, true, true)
on conflict (id) do update set role = excluded.role, display_name = excluded.display_name;

insert into public.partners (name, user_id)
values ($salang$${need(s, 'SU_ADMIN_NAME')}$salang$, '${suId}'),
       ($salang$${need(s, 'PATABIN_ADMIN_NAME')}$salang$, '${paId}')
on conflict (user_id) do update set name = excluded.name;

insert into public.settings (id, updated_by)
values (1, '${suId}')
on conflict (id) do nothing;

insert into public.expense_categories (name)
values ('ট্রান্সপোর্ট'), ('সিগারেট'), ('মোবাইল রিচার্জ'), ('অন্যান্য')
on conflict (name) do nothing;

insert into public.wallets (type, label, created_by)
values ('cash', 'Cash', '${suId}')
on conflict do nothing;
commit;
`);

console.log('seed OK');
