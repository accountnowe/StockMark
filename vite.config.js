import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages serves this repo at /StockMark/, so the asset prefix is injected
  // only by the Pages workflow; local dev and local builds stay at the root.
  base: process.env.PAGES_BASE || '/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
