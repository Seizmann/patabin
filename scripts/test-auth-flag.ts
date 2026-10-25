import { execFileSync } from 'node:child_process';
import { need, loadSecrets } from './secrets';

const s = loadSecrets();
const baseUrl = need(s, 'SUPABASE_URL').replace(/\/$/, '');
const serviceKey = need(s, 'SUPABASE_SERVICE_ROLE_KEY');

function admin(request: string, init?: RequestInit): Promise<unknown> {
  return fetch(`${baseUrl}/auth/v1/${request}`, {
    ...init,
    headers: { Apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', ...init?.headers },
  }).then(async (r) => {
    const text = await r.text();
    if (!r.ok) throw new Error(`admin ${request}: ${r.status}`);
    return text ? JSON.parse(text) : null;
  });
}

function psql(sql: string): string {
  try {
    return execFileSync('psql', ['-X', '-q', '-t', need(s, 'SUPABASE_DB_URL'), '-c', sql], {
      encoding: 'utf8',
    });
  } catch (e) {
    const err = e as { stderr?: string };
    throw new Error(`psql failed: ${String(err.stderr ?? '').slice(0, 300)}`);
  }
}

const email = `flag-test-${Date.now()}@patabin.invalid`;
const user = (await admin('admin/users', {
  method: 'POST',
  body: JSON.stringify({ email, password: 'temp-pass-10', email_confirm: true }),
})) as { id: string };

psql(`insert into public.profiles (id, role, display_name) values ('${user.id}', 'patabin_admin', 'flag-test');`);

const on = psql(`select must_change_password = true from public.profiles where id = '${user.id}';`);
const snap = psql(`select password_hash_snapshot = (select encrypted_password from auth.users where id = '${user.id}') from public.profiles where id = '${user.id}';`);

await admin(`admin/users/${user.id}`, { method: 'PUT', body: JSON.stringify({ password: 'changed-pass-11' }) });

const off = psql(`select must_change_password = false from public.profiles where id = '${user.id}';`);

psql(`delete from public.profiles where id = '${user.id}'`);
await admin(`admin/users/${user.id}`, { method: 'DELETE' });

if (!/t/.test(on) || !/t/.test(snap) || !/t/.test(off)) {
  console.error(`flag-test failed: on=${on.trim()} snap=${snap.trim()} off=${off.trim()}`);
  process.exit(1);
}
console.log('auth flag trigger OK');
