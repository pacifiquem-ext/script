import type { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { isAppError } from './errors';

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler(
    (error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) => {
      if (isAppError(error)) {
        request.log.warn({ err: error }, error.message);
        return reply.status(error.statusCode).send({
          error: { code: error.code, message: error.message, details: error.details },
        });
      }

      if (error instanceof ZodError) {
        request.log.warn({ err: error }, 'validation failed');
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: error.flatten() },
        });
      }

      const fastifyError = error as FastifyError;
      if (fastifyError.statusCode && fastifyError.statusCode < 500) {
        return reply.status(fastifyError.statusCode).send({
          error: { code: fastifyError.code ?? 'BAD_REQUEST', message: fastifyError.message },
        });
      }

      request.log.error({ err: error }, 'unhandled error');
      return reply.status(500).send({
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Something went wrong' },
      });
    },
  );

  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    reply.status(404).send({
      error: { code: 'NOT_FOUND', message: `Route ${request.method} ${request.url} not found` },
    });
  });
}
