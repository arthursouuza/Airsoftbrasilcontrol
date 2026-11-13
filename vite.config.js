import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  plugins: [{ name: 'bundle-existing-demo', transformIndexHtml: { order: 'pre', handler(html) { return html.replace('<script src="app.js" defer>', '<script type="module" src="app.js">'); } } }],
  build: { rollupOptions: { input: { demo: 'index.html', connected: 'connected.html' } } }
});
