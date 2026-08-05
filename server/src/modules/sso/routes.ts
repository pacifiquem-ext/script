import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SIGNUP_CREDIT_GRANT } from '@script/shared';
import { env } from '../../config/env';
import { BadRequestError, ConfigurationError, UnauthorizedError } from '../../common/errors';
import { prisma } from '../../db/prisma';
import { hashPassword } from '../../lib/password';
import { issueSession } from '../auth/auth-service';
import { recordAudit } from '../audit/audit-service';

const stateCookie = 'script_oidc_state';

function ssoEnabled(): boolean {
  return Boolean(
    env.OIDC_ISSUER && env.OIDC_CLIENT_ID && env.OIDC_CLIENT_SECRET && env.OIDC_REDIRECT_URL,
  );
}

async function discover() {
  if (!env.OIDC_ISSUER) throw new ConfigurationError('OIDC not configured');
  const url = `${env.OIDC_ISSUER.replace(/\/$/, '')}/.well-known/openid-configuration`;
  const res = await fetch(url);
  if (!res.ok) throw new ConfigurationError(`OIDC discovery failed: ${res.status}`);
  return (await res.json()) as {
    authorization_endpoint: string;
    token_endpoint: string;
    userinfo_endpoint?: string;
  };
}

export async function ssoRoutes(app: FastifyInstance) {
  app.get('/auth/sso/status', async () => ({
    enabled: ssoEnabled(),
    issuer: ssoEnabled() ? env.OIDC_ISSUER : null,
  }));

  app.get('/auth/sso/start', async (request, reply) => {
    if (!ssoEnabled()) throw new ConfigurationError('OIDC SSO is not configured');
    const discovery = await discover();
    const state = randomBytes(24).toString('base64url');
    reply.setCookie(stateCookie, state, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      maxAge: 600,
    });
    const params = new URLSearchParams({
      client_id: env.OIDC_CLIENT_ID!,
      redirect_uri: env.OIDC_REDIRECT_URL!,
      response_type: 'code',
      scope: 'openid email profile',
      state,
    });
    return reply.redirect(`${discovery.authorization_endpoint}?${params.toString()}`);
  });

  app.get('/auth/sso/callback', async (request, reply) => {
    if (!ssoEnabled()) throw new ConfigurationError('OIDC SSO is not configured');
    const query = z
      .object({
        code: z.string().min(1),
        state: z.string().min(1),
      })
      .parse(request.query);

    const cookieState = request.cookies[stateCookie];
    reply.clearCookie(stateCookie, { path: '/' });
    if (!cookieState || cookieState !== query.state) {
      throw new UnauthorizedError('Invalid OIDC state');
    }

    const discovery = await discover();
    const tokenRes = await fetch(discovery.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: query.code,
        redirect_uri: env.OIDC_REDIRECT_URL!,
        client_id: env.OIDC_CLIENT_ID!,
        client_secret: env.OIDC_CLIENT_SECRET!,
      }),
    });
    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      throw new BadRequestError(`OIDC token exchange failed: ${body.slice(0, 200)}`);
    }
    const tokens = (await tokenRes.json()) as { access_token?: string; id_token?: string };
    if (!tokens.access_token) throw new BadRequestError('OIDC token response missing access_token');

    let email: string | undefined;
    let name: string | undefined;
    if (discovery.userinfo_endpoint) {
      const ui = await fetch(discovery.userinfo_endpoint, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (ui.ok) {
        const profile = (await ui.json()) as {
          email?: string;
          name?: string;
          preferred_username?: string;
        };
        email = profile.email;
        name = profile.name ?? profile.preferred_username;
      }
    }
    if (!email && tokens.id_token) {
      const payload = tokens.id_token.split('.')[1];
      if (payload) {
        const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
          email?: string;
          name?: string;
        };
        email = json.email;
        name = name ?? json.name;
      }
    }
    if (!email) throw new BadRequestError('OIDC profile did not include email');

    email = email.toLowerCase();
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const randomPass = createHash('sha256').update(randomBytes(32)).digest('hex');
      const passwordHash = await hashPassword(randomPass);
      const displayName = name ?? email.split('@')[0] ?? 'User';
      user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email,
            name: displayName,
            passwordHash,
            emailVerifiedAt: new Date(),
            authProvider: 'oidc',
          },
        });
        const workspace = await tx.workspace.create({
          data: {
            name: `${displayName}'s workspace`,
            plan: 'free',
            members: { create: { userId: created.id, role: 'owner' } },
            creditBalance: { create: { balance: SIGNUP_CREDIT_GRANT } },
            creditLedger: {
              create: {
                userId: created.id,
                delta: SIGNUP_CREDIT_GRANT,
                reason: 'signup_grant',
                note: 'SSO signup grant',
              },
            },
          },
        });
        return tx.user.update({
          where: { id: created.id },
          data: { lastWorkspaceId: workspace.id },
        });
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { authProvider: 'oidc', emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
      });
    }

    await recordAudit({
      actorUserId: user.id,
      action: 'sso.login',
      targetType: 'user',
      targetId: user.id,
      metadata: { email, issuer: env.OIDC_ISSUER },
      ip: request.ip,
    });

    await issueSession(reply, request, user, user.lastWorkspaceId);
    const dest = `${(env.APP_PUBLIC_URL ?? env.primaryCorsOrigin).replace(/\/$/, '')}/app`;
    return reply.redirect(dest);
  });
}
