/**
 * Stateless JWT sessions in an httpOnly cookie.
 *
 * Signed with HS256 via `jose`. The secret is required — there is deliberately
 * no development fallback, because a default secret that reaches production is
 * an authentication bypass.
 */
import 'server-only';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { DEMO_MODE } from '@/lib/db';

const COOKIE_NAME = 'kajeh_session';
const SESSION_DURATION_SECONDS = 60 * 60 * 12; // 12 hours
const BCRYPT_ROUNDS = 12;

export interface SessionUser {
  userId: string;
  email: string;
  name: string;
  restaurantId: string;
  branchId: string | null;
  role: string;
  permissions: string[];
}

/**
 * The demo build has no way to receive an AUTH_SECRET and no secret worth
 * keeping: its credentials are published on the landing page and its database
 * is thrown away when the instance is recycled. A fixed key keeps sessions
 * valid across serverless instances, which a random per-instance key would not.
 *
 * This can only ever apply when DEMO_MODE is on, and DEMO_MODE requires that no
 * DATABASE_URL exists — so a deployment holding real data cannot reach it. Such
 * a deployment still fails loudly if its AUTH_SECRET is missing.
 */
const DEMO_SECRET = 'kajeh-demo-build-signing-key-not-a-secret-0000';

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET ?? (DEMO_MODE ? DEMO_SECRET : undefined);
  if (!secret || secret.length < 32) {
    throw new Error(
      'AUTH_SECRET is missing or shorter than 32 characters. ' +
        'Generate one with: openssl rand -base64 32',
    );
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user } as unknown as JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .setSubject(user.userId)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
    if (!payload.userId || !payload.restaurantId) return null;
    return {
      userId: String(payload.userId),
      email: String(payload.email),
      name: String(payload.name),
      restaurantId: String(payload.restaurantId),
      branchId: payload.branchId ? String(payload.branchId) : null,
      role: String(payload.role),
      permissions: Array.isArray(payload.permissions) ? (payload.permissions as string[]) : [],
    };
  } catch {
    // Expired, tampered, or signed with a rotated secret — all mean "no session".
    return null;
  }
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export { COOKIE_NAME };
