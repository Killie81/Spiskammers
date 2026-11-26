// Lokal forhåndsvisning: samme app, men Supabase byttes ut med eksempeldata.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const mock = fileURLToPath(new URL('./supabase-mock.js', import.meta.url));
export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [react()],
  resolve: { alias: [{ find: /^\.\.?\/(\.\.\/)?supabase\.js$/, replacement: mock }] },
  server: { port: 5199, strictPort: true },
});
