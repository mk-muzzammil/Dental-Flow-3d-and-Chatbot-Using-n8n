import 'server-only';
import { OAuth2Client, CodeChallengeMethod } from 'google-auth-library';
import { collection, retentionDate } from '../db';
import { appUrl, required, AppError, deadline } from '../config';
import { digest, opaqueToken, encrypt, decrypt, type Ciphertext } from '../security';
import { withLease } from '../operations/lease';
import { audit } from '../auth';
export const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
  'https://www.googleapis.com/auth/gmail.send',
];
type Connection = {
  _id: string;
  subject: string;
  email: string;
  scopes: string[];
  accessToken: Ciphertext;
  refreshToken?: Ciphertext;
  expiresAt: Date;
  status: 'connected' | 'reconnect';
  updatedAt: Date;
};
type Transaction = { _id: string; sessionId: string; nonce: string; verifier: Ciphertext; expiresAt: Date };
function client() {
  const redirect = required('GOOGLE_REDIRECT_URI');
  if (redirect !== `${appUrl()}/api/admin/integrations/google/callback`)
    throw new AppError('invalid_google_redirect_uri');
  return new OAuth2Client({
    clientId: required('GOOGLE_CLIENT_ID'),
    clientSecret: required('GOOGLE_CLIENT_SECRET'),
    redirectUri: redirect,
  });
}
export async function startConnection(sessionId: string) {
  const oauth = client(),
    state = opaqueToken(),
    nonce = opaqueToken();
  const { codeVerifier, codeChallenge } = await oauth.generateCodeVerifierAsync();
  await (
    await collection<Transaction>('oauth_transactions')
  ).insertOne({
    _id: digest(state),
    sessionId,
    nonce,
    verifier: encrypt(codeVerifier, 'oauth-pkce'),
    expiresAt: new Date(Date.now() + 600_000),
  });
  return oauth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
  });
}
export async function finishConnection(sessionId: string, state: string, code: string) {
  if (!state || state.length > 200 || !code || code.length > 4096)
    throw new AppError('invalid_oauth_callback', 400);
  const tx = await (
    await collection<Transaction>('oauth_transactions')
  ).findOneAndDelete({ _id: digest(state), sessionId, expiresAt: { $gt: new Date() } });
  if (!tx) throw new AppError('invalid_oauth_state', 400);
  const oauth = client();
  const { tokens } = await oauth.getToken({ code, codeVerifier: decrypt(tx.verifier, 'oauth-pkce') });
  if (!tokens.id_token || !tokens.access_token) throw new AppError('incomplete_google_tokens');
  const ticket = await oauth.verifyIdToken({
    idToken: tokens.id_token,
    audience: required('GOOGLE_CLIENT_ID'),
  });
  const identity = ticket.getPayload() as ReturnType<typeof ticket.getPayload> & { nonce?: string };
  if (!identity?.sub || !identity.email_verified || !identity.email || identity.nonce !== tx.nonce)
    throw new AppError('invalid_google_identity', 403);
  const scopes = (tokens.scope || '').split(' ');
  if (SCOPES.filter((s) => s.startsWith('https:')).some((s) => !scopes.includes(s)))
    throw new AppError('missing_google_scopes', 400);
  await withLease('google-credentials', async () => {
    const connections = await collection<Connection>('google_connections'),
      existing = await connections.findOne({ _id: 'owner' });
    const refreshToken = tokens.refresh_token
      ? encrypt(tokens.refresh_token, 'google-refresh')
      : existing?.subject === identity.sub
        ? existing.refreshToken
        : undefined;
    if (!refreshToken) throw new AppError('google_offline_access_required', 400);
    await connections.replaceOne(
      { _id: 'owner' },
      {
        subject: identity.sub,
        email: identity.email!,
        scopes,
        accessToken: encrypt(tokens.access_token!, 'google-access'),
        refreshToken,
        expiresAt: new Date(tokens.expiry_date || Date.now() + 3600_000),
        status: 'connected',
        updatedAt: new Date(),
      },
      { upsert: true },
    );
  });
  await (await collection('app_settings')).updateMany({}, { $set: { ready: false } });
  await (await collection('clinic_cache')).deleteMany({});
  await audit('google_connected');
}
export async function connectionStatus() {
  const c = await (await collection<Connection>('google_connections')).findOne({ _id: 'owner' });
  return c
    ? { status: c.status, email: c.email, scopes: c.scopes, updatedAt: c.updatedAt }
    : { status: 'disconnected', scopes: [] };
}
export async function disconnect() {
  await withLease('google-credentials', async () => {
    const connections = await collection<Connection>('google_connections'),
      c = await connections.findOne({ _id: 'owner' });
    if (c) {
      const token = c.refreshToken
        ? decrypt(c.refreshToken, 'google-refresh')
        : decrypt(c.accessToken, 'google-access');
      const result = await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token }),
        signal: deadline(10_000),
      });
      if (!result.ok && result.status !== 400) throw new AppError('google_revoke_failed');
      await connections.deleteOne({ _id: 'owner' });
    }
  });
  await (await collection('app_settings')).updateMany({}, { $set: { ready: false } });
  await audit('google_disconnected');
}
export async function accessToken(signal?: AbortSignal) {
  const connections = await collection<Connection>('google_connections');
  const read = async () => {
    const c = await connections.findOne({ _id: 'owner' });
    if (!c || c.status !== 'connected') throw new AppError('google_reconnect_required');
    return c;
  };
  let c = await read();
  if (c.expiresAt.getTime() > Date.now() + 60_000) return decrypt(c.accessToken, 'google-access');
  // Wait for a competing refresh, then re-read; never issue simultaneous refreshes.
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await withLease(
        'google-credentials',
        async () => {
          c = await read();
          if (c.expiresAt.getTime() > Date.now() + 60_000) return decrypt(c.accessToken, 'google-access');
          if (!c.refreshToken) throw new AppError('google_reconnect_required');
          const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'refresh_token',
              refresh_token: decrypt(c.refreshToken, 'google-refresh'),
              client_id: required('GOOGLE_CLIENT_ID'),
              client_secret: required('GOOGLE_CLIENT_SECRET'),
            }),
            signal: deadline(15_000, signal),
          });
          const data = await response.json();
          if (!response.ok || !data.access_token) {
            if (data.error === 'invalid_grant')
              await connections.updateOne({ _id: 'owner' }, { $set: { status: 'reconnect' } });
            throw new AppError(
              data.error === 'invalid_grant' ? 'google_reconnect_required' : 'google_refresh_failed',
            );
          }
          await connections.updateOne(
            { _id: 'owner' },
            {
              $set: {
                accessToken: encrypt(data.access_token, 'google-access'),
                expiresAt: new Date(Date.now() + Number(data.expires_in || 3600) * 1000),
                updatedAt: new Date(),
              },
            },
          );
          return String(data.access_token);
        },
        { signal, seconds: 30 },
      );
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== 'already_running') throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
      signal?.throwIfAborted();
    }
  }
  throw new AppError('google_refresh_busy', 503);
}
