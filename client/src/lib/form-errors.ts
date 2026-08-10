import { ApiClientError } from '@script/shared';
import { ZodError } from 'zod';

export function getErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof ApiClientError) return humanizeExternalMessage(error.message, fallback);
  if (error instanceof ZodError) return error.errors[0]?.message ?? fallback;
  if (error instanceof Error) return humanizeExternalMessage(error.message, fallback);
  return fallback;
}

/** Strip provider JSON dumps (GitHub 401 bodies) down to a short user-facing line. */
export function humanizeExternalMessage(message: string, fallback: string): string {
  const trimmed = message.trim();
  if (!trimmed) return fallback;
  const jsonStart = Math.min(
    ...['{', '['].map((ch) => {
      const i = trimmed.indexOf(ch);
      return i === -1 ? Number.POSITIVE_INFINITY : i;
    }),
  );
  if (Number.isFinite(jsonStart)) {
    try {
      const parsed = JSON.parse(trimmed.slice(jsonStart)) as {
        message?: unknown;
        error?: unknown;
        error_description?: unknown;
      };
      if (typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message.trim();
      if (typeof parsed.error_description === 'string' && parsed.error_description.trim()) {
        return parsed.error_description.trim();
      }
      if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error.trim();
    } catch {
      /* keep original if suffix is not valid JSON */
    }
  }
  if (trimmed.length > 280) return fallback;
  return trimmed;
}
