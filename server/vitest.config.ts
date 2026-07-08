import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'vitest/config';

loadEnv({ path: '.env' });
for (const [key, value] of Object.entries(process.env)) {
  if (value === '') delete process.env[key];
}

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.CORS_ORIGIN = 'http://localhost:5173';
process.env.ALLOW_INLINE_INGESTION = 'true';
process.env.STORAGE_DRIVER = process.env.STORAGE_DRIVER || 'uploadthing';
process.env.UPLOADTHING_TOKEN = process.env.UPLOADTHING_TOKEN || 'test-token';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-with-at-least-32-chars!!';
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
}
if (!process.env.DIRECT_URL) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}
delete process.env.REDIS_URL;

export default defineConfig({
  test: {
    include: ['test/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/**', 'dist/**', 'src/**'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'json-summary'],
      reportsDirectory: './coverage',
      // Unit-testable pure modules (integration suites live in test/*.test.ts but do not
      // pull route/service graphs into the 90% gate — those are covered by contract tests).
      include: [
        'src/common/**/*.{ts,tsx}',
        'src/lib/**/*.{ts,tsx}',
        'src/config/rate-limits.ts',
        'src/modules/jobs/extract.ts',
      ],
      exclude: ['src/**/*.d.ts', 'src/lib/logger.ts', '**/node_modules/**', '**/dist/**'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 80,
        statements: 90,
      },
    },
  },
});
