import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { need, loadSecrets } from './secrets';

const s = loadSecrets();
const url = need(s, 'SUPABASE_URL').replace(/\/$/, '');
const key = need(s, 'SUPABASE_SERVICE_ROLE_KEY');
const tables = [
  'partners',
  'settings',
  'batches',
  'batch_contributions',
  'expenses',
  'stock_adjustments',
  'sales',
  'sale_allocations',
  'transfers',
  'batch_close_snapshots',
  'profiles',
  'audit_log',
];

const dir = 'backups';
if (!existsSync(dir)) mkdirSync(dir);

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dump: Record<string, unknown> = {};
for (const t of tables) {
  const res = await fetch(`${url}/rest/v1/${t}?select=*`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    console.error(`backup ${t}: HTTP ${res.status}`);
    process.exit(1);
  }
  dump[t] = await res.json();
}

writeFileSync(`${dir}/${stamp}.json`, JSON.stringify(dump, null, 2));
console.log(`backup written to backups/${stamp}.json`);

execFileSync('git', ['check-ignore', `${dir}/${stamp}.json`], { stdio: 'ignore' });
console.log('backup is gitignored (safe)');
