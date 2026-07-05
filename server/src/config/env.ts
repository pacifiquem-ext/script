import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    HOST: z.string().default('0.0.0.0'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),

    DATABASE_URL: z
      .string()
      .min(1, 'DATABASE_URL is required (Neon Postgres pooled connection string)'),
    DIRECT_URL: z.string().optional(),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    TOKEN_ENCRYPTION_KEY: z
      .string()
      .min(32, 'TOKEN_ENCRYPTION_KEY must be at least 32 characters')
      .optional(),

    STORAGE_DRIVER: z.enum(['uploadthing', 's3']).default('uploadthing'),
    UPLOADTHING_TOKEN: z.string().optional(),
    S3_ENDPOINT: z.string().optional(),
    S3_REGION: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),

    MAX_UPLOAD_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(25 * 1024 * 1024),

    REDIS_URL: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    VOYAGE_API_KEY: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().email().optional(),
    UNSTRUCTURED_API_KEY: z.string().optional(),
    UNSTRUCTURED_API_URL: z.string().url().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.STORAGE_DRIVER === 'uploadthing' && !value.UPLOADTHING_TOKEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['UPLOADTHING_TOKEN'],
        message: 'UPLOADTHING_TOKEN is required when STORAGE_DRIVER=uploadthing',
      });
    }
    if (value.STORAGE_DRIVER === 's3') {
      const required = [
        'S3_ENDPOINT',
        'S3_REGION',
        'S3_BUCKET',
        'S3_ACCESS_KEY_ID',
        'S3_SECRET_ACCESS_KEY',
      ] as const;
      for (const key of required) {
        if (!value[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when STORAGE_DRIVER=s3 (e.g. self-hosted Garage or any S3-compatible store)`,
          });
        }
      }
    }
    if (value.NODE_ENV === 'production' && !value.TOKEN_ENCRYPTION_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TOKEN_ENCRYPTION_KEY'],
        message: 'TOKEN_ENCRYPTION_KEY is required in production (encrypt OAuth tokens at rest)',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Invalid environment configuration:\n${message}\n\nSee ENV.md and server/.env.example.`,
    );
  }
  return parsed.data;
}

export const env = loadEnv();
