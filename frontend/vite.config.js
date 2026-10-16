import{defineConfig}from'vite';import react from'@vitejs/plugin-react';import tailwindcss from'@tailwindcss/vite';
export default defineConfig({plugins:[react(),tailwindcss()],server:{port:5173,host:'127.0.0.1',proxy:{'/api':'http://127.0.0.1:3001','/uploads':'http://127.0.0.1:3001'}},preview:{port:4173,host:'0.0.0.0'}});
