import { NextResponse, type NextRequest } from 'next/server';
import { dentists } from '@/content/clinic';
import { demoSlots } from '@/lib/server/dental/demo-slots';
import { slots } from '@/lib/server/dental/clinic';
import { appMode, safeError, deadline } from '@/lib/server/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const hits = new Map<string, number[]>();
function limited(ip: string) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter(t => now - t < 60_000);
  if (list.length >= 40) return true;
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return false;
}
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const ID = /^[\w-]{1,40}$/;

export async function GET(req: NextRequest) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local';
  if (limited(ip)) return bad('too_many_requests', 429);
  const q = req.nextUrl.searchParams;
  const mode = q.get('mode') ?? '';
  const service = q.get('service') ?? '';
  const doctor = (q.get('doctor') || 'any').toLowerCase();
  const date = q.get('date') ?? '';
  const lang = /^(en|ur|ar)$/.test(q.get('lang') ?? '') ? q.get('lang')! : 'en';
  if (!['doctors', 'next', 'day', 'week'].includes(mode)) return bad('bad_mode');
  if (service && !ID.test(service)) return bad('bad_service');
  if (mode !== 'doctors' && !service) return bad('missing_service');
  if (!ID.test(doctor)) return bad('bad_doctor');
  if (mode === 'day' && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad('bad_date');

  if (appMode() === 'demo') {
    await new Promise(r => setTimeout(r, 400));
    return NextResponse.json(mode==='doctors'?{doctors:dentists}:demoSlots(service,mode==='day'?date:undefined,doctor));
  }

  try {
    const j = await slots({ mode, service, doctor, date, lang }, deadline(20_000, req.signal));
    return NextResponse.json(j);
  } catch (error) {
    const detail = safeError(error); return bad(detail.code, detail.status);
  }
}
