import { execFileSync } from 'node:child_process';
import { need, loadSecrets } from './secrets';

const s = loadSecrets();
const supabaseUrl = need(s, 'SUPABASE_URL').replace(/\/$/, '');
const key = need(s, 'SUPABASE_SERVICE_ROLE_KEY');

const emailArg = process.argv[2];
const newPass = process.argv[3];
if (!emailArg || !newPass || newPass.length < 10) {
  console.error('usage: pnpm admin:reset <email> <new-temp-password (min 10 chars)>');
  process.exit(1);
}

async function run() {
  const list = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=50`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  }).then((r) => r.json() as Promise<{ users?: { id: string; email: string | null }[] }>);
  const user = list.users?.find((u) => u.email?.toLowerCase() === emailArg.toLowerCase());
  if (!user) {
    console.error('user not found');
    process.exit(1);
  }
  const upd = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}`, {
    method: 'PUT',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: newPass }),
  });
  if (!upd.ok) throw new Error(`admin update failed: HTTP ${upd.status}`);
  execFileSync(
    'psql',
    [
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-q',
      need(s, 'SUPABASE_DB_URL'),
      '-c',
      `update public.profiles set must_change_password = true where id = '${user.id}';`,
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
  console.log(`password reset and flag set for ${emailArg}`);
}

void run();
