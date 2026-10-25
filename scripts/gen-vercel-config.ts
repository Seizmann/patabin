import { readFileSync, writeFileSync } from 'node:fs';
import { loadSecrets } from './secrets';

const s = loadSecrets();
const supabaseUrl = s.SUPABASE_URL;
if (!supabaseUrl) {
  console.error('Missing SUPABASE_URL in SECRETS.md');
  process.exit(1);
}
const supabaseHost = new URL(supabaseUrl).host;
const siteUrl = s.VITE_SITE_URL || '';

const routes = [
  '/',
  '/login',
  '/change-password',
  '/sales',
  '/sales/new',
  '/personal-use',
  '/batches',
  '/batches/new',
  '/batches/:code',
  '/expenses',
  '/adjustments',
  '/settlement',
  '/reports',
  '/audit-trail',
  '/users',
  '/settings',
  '/profile',
];

const explicitRoutes = routes.map((r) => r.replace(':code', '(B-\\d+)'));
const rewrites = [
  ...explicitRoutes.map((r) => ({ source: r === '/' ? '/' : r, destination: '/index.html' })),
  { source: '/(.*)', destination: '/index.html' },
];

const config = {
  $schema: 'https://openapi.vercel.sh/vercel.json',
  framework: 'vite',
  installCommand: 'pnpm --dir ../.. install --frozen-lockfile',
  buildCommand: 'pnpm --dir ../.. --filter @patabin/web build',
  outputDirectory: 'dist',
  rewrites,
  headers: [
    {
      source: '/assets/(.*)',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
    },
    {
      source: '/icons/(.*)',
      headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
    },
    {
      source: '/(sw.js|registerSW.js|manifest.webmanifest|robots.txt|workbox-.*.js$)',
      headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
    },
    {
      source: '/(.*)',
      headers: [
        {
          key: 'Content-Security-Policy',
          value: [
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
          ].join('; '),
        },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
      ],
    },
  ],
};

writeFileSync('apps/web/vercel.json', `${JSON.stringify(config, null, 2)}\n`);
console.log(`vercel.json generated (CSP host: ${supabaseHost}${siteUrl ? `, site: ${siteUrl}` : ''})`);
