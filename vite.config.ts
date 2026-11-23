import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Gộp toàn bộ JS/CSS vào 1 file dist/index.html (dùng cho cả Apps Script lẫn Vercel).
export default defineConfig(({ command, mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  // Bản build thật phải có khoá API, nếu không app sẽ không đọc được Google Sheet
  if (command === 'build' && env.VITE_DEMO !== '1' && !env.VITE_APP_KEY) {
    throw new Error('Thiếu VITE_APP_KEY (khoá ở ô B1 tab CaiDat). Đặt trong .env.local hoặc biến môi trường Vercel.');
  }
  return {
    plugins: [react(), viteSingleFile()],
    build: { outDir: 'dist', emptyOutDir: true, target: 'es2020' },
  };
});
