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
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-jwt-secret-with-at-least-32-chars!!';
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
  },
});
