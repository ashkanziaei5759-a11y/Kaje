import 'server-only';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getSession, type SessionUser } from './session';
import { hasPermission, type Permission } from './permissions';

export class AuthError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Confirms the token's subject still exists and is still active.
 *
 * A JWT is valid for its full lifetime whatever happens to the account behind
 * it, so without this check a deactivated employee keeps working access until
 * the token expires — and a token issued before a database reset points at rows
 * that are gone, surfacing as a 500 rather than a login prompt.
 *
 * Permissions are re-read from the role here too, so revoking a permission
 * takes effect on the next request instead of the next sign-in.
 */
export async function getLiveSession(): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findFirst({
    where: { id: session.userId, isActive: true },
    include: { role: true },
  });
  if (!user) return null;

  return {
    ...session,
    restaurantId: user.restaurantId,
    branchId: user.branchId,
    role: user.role.name,
    permissions: user.role.permissions,
  };
}

/** For server components: bounce to the login page when unauthenticated. */
export async function requireUser(): Promise<SessionUser> {
  const session = await getLiveSession();
  // The stale cookie is deliberately NOT cleared here: a Server Component
  // cannot mutate cookies during render, and attempting it throws. The login
  // page performs the same live check, so it renders the form rather than
  // bouncing back here, and the next successful sign-in overwrites the cookie.
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
  const session = await getLiveSession();
  if (!session) throw new AuthError('Authentication required', 401);
  if (permission && !hasPermission(session.permissions, permission)) {
    throw new AuthError('Insufficient permissions', 403);
  }
  return session;
}
