import { ApiClientError } from '@script/shared';
import { ZodError } from 'zod';

export function getErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof ZodError) return error.errors[0]?.message ?? fallback;
  if (error instanceof Error) return error.message;
  return fallback;
}
