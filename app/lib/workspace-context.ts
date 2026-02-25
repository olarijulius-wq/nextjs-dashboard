import 'server-only';

import {
  ensureWorkspaceContextForCurrentUser,
  type WorkspaceRole,
} from '@/app/lib/workspaces';

export type ResolvedWorkspaceContext = {
  userId: string;
  userEmail: string;
  workspaceId: string;
  workspaceName: string;
  role: WorkspaceRole;
};

export class WorkspaceContextError extends Error {
  code: 'UNAUTHORIZED' | 'FORBIDDEN';
  status: 401 | 403;

  constructor(code: 'UNAUTHORIZED' | 'FORBIDDEN', message: string) {
    super(message);
    this.code = code;
    this.status = code === 'UNAUTHORIZED' ? 401 : 403;
  }
}

export function isWorkspaceContextError(error: unknown): error is WorkspaceContextError {
  return error instanceof WorkspaceContextError;
}

export async function requireWorkspaceContext(): Promise<ResolvedWorkspaceContext> {
  try {
    const context = await ensureWorkspaceContextForCurrentUser();
    return {
      userId: context.userId,
      userEmail: context.userEmail,
      workspaceId: context.workspaceId,
      workspaceName: context.workspaceName,
      role: context.userRole,
    };
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      throw new WorkspaceContextError('UNAUTHORIZED', 'Unauthorized');
    }
    throw error;
  }
}

export async function requireWorkspaceRole(
  roles: WorkspaceRole[],
): Promise<ResolvedWorkspaceContext> {
  const context = await requireWorkspaceContext();
  if (!roles.includes(context.role)) {
    throw new WorkspaceContextError(
      'FORBIDDEN',
      'You do not have access to this workspace resource.',
    );
  }
  return context;
}
