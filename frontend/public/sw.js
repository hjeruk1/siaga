// Service Worker SIAGA.
//
// Catatan build: `frontend/build.mjs` mengisi dua hal di berkas ini saat
// build produksi:
//   1. nama cache (CACHE_NAME) diisi commit hash, supaya cache build lama
//      dibersihkan dan berkas ber-hash tidak menumpuk selamanya.
//   2. STATIC_ASSETS diisi daftar aset ber-hash di /assets/ (JS/CSS) hasil
//      build terakhir.
// Keduanya WAJIB: tanpa daftar aset, hanya index.html yang ter-cache dan
// aplikasi tampil kosong saat dibuka offline oleh pengguna baru.

const CACHE_NAME = 'siaga-cache-__SIAGA_BUILD__';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/favicon.ico',
  '/favicon.svg',
  '/favicon-96x96.png',
  '/apple-touch-icon.png',
  '/tp_logo.png',
  '/site.webmanifest'
];

// Aset ber-hash hasil build (JS/CSS). Baris ini diganti build.mjs dengan daftar
// aset /assets/ terbaru. Karena nama berkasnya ber-hash, isi cache aman
// diperbarui setiap rilis tanpa takut versi lama tertinggal.
const SHELL_ASSETS = [];

// Halaman cadangan saat pengguna benar-benar offline dan belum ada apa pun di
// cache (kunjungan pertama tanpa sinyal). Lebih baik dari layar putih browser.
const OFFLINE_HTML = `<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SIAGA - Offline</title>
<style>
  body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#fffbeb;color:#1e293b;
       display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center}
  .card{background:#fff;border-radius:24px;padding:32px 28px;max-width:22rem;
        box-shadow:0 18px 44px rgba(120,53,15,.14)}
  .badge{display:inline-block;background:#fef3c7;color:#b45309;font-size:11px;font-weight:800;
         letter-spacing:.08em;text-transform:uppercase;padding:5px 12px;border-radius:999px}
  h1{font-size:19px;margin:14px 0 8px}
  p{font-size:13px;line-height:1.6;color:#64748b;margin:0 0 18px}
  button{background:#f59e0b;color:#fff;border:0;border-radius:12px;padding:11px 22px;
         font-size:13px;font-weight:800;cursor:pointer}
</style></head>
<body><div class="card">
  <span class="badge">Tidak ada koneksi</span>
  <h1>SIAGA sedang offline</h1>
  <p>Perangkat belum tersambung ke internet. Catatan anak yang sudah pernah dibuka tetap bisa dibaca setelah koneksi kembali.</p>
  <button onclick="location.reload()">Coba lagi</button>
</div></body></html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching app shell');
      return cache.addAll([...STATIC_ASSETS, ...SHELL_ASSETS]);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bypass caching for API requests and Dev Server HMR/websockets.
  // Notifikasi tetap lewat jaringan: cache untuk API akan membuat orang tua
  // membaca data basi.
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/uploads/') ||
    url.pathname.startsWith('/sockjs-node') ||
    url.pathname.includes('hot-update')
  ) {
    return;
  }

  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Network-first for navigation (fresh data, cache fallback)
  if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          }
          return response;
        })
        .catch(async () => {
          console.log('[Service Worker] Offline navigate fallback');
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const shell = await caches.match('/index.html');
          if (shell) return shell;
          return new Response(OFFLINE_HTML, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        })
    );
    return;
  }

  // Stale-While-Revalidate for static assets
  const isStaticAsset =
    url.pathname.includes('/assets/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.woff2');

  if (isStaticAsset) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              const cloned = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
            }
            return networkResponse;
          })
          .catch(() => {
            // Ignore fetch failures for static resources when offline
          });
        return cachedResponse || fetchPromise;
      })
    );
  }
});

// ---------------------------------------------------------------------------
// Push notification (Web Push)
// ---------------------------------------------------------------------------
// Backend mengirim payload JSON: { title, body, url, tag, data }. Kalau tidak
// ada payload, fallback ke judul generik supaya notifikasi tetap muncul.
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'SIAGA', body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'SIAGA';
  const options = {
    body: payload.body || 'Ada pembaruan baru di SIAGA.',
    icon: '/web-app-manifest-192x192.png',
    badge: '/favicon-96x96.png',
    tag: payload.tag || undefined,
    renotify: !!payload.tag,
    data: { url: payload.url || '/' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Klik notifikasi: buka/fokus tab aplikasi di URL tujuan. Kalau aplikasi belum
// terbuka, URL dibuka di tab baru.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return clients.openWindow(target);
    })
  );
});

// Dipakai oleh aplikasi untuk memicu aktivasi versi baru tanpa reload penuh.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
