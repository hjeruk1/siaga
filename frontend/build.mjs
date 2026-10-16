import { build } from 'vite';
import { fileURLToPath } from 'node:url';

// Konfigurasi (plugin, preview) ada di vite.config.js.
// Vite memuatnya otomatis karena root diarahkan ke direktori ini.
await build({
  root: fileURLToPath(new URL('.', import.meta.url))
});
