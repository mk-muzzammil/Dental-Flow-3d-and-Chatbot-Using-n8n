import 'server-only';
import { SignJWT, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';
import { AppError, required } from '../config';

function key() {
  const secret = required('JWT_SECRET');
  if (Buffer.byteLength(secret) < 32) throw new AppError('weak_jwt_secret');
  return new TextEncoder().encode(secret);
}
export const ACCESS_COOKIE = 'df_admin_access';
export const REFRESH_COOKIE = 'df_admin_refresh';
export const CSRF_COOKIE = 'df_admin_csrf';
export async function signAccess(sessionId: string) {
  return new SignJWT({ role: 'admin', sid: sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('owner')
    .setIssuer('dentalflow')
    .setAudience('dentalflow-admin')
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(key());
}
export async function verifyAccess(token: string) {
  try {
    const { payload } = await jwtVerify(token, key(), {
      algorithms: ['HS256'],
      issuer: 'dentalflow',
      audience: 'dentalflow-admin',
      requiredClaims: ['exp', 'iat', 'sub', 'jti'],
    });
    if (payload.sub !== 'owner' || payload.role !== 'admin' || typeof payload.sid !== 'string')
      throw new Error('claims');
    return { sessionId: payload.sid };
  } catch {
    throw new AppError('unauthorized', 401);
  }
}
