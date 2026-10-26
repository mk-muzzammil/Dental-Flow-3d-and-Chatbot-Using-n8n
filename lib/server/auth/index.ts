import 'server-only';
import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { collection, initializeDatabase, retentionDate } from '../db';
import { AppError, appUrl, required } from '../config';
import { constantEqual, secretHash, opaqueToken, verifyPassword } from '../security';
import { sameOrigin } from '../http';
import { ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE, signAccess, verifyAccess } from './jwt';

export type AdminSession = {
  _id: string;
  refreshHash: string;
  previousHashes: string[];
  rotatedAt: Date;
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  credentialVersion: string;
};
export const credentialVersion = () =>
  secretHash(`${required('ADMIN_EMAIL').toLowerCase()}\0${required('ADMIN_PASSWORD_HASH')}`);
export const csrfFor = (sid: string) => secretHash(`csrf:${sid}`);
export async function audit(action: string, detail: Record<string, string | boolean> = {}) {
  await (
    await collection('audit_events')
  ).insertOne({ action, detail, at: new Date(), expiresAt: retentionDate() });
}
function validSession(session: AdminSession | null): asserts session is AdminSession {
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= new Date() ||
    !constantEqual(session.credentialVersion, credentialVersion())
  )
    throw new AppError('unauthorized', 401);
}
export async function requireAdmin(request?: Request, mutation = false) {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value || '';
  const { sessionId } = await verifyAccess(token);
  const session = await (await collection<AdminSession>('admin_sessions')).findOne({ _id: sessionId });
  validSession(session);
  if (mutation) {
    if (!request) throw new AppError('forbidden', 403);
    verifyCsrf(request, sessionId);
  }
  return session;
}
export function verifyCsrf(request: Request, sid: string) {
  sameOrigin(request);
  if (!constantEqual(request.headers.get('x-csrf-token') || '', csrfFor(sid)))
    throw new AppError('csrf_failed', 403);
}
type RateBucket = { _id: string; count: number; expiresAt: Date };
export async function login(email: string, password: string, ip: string) {
  await initializeDatabase();
  if (email.length > 254 || password.length > 1024) throw new AppError('invalid_credentials', 401);
  const bucket = Math.floor(Date.now() / 900_000);
  const keys = [`login-ip:${ip}`, `login-account:${required('ADMIN_EMAIL').toLowerCase()}`].map((k) =>
    secretHash(`${k}:${bucket}`),
  );
  const rates = await collection<RateBucket>('auth_rate_limits');
  for (const key of keys) {
    const result = await rates.findOneAndUpdate(
      { _id: key },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(Date.now() + 900_000) } },
      { upsert: true, returnDocument: 'after' },
    );
    if (result && result.count > 5) throw new AppError('too_many_attempts', 429);
  }
  const emailOK = constantEqual(email.trim().toLowerCase(), required('ADMIN_EMAIL').toLowerCase());
  const passwordOK = await verifyPassword(password, required('ADMIN_PASSWORD_HASH'));
  if (!emailOK || !passwordOK) {
    await audit('login_failed');
    throw new AppError('invalid_credentials', 401);
  }
  const id = randomUUID(),
    refresh = `${id}.${opaqueToken()}`;
  const session: AdminSession = {
    _id: id,
    refreshHash: secretHash(refresh),
    previousHashes: [],
    rotatedAt: new Date(),
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 86_400_000),
    credentialVersion: credentialVersion(),
  };
  await (await collection<AdminSession>('admin_sessions')).insertOne(session);
  await rates.deleteMany({ _id: { $in: keys } });
  await audit('login');
  return { session, refresh, access: await signAccess(id) };
}
export async function refreshSession(request: Request) {
  const jar = await cookies(),
    token = jar.get(REFRESH_COOKIE)?.value || '';
  const id = token.split('.')[0];
  if (!id || token.length > 200) throw new AppError('unauthorized', 401);
  const sessions = await collection<AdminSession>('admin_sessions');
  const session = await sessions.findOne({ _id: id });
  validSession(session);
  verifyCsrf(request, id);
  const hash = secretHash(token);
  if (!constantEqual(hash, session.refreshHash)) {
    if (session.previousHashes.includes(hash)) {
      if (Date.now() - session.rotatedAt.getTime() < 10_000) throw new AppError('refresh_conflict', 409);
      await sessions.updateOne({ _id: id }, { $set: { revokedAt: new Date() } });
      await audit('refresh_replay');
    }
    throw new AppError('unauthorized', 401);
  }
  const refresh = `${id}.${opaqueToken()}`;
  const updated = await sessions.findOneAndUpdate(
    { _id: id, refreshHash: hash, revokedAt: { $exists: false } },
    {
      $set: { refreshHash: secretHash(refresh), rotatedAt: new Date() },
      $push: { previousHashes: hash },
    },
    { returnDocument: 'after' },
  );
  if (!updated) throw new AppError('refresh_conflict', 409);
  return { session: updated, refresh, access: await signAccess(id) };
}
export function setSessionCookies(
  response: NextResponse,
  data: { session: AdminSession; refresh: string; access: string },
) {
  const common = { secure: appUrl().startsWith('https:'), sameSite: 'lax' as const };
  response.cookies.set(ACCESS_COOKIE, data.access, { ...common, httpOnly: true, path: '/', maxAge: 900 });
  response.cookies.set(REFRESH_COOKIE, data.refresh, {
    ...common,
    httpOnly: true,
    path: '/api/admin/auth',
    expires: data.session.expiresAt,
  });
  response.cookies.set(CSRF_COOKIE, csrfFor(data.session._id), {
    ...common,
    httpOnly: false,
    path: '/',
    expires: data.session.expiresAt,
  });
}
export function clearSessionCookies(response: NextResponse) {
  for (const [name, path] of [
    [ACCESS_COOKIE, '/'],
    [REFRESH_COOKIE, '/api/admin/auth'],
    [CSRF_COOKIE, '/'],
  ])
    response.cookies.set(name, '', { path, maxAge: 0, httpOnly: name !== CSRF_COOKIE });
}
