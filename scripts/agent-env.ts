import { writeFileSync } from 'node:fs';
import { loadSecrets, need } from './secrets';

const s = loadSecrets();
const lines = [
  'PORT=8787',
  `APP_ENV=${process.env.AGENT_APP_ENV ?? 'development'}`,
  `LOG_LEVEL=${process.env.AGENT_LOG_LEVEL ?? 'info'}`,
  `SUPABASE_URL=${need(s, 'SUPABASE_URL')}`,
  `SUPABASE_ANON_KEY=${need(s, 'SUPABASE_ANON_KEY')}`,
  `ALLOWED_ORIGINS=${process.env.AGENT_ALLOWED_ORIGINS ?? 'http://localhost:5173'}`,
  '',
];
writeFileSync('apps/patabin-ai/.env', lines.join('\n'));
console.log('wrote apps/patabin-ai/.env');
