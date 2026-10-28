import { NextResponse, type NextRequest } from 'next/server';
import { cleanResponse, type ChatRequest, type DemoState, type HistoryItem } from '@/lib/chat-types';
import { demoReply } from '@/lib/demo';
import { continueChat } from '@/lib/chat-follow-up';
import { chat } from '@/lib/server/chat';
import { appMode, deadline, safeError } from '@/lib/server/config';
import { readJson } from '@/lib/server/http';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const maxDuration = 180;
const MAX_BODY = 40_000;
const MAX_VOICE_BODY = 2_600_000;   // a voice message: about 50 seconds of 16 kHz WAV, as base64

/* A light per-visitor limit (per server instance): 12 messages a minute, 150 a day. */
const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter(t => now - t < 86_400_000);
  const lastMinute = list.filter(t => now - t < 60_000).length;
  if (lastMinute >= 12 || list.length >= 150) { hits.set(ip, list); return true; }
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > 86_400_000) hits.delete(k);
  return false;
}

const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status });

function parse(raw: unknown): ChatRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  const message = typeof b.message === 'string' ? b.message.trim().slice(0, 1000) : '';
  const a = b.audio && typeof b.audio === 'object' ? (b.audio as Record<string, unknown>) : null;
  const audio = a && typeof a.data === 'string' && a.data.length > 1000 && /^[A-Za-z0-9+/]+=*$/.test(a.data)
    ? { mime: 'audio/wav', data: a.data } : null;
  if (!message && !audio) return null;
  const history: HistoryItem[] = (Array.isArray(b.history) ? b.history : []).slice(-20).flatMap(h => {
    const x = (h ?? {}) as Record<string, unknown>;
    const role = x.role === 'user' || x.role === 'assistant' || x.role === 'note' ? x.role : null;
    const text = typeof x.text === 'string' ? x.text.slice(0, 1500) : '';
    return role && text.trim() ? [{ role, text }] : [];
  });
  const ds = b.demoState && typeof b.demoState === 'object' ? (b.demoState as Record<string, unknown>) : null;
  const demoState: DemoState | null = ds && typeof ds.step === 'string'
    ? { step: (['start', 'treatment', 'time', 'details', 'confirm'].includes(ds.step) ? ds.step : 'start') as DemoState['step'],
        service: typeof ds.service === 'string' ? ds.service.slice(0, 40) : undefined,
        dentist: typeof ds.dentist === 'string' ? ds.dentist.slice(0, 40) : undefined,
        slot: typeof ds.slot === 'string' ? ds.slot.slice(0, 160) : undefined }
    : null;
  return {
    sessionId: (typeof b.sessionId === 'string' ? b.sessionId : '').replace(/[^\w-]/g, '').slice(0, 80) || 'anonymous',
    message, history, demoState, audio,
    lang: typeof b.lang === 'string' && /^(en|ur|ar)$/.test(b.lang) ? b.lang : 'en',
  };
}

/** GET /api/chat: is the chat connected to the clinic, or in demo mode? (The chat window asks when it opens.) */
export function GET() {
  return NextResponse.json({ demo: appMode() === 'demo' });
}

export async function POST(req: NextRequest) {
  // Only this website's own pages may use the route.
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (origin && host) {
    try { if (new URL(origin).host !== host) return fail(403, 'forbidden'); } catch { return fail(403, 'forbidden'); }
  }

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';
  if (limited(ip)) return fail(429, 'too_many_messages');

  let body: ChatRequest | null = null;
  try { const raw = await readJson(req, MAX_VOICE_BODY); if (!raw.audio && JSON.stringify(raw).length > MAX_BODY) return fail(413, 'too_large'); body = parse(raw); } catch (error) { const detail = safeError(error); return fail(detail.status, detail.code); }
  if (!body) return fail(400, 'bad_request');

  if (appMode() === 'demo') {
    await new Promise(r => setTimeout(r, 700 + Math.random() * 600)); // feels like a real reply
    return NextResponse.json(continueChat(demoReply(body)));
  }

  try {
    const key = req.headers.get('idempotency-key') || randomUUID();
    if (!/^[\w-]{16,120}$/.test(key)) return fail(400, 'bad_idempotency_key');
    const data = await chat(body, `${body.sessionId}:${key}`, deadline(180_000, req.signal));
    return NextResponse.json(continueChat(cleanResponse(data)));
  } catch (error) {
    const detail = safeError(error);
    return fail(detail.status, detail.code);
  }
}
