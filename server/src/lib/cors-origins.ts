/**
 * Parse CORS_ORIGIN into an allowlist.
 * Supports a single origin or comma-separated list (e.g. multiple Vite ports).
 */
export function parseCorsOrigins(raw: string): string[] {
  const origins = raw
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (origins.length === 0) {
    throw new Error('CORS_ORIGIN must list at least one origin');
  }
  return [...new Set(origins)];
}

export function isAllowedCorsOrigin(origin: string, allowed: readonly string[]): boolean {
  return allowed.includes(origin);
}

export function isAllowedCorsReferer(referer: string, allowed: readonly string[]): boolean {
  return allowed.some((origin) => referer === origin || referer.startsWith(`${origin}/`));
}
