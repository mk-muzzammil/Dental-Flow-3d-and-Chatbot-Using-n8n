import { NextResponse, type NextRequest } from 'next/server';
import { cleanAnswer, readContact, type Contact } from '@/lib/appointments';
import { demoAppointments, demoCancel } from '@/lib/demo-appointments';
import { listAppointments } from '@/lib/server/dental/appointments';
import { cancelBooking } from '@/lib/server/dental/actions';
import { appMode, deadline, safeError } from '@/lib/server/config';
import { readJson } from '@/lib/server/http';

export const runtime = 'nodejs';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

/* There is no code check, so lookups are limited per visitor (per server instance):
   8 lookups and 6 cancellations in 10 minutes, 40 lookups a day. */
const hits = new Map<string, number[]>();
function limited(key: string, perTen: number, perDay: number) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter(t => now - t < 86_400_000);
  if (list.filter(t => now - t < 600_000).length >= perTen || list.length >= perDay) { hits.set(key, list); return true; }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > 86_400_000) hits.delete(k);
  return false;
}

const fail = (status: number, reason: string, detail?: string) =>
  NextResponse.json({ ok: false, reason, ...(detail ? { detail } : {}) }, { status });

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (origin && host) {
    try { if (new URL(origin).host !== host) return fail(403, 'forbidden'); } catch { return fail(403, 'forbidden'); }
  }

  let b: Record<string, unknown> = {};
  try { b = await readJson(req,4000); } catch (error) { const detail=safeError(error);return fail(detail.status,detail.code); }
  const action = b.action === 'cancel' ? 'cancel' : 'list';
  const c = (b.contact && typeof b.contact === 'object' ? b.contact : {}) as Record<string, unknown>;
  const contact: Contact | null = readContact(`${typeof c.phone === 'string' ? c.phone : ''} ${typeof c.email === 'string' ? c.email : ''}`);
  if (!contact) return fail(400, 'invalid-contact');
  const reference = typeof b.reference === 'string' ? b.reference.trim().toUpperCase().slice(0, 20) : '';
  if (action === 'cancel' && !/^DN-?[A-Z0-9]{3,12}$/.test(reference)) return fail(400, 'invalid-reference');

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';
  if (action === 'list' ? limited('l:' + ip, 8, 40) : limited('c:' + ip, 6, 30)) return fail(429, 'too-many');

  if (appMode() === 'demo') {
    await new Promise(r => setTimeout(r, 500 + Math.random() * 400));
    return NextResponse.json(action === 'list' ? demoAppointments(contact) : demoCancel(contact, reference));
  }

  try {
    const signal = deadline(25_000, req.signal);
    const result = action === 'list' ? await listAppointments(contact,signal) : await cancelBooking(reference,{contact},signal);
    return NextResponse.json(cleanAnswer(result));
  } catch (error) {
    const detail = safeError(error);return fail(detail.status,detail.code);
  }
}
