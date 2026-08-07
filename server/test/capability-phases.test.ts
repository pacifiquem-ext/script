import { describe, expect, it } from 'vitest';
import {
  getToolDefinitions,
  getToolStatusLabel,
  listRegisteredToolNames,
  registerBuiltinTools,
} from '../src/modules/chat/agent';
import { classifyInventoryIntentHeuristicForTests } from '../src/modules/chat/agent/inventory-intent';
import { buildTranscriptText, secondsToMs } from '../src/modules/meetings/fireflies-client';
import { resolveCommitmentOwner } from '../src/modules/meetings/meeting-service';
import { prisma } from '../src/db/prisma';

describe('tool registry (Phase 1)', () => {
  it('registers library, web, and meeting tools with status labels', () => {
    registerBuiltinTools();
    const names = listRegisteredToolNames();
    expect(names).toEqual(
      expect.arrayContaining([
        'list_library_documents',
        'search_library',
        'web_search',
        'list_meetings',
        'search_meetings',
        'get_meeting_summary',
        'list_workflows',
        'get_workflow',
        'get_my_workflow_progress',
        'complete_workflow_step',
      ]),
    );
    expect(getToolDefinitions().length).toBeGreaterThanOrEqual(7);
    expect(getToolStatusLabel('search_library')).toMatch(/Library/i);
    expect(getToolStatusLabel('search_meetings')).toMatch(/meeting/i);
  });
});

describe('inventory intent classifier (test heuristic only)', () => {
  it('classifies library vs meeting inventory phrases', () => {
    expect(classifyInventoryIntentHeuristicForTests("What's in my library?")).toBe(
      'library_inventory',
    );
    expect(classifyInventoryIntentHeuristicForTests('What meetings do we have?')).toBe(
      'meeting_inventory',
    );
    expect(classifyInventoryIntentHeuristicForTests('What did we decide on the client call?')).toBe(
      'none',
    );
  });
});

describe('Fireflies normalization', () => {
  it('builds speaker-timestamp transcript text', () => {
    const text = buildTranscriptText([
      {
        index: 0,
        speaker_name: 'Ada',
        text: 'We will ship the connector.',
        start_time: 65,
        end_time: 70,
      },
      {
        index: 1,
        speaker_name: 'Ben',
        text: 'Agreed.',
        start_time: 71,
        end_time: 72,
      },
    ]);
    expect(text).toContain('[01:05] Ada:');
    expect(text).toContain('We will ship the connector.');
    expect(secondsToMs(1.5)).toBe(1500);
  });
});

describe('resolveCommitmentOwner (X3)', () => {
  it('matches PersonIdentity displayName/email and workspace member names', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const user = await prisma.user.create({
      data: {
        email: `owner-${suffix}@example.com`,
        name: 'Ada Lovelace',
        passwordHash: 'x',
        emailVerifiedAt: new Date(),
        memberships: {
          create: {
            role: 'owner',
            workspace: { create: { name: 'Owner WS' } },
          },
        },
      },
      include: { memberships: true },
    });
    const workspaceId = user.memberships[0]!.workspaceId;
    await prisma.personIdentity.create({
      data: {
        workspaceId,
        provider: 'slack',
        externalId: `U${suffix}`,
        displayName: 'Ben Bitdiddle',
        email: `ben-${suffix}@example.com`,
        userId: user.id,
      },
    });

    try {
      expect(await resolveCommitmentOwner(workspaceId, null)).toBeNull();
      expect(await resolveCommitmentOwner(workspaceId, '  ')).toBeNull();
      expect(await resolveCommitmentOwner(workspaceId, 'ada lovelace')).toBe(user.id);
      expect(await resolveCommitmentOwner(workspaceId, user.email.toUpperCase())).toBe(user.id);
      expect(await resolveCommitmentOwner(workspaceId, 'BEN BITDIDDLE')).toBe(user.id);
      expect(await resolveCommitmentOwner(workspaceId, `ben-${suffix}@example.com`)).toBe(user.id);
      expect(await resolveCommitmentOwner(workspaceId, 'Nobody Known')).toBeNull();
    } finally {
      await prisma.workspace.delete({ where: { id: workspaceId } });
    }
  });
});
