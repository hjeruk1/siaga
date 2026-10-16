import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Satu-satunya sumber konfigurasi Vite untuk SIAGA.
// dev.mjs dan build.mjs memuat file ini — jangan deklarasikan plugin ulang di sana.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      '/uploads': 'http://127.0.0.1:3001'
    }
  },
  preview: {
    port: 4173,
    host: '0.0.0.0'
  }
});
