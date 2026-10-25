import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { loadSecrets } from './secrets';

const dir = 'supabase/tests';
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const url = loadSecrets()['SUPABASE_DB_URL'];

for (const f of files) {
  const path = join(dir, f);
  console.log(`running ${path}`);
  try {
    execFileSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-q', url, '-f', path], { stdio: 'inherit' });
  } catch {
    console.error(`FAILED ${path}`);
    process.exit(1);
  }
}

const flag = spawnSync('pnpm', ['exec', 'tsx', 'scripts/test-auth-flag.ts'], { stdio: 'inherit' });
if (flag.status !== 0) {
  console.error('FAILED scripts/test-auth-flag.ts');
  process.exit(1);
}
console.log(`test:sql OK (${files.length} sql files + auth flag)`);
