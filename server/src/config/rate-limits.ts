export const authRateLimitConfig = {
  max: 10,
  timeWindow: '1 minute',
} as const;

export const chatMessageRateLimitConfig = {
  max: 20,
  timeWindow: '1 minute',
} as const;

export const backfillRateLimitConfig = {
  max: 5,
  timeWindow: '1 minute',
} as const;
