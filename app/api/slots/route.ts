import { NextResponse, type NextRequest } from 'next/server';
import { dentists } from '@/content/clinic';
import type { DoctorsAnswer, SlotOption, SlotsAnswer } from '@/lib/slots';
import { nextDays } from '@/lib/slots';
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

/* ---- demo mode: example times, Sunday closed, every dentist does everything */
function demo(mode: string, doctor: string, date: string): DoctorsAnswer | SlotsAnswer {
  if (mode === 'doctors') return { doctors: dentists.map(d => ({ id: d.id, name: d.name })) };
  const pool = doctor === 'any' ? dentists : dentists.filter(d => d.id === doctor);
  if (!pool.length) return { options: [], reason: 'no-doctor' };
  const dayTimes = (ymd: string, all: boolean): SlotOption[] => {
    if (new Date(ymd + 'T12:00:00Z').getUTCDay() === 0) return [];
    const times = all ? ['10:00', '10:45', '11:30', '12:15', '14:30', '15:15', '16:00', '16:45', '17:30'] : ['10:30', '15:00', '18:00'];
    return times.map((time, i) => { const d = pool[i % pool.length]; return { date: ymd, time, doctor: d.id, doctorName: d.name }; });
  };
  if (mode === 'day') { const o = dayTimes(date, true); return { options: o, ...(o.length ? {} : { reason: 'closed' }) }; }
  return { options: nextDays(8).slice(1).flatMap(d => dayTimes(d, false)).slice(0, 8) };
}

export async function GET(req: NextRequest) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local';
  if (limited(ip)) return bad('too_many_requests', 429);
  const q = req.nextUrl.searchParams;
  const mode = q.get('mode') ?? '';
  const service = q.get('service') ?? '';
  const doctor = (q.get('doctor') || 'any').toLowerCase();
  const date = q.get('date') ?? '';
  const lang = /^(en|ur|ar)$/.test(q.get('lang') ?? '') ? q.get('lang')! : 'en';
  if (!['doctors', 'next', 'day'].includes(mode)) return bad('bad_mode');
  if (service && !ID.test(service)) return bad('bad_service');
  if (mode !== 'doctors' && !service) return bad('missing_service');
  if (!ID.test(doctor)) return bad('bad_doctor');
  if (mode === 'day' && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad('bad_date');

  if (appMode() === 'demo') {
    await new Promise(r => setTimeout(r, 400));
    return NextResponse.json(demo(mode, doctor, date));
  }

  try {
    const j = await slots({ mode, service, doctor, date, lang }, deadline(20_000, req.signal));
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    if (mode === 'doctors') {
      const list = Array.isArray(j.doctors) ? j.doctors : [];
      return NextResponse.json({ doctors: list.map(d => ({ id: str((d as Record<string, unknown>).id), name: str((d as Record<string, unknown>).name) })).filter(d => d.id && d.name) } satisfies DoctorsAnswer);
    }
    const reason = str(j.reason) || undefined;
    if (mode === 'next') {
      const options = (Array.isArray(j.options) ? j.options : []).map(o => {
        const x = o as Record<string, unknown>;
        return { date: str(x.date), time: str(x.time), doctor: str(x.doctor), doctorName: str(x.doctorName) };
      }).filter(o => /^\d{4}-\d{2}-\d{2}$/.test(o.date) && /^\d{2}:\d{2}$/.test(o.time));
      return NextResponse.json({ options, reason } satisfies SlotsAnswer);
    }
    // one day: every free time, with the dentist who is free then (the first one listed when several are)
    const seen = new Map<string, SlotOption>();
    for (const b of Array.isArray(j.byDoctor) ? j.byDoctor : []) {
      const x = b as Record<string, unknown>;
      for (const t of Array.isArray(x.slots) ? x.slots : []) {
        if (typeof t === 'string' && /^\d{2}:\d{2}$/.test(t) && !seen.has(t)) seen.set(t, { date, time: t, doctor: str(x.doctor), doctorName: str(x.doctorName) });
      }
    }
    return NextResponse.json({ options: [...seen.values()].sort((a, b) => a.time.localeCompare(b.time)), reason } satisfies SlotsAnswer);
  } catch (error) {
    const detail = safeError(error); return bad(detail.code, detail.status);
  }
}
