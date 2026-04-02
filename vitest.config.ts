import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/testing/setupTests.ts'],
    css: true,
    include: ['src/testing/unit/**/*.test.ts?(x)'],
    exclude: ['src/testing/e2e/**'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
