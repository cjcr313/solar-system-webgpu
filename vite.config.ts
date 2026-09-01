import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/solar-system-webgpu/',
  plugins: [tailwindcss()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4096
  },
  server: {
    port: 5173
  }
});
