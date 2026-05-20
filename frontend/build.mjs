import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

await build({
  root: fileURLToPath(new URL('.', import.meta.url)),
  configFile: false,
  plugins: [react()],
  preview: { port: 4173, host: '0.0.0.0' }
});
