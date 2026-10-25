import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { loadSecrets } from './secrets';

const dist = 'apps/web/dist';
const supabaseHost = new URL(loadSecrets().SUPABASE_URL).host;
const port = 4319;

const mime: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain',
};

const csp = [
  "default-src 'self'",
  `connect-src 'self' https://${supabaseHost} wss://${supabaseHost}`,
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const headers: [string, string][] = [
  ['Content-Security-Policy', csp],
  ['X-Content-Type-Options', 'nosniff'],
  ['Cross-Origin-Opener-Policy', 'same-origin'],
];

function resolveRoute(path: string): string | null {
  const clean = path.split('?')[0].replace(/\/$/, '') || '';
  const direct = join(dist, clean || 'index.html');
  let isFile = false;
  try {
    isFile = statSync(direct).isFile();
  } catch {
    isFile = false;
  }
  if (clean && isFile) return direct;
  if (/\.[a-z0-9]+$/.test(clean)) return null;
  return join(dist, 'index.html');
}

const srv = createServer((req, res) => {
  const file = resolveRoute(req.url ?? '/');
  if (!file) {
    res.writeHead(404);
    res.end();
    return;
  }
  for (const [k, v] of headers) res.setHeader(k, v);
  res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});

await new Promise<void>((ok) => srv.listen(port, ok));

const paths = ['/', '/login', '/batches', '/settings', '/sw.js', '/manifest.webmanifest', '/robots.txt'];
let failures = 0;
for (const p of paths) {
  const res = await fetch(`http://localhost:${port}${p}`);
  const got = res.headers.get('content-security-policy') ?? '';
  const okCsp = got.includes(`connect-src 'self' https://${supabaseHost} wss://${supabaseHost}`) && !got.includes('unsafe-eval');
  if (!res.ok || !okCsp) {
    console.error(`csp smoke FAILED ${p}: status=${res.status} cspOk=${okCsp}`);
    failures++;
  } else {
    console.log(`csp smoke OK ${p}`);
  }
}

srv.close();
process.exit(failures ? 1 : 0);
