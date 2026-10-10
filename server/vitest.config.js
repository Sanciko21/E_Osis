import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: { NODE_ENV: 'test' },
    include: ['tests/**/*.test.js'],
    globalSetup: ['./tests/setup/globalSetup.js'],
    setupFiles: ['./tests/setup/perFile.js'],
    // Seluruh file tes integrasi memakai satu database tes yang sama: jalankan berurutan.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
