import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'src/**'],
    environment: 'node',
    passWithNoTests: true,
  },
});
