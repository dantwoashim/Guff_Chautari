import type { WorkspaceRole } from './types';

export type WorkspacePermission =
  | 'workspace.read'
  | 'workspace.settings.manage'
  | 'workspace.delete'
  | 'workspace.billing.manage'
  | 'workspace.members.read'
  | 'workspace.members.invite'
  | 'workspace.members.remove'
  | 'workspace.members.roles.manage'
  | 'workspace.conversations.read'
  | 'workspace.conversations.write'
  | 'workspace.knowledge.read'
  | 'workspace.knowledge.write'
  | 'workspace.knowledge.share'
  | 'workspace.memory.read'
  | 'workspace.memory.write'
  | 'workspace.memory.consolidate'
  | 'workspace.pipeline.run'
  | 'workspace.workflows.read'
  | 'workspace.workflows.write'
  | 'workspace.workflows.run';

const roleRank: Record<WorkspaceRole, number> = {
  viewer: 1,
  member: 2,
  admin: 3,
  owner: 4,
};

const rolePermissionMatrix: Record<WorkspaceRole, WorkspacePermission[]> = {
  owner: [
    'workspace.read',
    'workspace.settings.manage',
    'workspace.delete',
    'workspace.billing.manage',
    'workspace.members.read',
    'workspace.members.invite',
    'workspace.members.remove',
    'workspace.members.roles.manage',
    'workspace.conversations.read',
    'workspace.conversations.write',
    'workspace.knowledge.read',
    'workspace.knowledge.write',
    'workspace.knowledge.share',
    'workspace.memory.read',
    'workspace.memory.write',
    'workspace.memory.consolidate',
    'workspace.pipeline.run',
    'workspace.workflows.read',
    'workspace.workflows.write',
    'workspace.workflows.run',
  ],
  admin: [
    'workspace.read',
    'workspace.settings.manage',
    'workspace.members.read',
    'workspace.members.invite',
    'workspace.members.remove',
    'workspace.members.roles.manage',
    'workspace.conversations.read',
    'workspace.conversations.write',
    'workspace.knowledge.read',
    'workspace.knowledge.write',
    'workspace.knowledge.share',
    'workspace.memory.read',
    'workspace.memory.write',
    'workspace.memory.consolidate',
    'workspace.pipeline.run',
    'workspace.workflows.read',
    'workspace.workflows.write',
    'workspace.workflows.run',
  ],
  member: [
    'workspace.read',
    'workspace.members.read',
    'workspace.conversations.read',
    'workspace.conversations.write',
    'workspace.knowledge.read',
    'workspace.knowledge.write',
    'workspace.memory.read',
    'workspace.memory.write',
    'workspace.memory.consolidate',
    'workspace.pipeline.run',
    'workspace.workflows.read',
    'workspace.workflows.write',
    'workspace.workflows.run',
  ],
  viewer: [
    'workspace.read',
    'workspace.members.read',
    'workspace.conversations.read',
    'workspace.knowledge.read',
    'workspace.memory.read',
    'workspace.workflows.read',
  ],
};

const rolePermissions = Object.fromEntries(
  Object.entries(rolePermissionMatrix).map(([role, permissions]) => [role, new Set(permissions)])
) as Record<WorkspaceRole, Set<WorkspacePermission>>;

const membershipActionSet = new Set<WorkspacePermission>([
  'workspace.members.invite',
  'workspace.members.remove',
  'workspace.members.roles.manage',
]);

export interface WorkspacePermissionContext {
  workspaceId: string;
  actorUserId: string;
  actorRole: WorkspaceRole;
  action: WorkspacePermission;
  workspaceOwnerUserId?: string;
  targetUserId?: string;
  targetRole?: WorkspaceRole;
}

export interface WorkspacePermissionResult {
  allowed: boolean;
  reason: string;
}

export const getWorkspacePermissionsForRole = (role: WorkspaceRole): WorkspacePermission[] => [
  ...rolePermissionMatrix[role],
];

export const hasWorkspacePermission = (role: WorkspaceRole, action: WorkspacePermission): boolean =>
  rolePermissions[role].has(action);

const evaluateMembershipHierarchy = (context: WorkspacePermissionContext): WorkspacePermissionResult | null => {
  if (!membershipActionSet.has(context.action)) return null;
  if (!context.targetRole && !context.targetUserId) return null;

  if (context.targetRole === 'owner' || context.targetUserId === context.workspaceOwnerUserId) {
    return {
      allowed: false,
      reason: 'Workspace owner membership cannot be modified.',
    };
  }

  if (context.targetRole && context.actorRole !== 'owner') {
    if (roleRank[context.actorRole] <= roleRank[context.targetRole]) {
      return {
        allowed: false,
        reason: 'Insufficient role level for membership action.',
      };
    }
  }

  if (
    context.action === 'workspace.members.roles.manage' &&
    context.targetUserId === context.actorUserId
  ) {
    return {
      allowed: false,
      reason: 'Users cannot change their own workspace role.',
    };
  }

  return null;
};

export const evaluateWorkspacePermission = (
  context: WorkspacePermissionContext
): WorkspacePermissionResult => {
  if (!hasWorkspacePermission(context.actorRole, context.action)) {
    return {
      allowed: false,
      reason: `Role ${context.actorRole} cannot perform ${context.action}.`,
    };
  }

  const membershipResult = evaluateMembershipHierarchy(context);
  if (membershipResult) return membershipResult;

  return {
    allowed: true,
    reason: 'allowed',
  };
};

export const assertWorkspacePermission = (context: WorkspacePermissionContext): void => {
  const result = evaluateWorkspacePermission(context);
  if (!result.allowed) {
    throw new Error(result.reason);
  }
};

interface WorkspacePermissionMiddlewareOptions {
  resolveActorRole: (payload: { workspaceId: string; userId: string }) => Promise<WorkspaceRole | null> | WorkspaceRole | null;
  resolveWorkspaceOwnerUserId?: (workspaceId: string) => Promise<string | null> | string | null;
}

interface WorkspacePermissionGuardInput {
  workspaceId: string;
  actorUserId: string;
  action: WorkspacePermission;
  targetUserId?: string;
  targetRole?: WorkspaceRole;
}

export class WorkspacePermissionMiddleware {
  private readonly resolveActorRole: WorkspacePermissionMiddlewareOptions['resolveActorRole'];
  private readonly resolveWorkspaceOwnerUserId?: WorkspacePermissionMiddlewareOptions['resolveWorkspaceOwnerUserId'];

  constructor(options: WorkspacePermissionMiddlewareOptions) {
    this.resolveActorRole = options.resolveActorRole;
    this.resolveWorkspaceOwnerUserId = options.resolveWorkspaceOwnerUserId;
  }

  async require(input: WorkspacePermissionGuardInput): Promise<void> {
    const actorRole = await this.resolveActorRole({
      workspaceId: input.workspaceId,
      userId: input.actorUserId,
    });
    if (!actorRole) {
      throw new Error(`User ${input.actorUserId} is not a member of workspace ${input.workspaceId}.`);
    }

    const workspaceOwnerUserId = this.resolveWorkspaceOwnerUserId
      ? await this.resolveWorkspaceOwnerUserId(input.workspaceId)
      : undefined;

    assertWorkspacePermission({
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      actorRole,
      action: input.action,
      targetUserId: input.targetUserId,
      targetRole: input.targetRole,
      workspaceOwnerUserId: workspaceOwnerUserId ?? undefined,
    });
  }

  async guard<T>(input: WorkspacePermissionGuardInput, operation: () => Promise<T> | T): Promise<T> {
    await this.require(input);
    return operation();
  }
}
