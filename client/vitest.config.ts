import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@script/shared': fileURLToPath(new URL('../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['src/test/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'src/components/**', 'src/lib/**', 'src/pages/**'],
    environment: 'jsdom',
    passWithNoTests: false,
  },
});
