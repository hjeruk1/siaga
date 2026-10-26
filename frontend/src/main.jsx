import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// Tangkap beforeinstallprompt SESEGGERA mungkin, sebelum React mount. Event
// ini hanya muncul sekali per halaman dan seringkali sudah lewat sebelum
// orang tua selesai login — kalau tidak ditangkap di sini, tombol "Pasang"
// tidak akan pernah punya event untuk dipanggil.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__siagaInstallPrompt = e;
});

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => console.log('Service Worker registered successfully:', reg.scope))
      .catch((err) => console.error('Service Worker registration failed:', err));
  });
}
