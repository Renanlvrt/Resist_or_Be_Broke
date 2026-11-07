// Builds the MV3 extension into dist/: content.js (IIFE, React + inline CSS) and background.js.
// Load dist/ via chrome://extensions → Developer mode → Load unpacked.
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { build } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');
const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:3000';

const entries = [
  { name: 'content', entry: 'src/content/main.tsx', publicDir: 'public', empty: true },
  { name: 'background', entry: 'src/background.ts', publicDir: false, empty: false },
];

for (const e of entries) {
  await build({
    root,
    configFile: false,
    logLevel: 'warn',
    plugins: [react()],
    publicDir: e.publicDir,
    define: {
      'process.env.NODE_ENV': JSON.stringify(watch ? 'development' : 'production'),
      __BACKEND_URL__: JSON.stringify(backendUrl),
    },
    build: {
      outDir: 'dist',
      emptyOutDir: e.empty,
      minify: !watch,
      sourcemap: watch ? 'inline' : false,
      watch: watch ? {} : null,
      lib: { entry: resolve(root, e.entry), formats: ['iife'], name: `rob_${e.name}`, fileName: () => `${e.name}.js` },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  });
  console.log(`built dist/${e.name}.js`);
}
