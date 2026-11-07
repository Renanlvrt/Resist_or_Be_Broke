import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        product: resolve(__dirname, 'product.html'),
        checkout: resolve(__dirname, 'checkout.html'),
      },
    },
  },
});
