import { env } from '../src/config/env';

export function originHeaders(): { origin: string } {
  return { origin: env.primaryCorsOrigin };
}
