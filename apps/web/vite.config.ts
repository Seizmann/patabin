/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const src = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
