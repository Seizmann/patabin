/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const src = fileURLToPath(new URL('./src', import.meta.url));

const siteUrl = process.env.VITE_SITE_URL || 'http://localhost:5173';

const seoPlugin: Plugin = {
  name: 'patabin-seo-html',
  apply: 'build',
  transformIndexHtml(html) {
    const abs = (p: string) => `${siteUrl}${p}`;
    const extra = [
      `<link rel="canonical" href="${siteUrl}/" />`,
      `<meta name="description" content="পাতাবিন: চকলেট ব্যবসার হিসাব রাখার অ্যাপ। কেনা, বিক্রি, লাভ, স্টক ও হাতের টাকা — সব এক জায়গায়।" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="PataBin" />`,
      `<meta property="og:title" content="PataBin" />`,
      `<meta property="og:description" content="চকলেট ব্যবসার হিসাব — এক অ্যাপে।" />`,
      `<meta property="og:image" content="${abs('/og-image.webp')}" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta property="og:url" content="${siteUrl}/" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="PataBin" />`,
      `<meta name="twitter:description" content="চকলেট ব্যবসার হিসাব — এক অ্যাপে।" />`,
      `<meta name="twitter:image" content="${abs('/og-image.webp')}" />`,
      `<link rel="manifest" href="/manifest.webmanifest" />`,
    ].join('\n    ');
    const jsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'PataBin',
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'PWA',
      lang: 'bn',
      url: siteUrl,
    });
    return html.replace(
      '<title>পাতাবিন</title>',
      `<title>পাতাবিন</title>\n    ${extra}\n    <script type="application/ld+json">${jsonLd}</script>`,
    );
  },
};

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    seoPlugin,
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['brand/*', 'og-image.webp'],
      manifest: {
        name: 'PataBin',
        short_name: 'পাতাবিন',
        lang: 'bn',
        display: 'standalone',
        start_url: '/',
        background_color: '#F5F1EA',
        theme_color: '#F5F1EA',
        icons: [
          { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        runtimeCaching: [],
      },
    }),
  ],
  resolve: {
    alias: {
      'lib/': `${src}/lib/`,
      'app/': `${src}/app/`,
      features: `${src}/features`,
      'components/': `${src}/components/`,
      'hooks/': `${src}/hooks/`,
      'i18n/': `${src}/i18n/`,
      'styles/': `${src}/styles/`,
      'assets/': `${src}/assets/`,
    },
  },
  test: {
    environment: 'jsdom',
    passWithNoTests: true,
  },
});
