import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Saat pengembangan, /api dan /uploads diteruskan ke backend sehingga browser melihat
  // satu origin yang sama (cookie sesi admin SameSite=Strict tetap berfungsi).
  const apiTarget = env.DEV_API_PROXY_TARGET || 'http://127.0.0.1:4000';
  const proxy = {
    '/api': { target: apiTarget, changeOrigin: false },
    '/uploads': { target: apiTarget, changeOrigin: false },
  };

  return {
    plugins: [react()],
    server: { port: 5173, strictPort: true, proxy },
    preview: { port: 4173, strictPort: true, proxy },
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            charts: ['chart.js', 'react-chartjs-2'],
            motion: ['gsap', 'aos'],
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.js'],
      include: ['src/**/*.test.{js,jsx}'],
      css: false,
      clearMocks: true,
      restoreMocks: true,
      // Tes navigasi antarhalaman (lazy route + animasi) bisa > 5 dtk saat cache masih dingin.
      testTimeout: 15_000,
    },
  };
});
