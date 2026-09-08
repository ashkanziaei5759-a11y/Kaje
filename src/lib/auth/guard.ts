import 'server-only';
import { redirect } from 'next/navigation';
import { getSession, type SessionUser } from './session';
import { hasPermission, type Permission } from './permissions';

export class AuthError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'AuthError';
  }
}

/** For server components: bounce to the login page when unauthenticated. */
export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}

export async function requirePermission(permission: Permission | Permission[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasPermission(user.permissions, permission)) {
    throw new AuthError('You do not have permission to perform this action', 403);
  }
  return user;
}

/** For route handlers: throw instead of redirecting, so we can return JSON. */
export async function requireApiUser(permission?: Permission | Permission[]): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new AuthError('Authentication required', 401);
  if (permission && !hasPermission(session.permissions, permission)) {
    throw new AuthError('Insufficient permissions', 403);
  }
  return session;
}
