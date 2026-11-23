import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Gộp toàn bộ JS/CSS vào 1 file dist/index.html để Apps Script phục vụ.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2020' },
});
