import { describe, expect, it } from 'vitest';
import { filterAccessibleResourceIds } from '../src/modules/clearance/clearance-service';

describe('clearance filterAccessibleResourceIds', () => {
  it('allows workspace-visible resources within level', async () => {
    const allowed = await filterAccessibleResourceIds({
      principal: {
        userId: 'u1',
        workspaceId: 'w1',
        clearanceLevel: 2,
        role: 'member',
      },
      resourceKind: 'document',
      candidates: [
        { id: 'd1', clearanceLevel: 0, visibility: 'workspace' },
        { id: 'd2', clearanceLevel: 5, visibility: 'workspace' },
      ],
    });
    expect(allowed.has('d1')).toBe(true);
    expect(allowed.has('d2')).toBe(false);
  });

  it('elevates owner past restricted list without needing principal rows', async () => {
    const allowed = await filterAccessibleResourceIds({
      principal: {
        userId: 'owner1',
        workspaceId: 'w1',
        clearanceLevel: 0,
        role: 'owner',
      },
      resourceKind: 'document',
      candidates: [{ id: 'secret-doc', clearanceLevel: 0, visibility: 'restricted' }],
    });
    expect(allowed.has('secret-doc')).toBe(true);
  });

  it('member does not see restricted when candidates empty after level filter', async () => {
    const allowed = await filterAccessibleResourceIds({
      principal: {
        userId: 'u1',
        workspaceId: 'w1',
        clearanceLevel: 0,
        role: 'member',
      },
      resourceKind: 'document',
      candidates: [{ id: 'high', clearanceLevel: 9, visibility: 'workspace' }],
    });
    expect(allowed.size).toBe(0);
  });
});
