import type {
  Workspace,
  WorkspaceMember,
  WorkspacePlan,
  WorkspaceRole,
  User,
} from '@prisma/client';
import type { PublicMember, PublicWorkspace } from '@script/shared';

export function toPublicWorkspace(
  workspace: Workspace,
  role: WorkspaceRole,
  extras?: { creditBalance?: number; memberCount?: number },
): PublicWorkspace {
  return {
    id: workspace.id,
    name: workspace.name,
    plan: workspace.plan,
    role,
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
    creditBalance: extras?.creditBalance,
    memberCount: extras?.memberCount,
  };
}

export function toPublicMember(
  member: WorkspaceMember & { user: Pick<User, 'id' | 'email' | 'name'> },
): PublicMember {
  return {
    id: member.id,
    userId: member.user.id,
    email: member.user.email,
    name: member.user.name,
    role: member.role,
    creditShare: member.creditShare,
    clearanceLevel: member.clearanceLevel ?? 0,
    createdAt: member.createdAt.toISOString(),
  };
}

export type { WorkspacePlan };
