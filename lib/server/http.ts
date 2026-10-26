import 'server-only';
import { NextResponse } from 'next/server';
import { AppError, appUrl, safeError } from './config';

export function sameOrigin(request: Request, required = true) {
  const origin = request.headers.get('origin');
  if ((!origin && required) || (origin && origin !== appUrl())) throw new AppError('forbidden', 403);
}
export async function readJson(request: Request, maxBytes = 4096): Promise<Record<string, unknown>> {
  if (Number(request.headers.get('content-length')) > maxBytes) throw new AppError('too_large', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError('bad_request', 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new AppError('too_large', 413);
      }
      chunks.push(value);
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid');
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('bad_request', 400);
  }
}
export function failure(error: unknown) {
  const detail = safeError(error);
  return NextResponse.json(
    { ok: false, error: detail.code },
    { status: detail.status, headers: { 'Cache-Control': 'no-store' } },
  );
}
export function privateJson(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}
