import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'vitest/config';

loadEnv({ path: '.env' });

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      CORS_ORIGIN: 'http://localhost:5173',
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5432/test',
      DIRECT_URL:
        process.env.DIRECT_URL ??
        process.env.DATABASE_URL ??
        'postgresql://test:test@localhost:5432/test',
      STORAGE_DRIVER: process.env.STORAGE_DRIVER ?? 'uploadthing',
      UPLOADTHING_TOKEN: process.env.UPLOADTHING_TOKEN ?? 'test-token',
      JWT_SECRET: process.env.JWT_SECRET ?? 'test-jwt-secret-with-at-least-32-chars!!',
      ALLOW_INLINE_INGESTION: 'true',
    },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
