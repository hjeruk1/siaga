import React from'react';import ReactDOM from'react-dom/client';import'./index.css';import App from'./App';
ReactDOM.createRoot(document.getElementById('root')).render(<App/>);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Service Worker registered successfully:', reg.scope))
      .catch(err => console.error('Service Worker registration failed:', err));
  });
}