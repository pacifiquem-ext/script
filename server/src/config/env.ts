import { z } from 'zod';
import { parseCorsOrigins } from '../lib/cors-origins';

const emptyToUndefined = (value: unknown) =>
  value === undefined || value === null || value === '' ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());
const optionalEmail = z.preprocess(emptyToUndefined, z.string().email().optional());
const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional());
const optionalSecret = z.preprocess(
  emptyToUndefined,
  z.string().min(32, 'must be at least 32 characters').optional(),
);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    HOST: z.string().default('0.0.0.0'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    // Single origin or comma-separated allowlist (e.g. http://localhost:5173,http://localhost:5174)
    CORS_ORIGIN: z
      .string()
      .default(
        'http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174',
      ),

    DATABASE_URL: z
      .string()
      .min(1, 'DATABASE_URL is required (Neon Postgres pooled connection string)'),
    DIRECT_URL: optionalString,

    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    TOKEN_ENCRYPTION_KEY: optionalSecret,

    STORAGE_DRIVER: z.enum(['uploadthing', 's3']).default('uploadthing'),
    UPLOADTHING_TOKEN: optionalString,
    S3_ENDPOINT: optionalString,
    S3_REGION: optionalString,
    S3_BUCKET: optionalString,
    S3_ACCESS_KEY_ID: optionalString,
    S3_SECRET_ACCESS_KEY: optionalString,
    S3_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),

    MAX_UPLOAD_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(25 * 1024 * 1024),

    REDIS_URL: optionalString,
    ANTHROPIC_API_KEY: optionalString,
    VOYAGE_API_KEY: optionalString,
    RESEND_API_KEY: optionalString,
    EMAIL_FROM: optionalEmail,
    UNSTRUCTURED_API_KEY: optionalString,
    UNSTRUCTURED_API_URL: optionalUrl,
    ALLOW_INLINE_INGESTION: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),

    // Cloud OAuth (integrations §9) — each provider is optional until you connect it
    OAUTH_REDIRECT_URL: optionalUrl,
    APP_PUBLIC_URL: optionalUrl,
    GOOGLE_DRIVE_CLIENT_ID: optionalString,
    GOOGLE_DRIVE_CLIENT_SECRET: optionalString,
    DROPBOX_CLIENT_ID: optionalString,
    DROPBOX_CLIENT_SECRET: optionalString,
    ONEDRIVE_CLIENT_ID: optionalString,
    ONEDRIVE_CLIENT_SECRET: optionalString,
    BOX_CLIENT_ID: optionalString,
    BOX_CLIENT_SECRET: optionalString,
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
    if (value.NODE_ENV === 'production') {
      if (!value.TOKEN_ENCRYPTION_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['TOKEN_ENCRYPTION_KEY'],
          message: 'TOKEN_ENCRYPTION_KEY is required in production (encrypt OAuth tokens at rest)',
        });
      }
      if (!value.VOYAGE_API_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['VOYAGE_API_KEY'],
          message: 'VOYAGE_API_KEY is required in production',
        });
      }
      if (!value.ANTHROPIC_API_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ANTHROPIC_API_KEY'],
          message: 'ANTHROPIC_API_KEY is required in production',
        });
      }
      if (!value.REDIS_URL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['REDIS_URL'],
          message: 'REDIS_URL is required in production (BullMQ worker topology)',
        });
      }
    }

    const anyOAuth =
      value.GOOGLE_DRIVE_CLIENT_ID ||
      value.DROPBOX_CLIENT_ID ||
      value.ONEDRIVE_CLIENT_ID ||
      value.BOX_CLIENT_ID;
    if (anyOAuth && !value.OAUTH_REDIRECT_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OAUTH_REDIRECT_URL'],
        message: 'OAUTH_REDIRECT_URL is required when any cloud OAuth client ID is set',
      });
    }
    if (anyOAuth && !value.TOKEN_ENCRYPTION_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['TOKEN_ENCRYPTION_KEY'],
        message: 'TOKEN_ENCRYPTION_KEY is required when cloud OAuth is configured',
      });
    }
  });

export type Env = z.infer<typeof envSchema> & {
  /** Parsed CORS_ORIGIN allowlist (no trailing slashes). */
  corsOrigins: string[];
  /** First allowlisted origin — used as SPA public URL fallback. */
  primaryCorsOrigin: string;
};

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
  const corsOrigins = parseCorsOrigins(parsed.data.CORS_ORIGIN);
  return {
    ...parsed.data,
    corsOrigins,
    primaryCorsOrigin: corsOrigins[0]!,
  };
}

export const env = loadEnv();

export function requireVoyageApiKey(): string {
  if (!env.VOYAGE_API_KEY) {
    throw new Error(
      'VOYAGE_API_KEY is not configured. Set it in server/.env before running ingestion or chat retrieval.',
    );
  }
  return env.VOYAGE_API_KEY;
}

export function requireAnthropicApiKey(): string {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY is not configured. Set it in server/.env before using chat.',
    );
  }
  return env.ANTHROPIC_API_KEY;
}
