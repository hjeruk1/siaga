import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

// Konfigurasi (plugin, port, proxy) ada di vite.config.js.
// Vite memuatnya otomatis karena root diarahkan ke direktori ini.
const server = await createServer({
  root: fileURLToPath(new URL('.', import.meta.url))
});

await server.listen();
server.printUrls();
