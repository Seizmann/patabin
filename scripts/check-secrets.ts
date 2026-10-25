import { readFileSync } from 'node:fs';
import { loadSecrets, trackedFiles, stagedFiles } from './secrets';

const secrets = loadSecrets();
const PUBLIC_KEYS = new Set(['SUPABASE_PROJECT_REF', 'SUPABASE_URL', 'SUPABASE_ANON_KEY']);
const values = Object.entries(secrets)
  .filter(([k]) => !PUBLIC_KEYS.has(k))
  .map(([, v]) => v)
  .filter((v) => v.length >= 12);
const tracked = trackedFiles();
const staged = stagedFiles();

const offenders: string[] = [];
for (const f of ['SECRETS.md', 'backups/']) {
  if (tracked.some((t) => t === f || t.startsWith(`${f}/`))) offenders.push(`tracked: ${f}`);
  if (staged.some((t) => t === f || t.startsWith(`${f}/`))) offenders.push(`staged: ${f}`);
}
if (tracked.concat(staged).some((t) => /^\.env(\..+)?$/.test(t))) offenders.push('tracked .env file');

for (const f of tracked) {
  if (!/\.(ts|tsx|js|json|md|html|css|sql|toml|yaml|yml)$/.test(f)) continue;
  if (f.startsWith('docs/img/')) continue;
  const text = readFileSync(f, 'utf8');
  for (const v of values) if (text.includes(v)) offenders.push(`secret leak in ${f}`);
}

if (offenders.length) {
  console.error(offenders.join('\n'));
  process.exit(1);
}
console.log('check:secrets OK');
