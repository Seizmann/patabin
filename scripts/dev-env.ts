import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const secrets: Record<string, string> = {};
for (const line of readFileSync('SECRETS.md', 'utf8').split('\n')) {
  const i = line.indexOf('=');
  if (i > 0 && /^[A-Z0-9_]+$/.test(line.slice(0, i))) secrets[line.slice(0, i)] = line.slice(i + 1).trim();
}

const site = secrets.VITE_SITE_URL || secrets.SITE_URL || 'http://localhost:5173';
const supabaseUrl = secrets.SUPABASE_URL;
const anon = secrets.SUPABASE_ANON_KEY;
if (!supabaseUrl || !anon) {
  console.error('SECRETS.md is missing SUPABASE_URL or SUPABASE_ANON_KEY');
  process.exit(1);
}

const path = 'apps/web/.env.local';
if (existsSync(path)) {
  console.log(`${path} already exists; not overwriting`);
  process.exit(0);
}

writeFileSync(
  path,
  `VITE_SUPABASE_URL=${supabaseUrl}\nVITE_SUPABASE_ANON_KEY=${anon}\nVITE_SITE_URL=${site}\n`,
);

console.log(`${path} created for local dev`);
