import 'server-only';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
  scrypt as scryptCallback,
} from 'node:crypto';
import { promisify } from 'node:util';
import { AppError, required } from './config';

export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const secretHash = (value: string) =>
  createHmac('sha256', required('JWT_SECRET')).update(value).digest('hex');
export const opaqueToken = () => randomBytes(32).toString('base64url');
export const bookingToken = () => Array.from({ length: 32 }, () => randomInt(36).toString(36)).join('');
export const bookingReference = () => `DN-${randomInt(100000, 1000000)}`;
export function constantEqual(left: string, right: string) {
  return timingSafeEqual(
    createHash('sha256').update(left).digest(),
    createHash('sha256').update(right).digest(),
  );
}
export function bearerValid(request: Request, secret: string) {
  return secret.length >= 32 && constantEqual(request.headers.get('authorization') || '', `Bearer ${secret}`);
}
export type Ciphertext = { version: 1; iv: string; tag: string; data: string };
function encryptionKey() {
  const key = Buffer.from(required('TOKEN_ENCRYPTION_KEY'), 'base64');
  if (key.length !== 32) throw new AppError('invalid_token_encryption_key');
  return key;
}
export function encrypt(value: string, purpose: string): Ciphertext {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  cipher.setAAD(Buffer.from(purpose));
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return {
    version: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
}
export function decrypt(value: Ciphertext, purpose: string) {
  if (value.version !== 1) throw new AppError('unsupported_encryption_version');
  const cipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(value.iv, 'base64'));
  cipher.setAAD(Buffer.from(purpose));
  cipher.setAuthTag(Buffer.from(value.tag, 'base64'));
  return Buffer.concat([cipher.update(Buffer.from(value.data, 'base64')), cipher.final()]).toString('utf8');
}
const scrypt = promisify(scryptCallback);
export async function verifyPassword(password: string, encoded: string) {
  const [scheme, salt, hash, extra] = encoded.split('$');
  if (
    scheme !== 'scrypt' ||
    !/^[a-f0-9]{32}$/.test(salt || '') ||
    !/^[a-f0-9]{128}$/.test(hash || '') ||
    extra
  )
    throw new AppError('invalid_admin_password_hash');
  const result = (await scrypt(password, salt, 64)) as Buffer;
  return timingSafeEqual(result, Buffer.from(hash, 'hex'));
}
export const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!,
  );
