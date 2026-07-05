import type { FastifyInstance } from 'fastify';
import {
  changePasswordBodySchema,
  loginBodySchema,
  requestPasswordResetBodySchema,
  resendOtpBodySchema,
  resetPasswordBodySchema,
  signUpBodySchema,
  verifyOtpBodySchema,
} from '@script/shared';
import { authRateLimitConfig } from '../../app';
import { requireAuth } from '../../plugins/auth';
import * as authService from './auth-service';

export async function authRoutes(app: FastifyInstance) {
  const limit = { config: { rateLimit: authRateLimitConfig } };

  app.post('/auth/signup', limit, async (request) => {
    const body = signUpBodySchema.parse(request.body);
    return authService.signUp(body);
  });

  app.post('/auth/login', limit, async (request, reply) => {
    const body = loginBodySchema.parse(request.body);
    return authService.login(body, request, reply);
  });

  app.post('/auth/verify-otp', limit, async (request, reply) => {
    const body = verifyOtpBodySchema.parse(request.body);
    return authService.verifyOtp(body, request, reply);
  });

  app.post('/auth/resend-otp', limit, async (request) => {
    const body = resendOtpBodySchema.parse(request.body);
    return authService.resendOtp(body);
  });

  app.post('/auth/forgot-password', limit, async (request) => {
    const body = requestPasswordResetBodySchema.parse(request.body);
    return authService.requestPasswordReset(body);
  });

  app.post('/auth/reset-password', limit, async (request, reply) => {
    const body = resetPasswordBodySchema.parse(request.body);
    return authService.resetPassword(body, request, reply);
  });

  app.post('/auth/refresh', async (request, reply) => authService.refreshSession(request, reply));

  app.post('/auth/logout', async (request, reply) => authService.logout(request, reply));

  app.get('/auth/me', async (request) => {
    const user = await requireAuth(request);
    return authService.getMe(user.id);
  });

  app.post('/auth/change-password', limit, async (request) => {
    const user = await requireAuth(request);
    const body = changePasswordBodySchema.parse(request.body);
    return authService.changePassword(user.id, body);
  });
}
