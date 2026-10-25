import { readFileSync } from 'node:fs';
import { ROUTES } from '../apps/web/src/app/routes';

const config = JSON.parse(readFileSync('apps/web/vercel.json', 'utf8')) as {
  rewrites: { source: string; destination: string }[];
};

const template = (r: ROUTES[number]): string => r.replace(':code', '(B-\\d+)');
const wanted = new Set(ROUTES.map(template));
const present = new Set(config.rewrites.map((r) => r.source).filter((src) => src !== '/(.*)'));

const missing = [...wanted].filter((x) => !present.has(x));
const extra = [...present].filter((x) => !wanted.has(x));

if (missing.length || extra.length) {
  console.error(`route drift: missing in vercel.json: ${missing.join(', ') || '-'}; extra: ${extra.join(', ') || '-'}`);
  process.exit(1);
}
const catchAll = config.rewrites.at(-1);
if (catchAll?.source !== '/(.*)' || catchAll.destination !== '/index.html') {
  console.error('vercel.json must end with catch-all rewrite to /index.html');
  process.exit(1);
}
console.log('check:routes OK');
