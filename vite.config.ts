import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

// Vite builds the React app in web/ into dist/, which wrangler.jsonc serves as static assets.
// In dev, Vite serves the app with hot reload and forwards /api/* to `wrangler dev` (the Worker).
export default defineConfig({
    root: 'web',
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: { '@': fileURLToPath(new URL('./web/src', import.meta.url)) },
    },
    build: { outDir: '../dist', emptyOutDir: true },
    server: {
        proxy: { '/api': 'http://localhost:8787' },
    },
});
