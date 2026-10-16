import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

await build({
  root: fileURLToPath(new URL('.', import.meta.url)),
  configFile: false,
  plugins: [react(), tailwindcss()],
  preview: { port: 4173, host: '0.0.0.0' }
});
