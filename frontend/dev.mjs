import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const server = await createServer({
  root: fileURLToPath(new URL('.', import.meta.url)),
  configFile: false,
  plugins: [react()],
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      '/uploads': 'http://127.0.0.1:3001'
    }
  }
});

await server.listen();
server.printUrls();
