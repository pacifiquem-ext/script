import pino from 'pino';
import { env } from '../config/env';

export const pinoOptions: pino.LoggerOptions = {
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        }
      : undefined,
};

export const logger = pino(pinoOptions);
