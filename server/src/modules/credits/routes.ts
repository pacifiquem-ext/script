import type { FastifyInstance } from 'fastify';
import { requireWorkspace } from '../../plugins/auth';
import * as credits from './credits-service';

export async function creditsRoutes(app: FastifyInstance) {
  app.get('/credits', async (request) => {
    const { workspace } = await requireWorkspace(request);
    return credits.getBalance(workspace.id);
  });
}
