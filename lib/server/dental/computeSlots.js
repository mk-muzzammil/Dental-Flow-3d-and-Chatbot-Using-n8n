// Deterministic port of 01-slot-engine / Compute Free Slots.
import { DF } from './rules.js';
export function computeSlots(c, data, w, fb) {
  const rows = (i) => data[i] || [];

  const set = DF.settings(rows(2));
  const TZ = set.timezone || 'Asia/Karachi';
  const BUFFER = Number(set.buffer_min ?? 10);
  const LEAD_H = Number(set.lead_hours ?? 2);
  const GRAN = Number(set.slot_granularity ?? 15);
  const holidays = new Set(rows(3).map((r) => DF.clean(r[0])));

  const named = w.eligible.filter((d) => !d.implicit).map((d) => ({ id: d.id, name: d.name }));
  const out = (extra) => ({
    date: c.date,
    service: c.service,
    doctor: c.doctor,
    timezone: TZ,
    slots: [],
    byDoctor: [],
    doctors: named,
    ...extra,
  });

  const svc = DF.services(rows(0)).find((s) => s.id === c.service);
  if (!svc) return out({ reason: 'unknown-service' });
  if (!svc.active) return out({ reason: 'service-inactive' });

  const nowP = DF.parts(new Date().toISOString(), TZ);

  /* ---- next=1: the next free times over the coming week --------------------
   For a patient choosing on website: instead of "which day?" and then
   "which time?", one short list with real free times. From each day, one in
   the morning, one in the afternoon and one in the evening when there are
   any, earliest days first, at most LIMIT in all. The rules for what counts
   as free are the same DF rules as for a single day, so a time offered here
   is a time the single-day check would also offer.                         */
  if (c.next) {
    const LIMIT = 8;
    const asked = w.eligible.map((x) => x.calendarId);
    const addDays = (ymd, n) =>
      new Date(Date.parse(ymd + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
    const part = (t) => {
      const m = DF.toMin(t);
      return m < 720 ? 0 : m < 1020 ? 1 : 2;
    }; // before 12:00, before 17:00, later
    const WD =
      { en: 'en-GB', ar: 'ar-EG-u-nu-latn-ca-gregory', ur: 'ur-PK-u-nu-latn-ca-gregory' }[c.lang] || 'en-GB';
    const noon = (ymd) => new Date(ymd + 'T12:00:00Z');
    const clock = (t) => {
      const [h, m] = t.split(':').map(Number);
      return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${c.lang === 'ar' ? (h >= 12 ? 'م' : 'ص') : h >= 12 ? 'PM' : 'AM'}`;
    };
    // A row title on website holds 24 characters. English: "Fri 9 Oct · 3:00 PM". Arabic and Urdu day names are
    // longer, so the date is written day/month: "الجمعة 9/10 · 3:00 م".
    const label = (ymd, t) => {
      const [, mo, d] = ymd.split('-').map(Number);
      const day =
        c.lang === 'en'
          ? `${noon(ymd).toLocaleDateString(WD, { timeZone: 'UTC', weekday: 'short' })} ${d} ${noon(ymd).toLocaleDateString(WD, { timeZone: 'UTC', month: 'short' })}`
          : `${noon(ymd).toLocaleDateString(WD, { timeZone: 'UTC', weekday: 'long' })} ${d}/${mo}`;
      return `${day} · ${clock(t)}`;
    };

    const options = [],
      unreadable = new Set();
    let worked = 0;
    for (let i = 0; i <= c.NEXT_DAYS && options.length < LIMIT; i++) {
      const date = addDays(nowP.date, i);
      if (holidays.has(date)) continue;
      const dow = DF.dayName(date, TZ);
      const earliest = i === 0 ? nowP.min + LEAD_H * 60 : -1;
      const free = new Map(); // time -> the dentists free then
      for (const d of w.eligible) {
        const h = DF.hoursFor(rows(1), d.id, dow);
        if (!h) continue;
        worked++;
        const busy = DF.busyFor(fb, d.calendarId, date, TZ, asked);
        if (!busy.ok) {
          unreadable.add(d.id);
          continue;
        } // never guess at a diary we can't read
        const load = DF.busyMinutes(busy.blocks);
        for (const t of DF.freeTimes({
          dur: svc.min,
          buffer: BUFFER,
          gran: GRAN,
          earliest,
          h,
          blocks: busy.blocks,
        })) {
          if (!free.has(t)) free.set(t, []);
          free.get(t).push({ d, load });
        }
      }
      const times = [...free.keys()].sort();
      const picked = [0, 1, 2].map((p) => times.find((t) => part(t) === p)).filter(Boolean);
      for (const t of picked) {
        if (options.length >= LIMIT) break;
        const who = free.get(t).sort((a, b) => a.load - b.load)[0].d; // the dentist with the lighter day
        options.push({
          label: label(date, t),
          date,
          time: t,
          doctor: who.implicit ? '' : who.id,
          doctorName: who.implicit ? '' : who.name,
        });
      }
    }
    return {
      next: true,
      service: c.service,
      serviceName: svc.name,
      durationMin: svc.min,
      price: svc.price,
      doctor: c.doctor,
      timezone: TZ,
      doctors: named,
      options,
      ...(options.length ? {} : { reason: worked ? 'nothing-free-this-week' : 'closed' }),
      ...(unreadable.size ? { unreadable: [...unreadable] } : {}),
      how:
        'Offer these in this order, each label exactly as written, with doctorName as the small second line when it is not empty. ' +
        'To book one, pass its date, time and doctor to create_booking (doctor "any" when it is empty).',
    };
  }

  if (holidays.has(c.date)) return out({ reason: 'holiday' });

  const dow = DF.dayName(c.date, TZ);
  const earliest = nowP.date === c.date ? nowP.min + LEAD_H * 60 : c.date < nowP.date ? 99999 : -1;

  const byDoctor = [],
    unreadable = [];
  let working = 0;
  for (const d of w.eligible) {
    const h = DF.hoursFor(rows(1), d.id, dow);
    if (!h) continue; // not working that day
    working++;
    const busy = DF.busyFor(
      fb,
      d.calendarId,
      c.date,
      TZ,
      w.eligible.map((x) => x.calendarId),
    );
    if (!busy.ok) {
      unreadable.push(d.id);
      continue;
    } // never guess at a diary we can't read
    const slots = DF.freeTimes({
      dur: svc.min,
      buffer: BUFFER,
      gran: GRAN,
      earliest,
      h,
      blocks: busy.blocks,
    });
    if (slots.length)
      byDoctor.push({ doctor: d.implicit ? '' : d.id, doctorName: d.implicit ? '' : d.name, slots });
  }
  // "slots" stays a plain list of times (every free time, across the chosen
  // doctors) so older booking pages keep working; byDoctor says who is free when.
  const slots = [...new Set(byDoctor.flatMap((b) => b.slots))].sort();
  const reason = slots.length ? undefined : working ? 'fully-booked' : 'closed';
  return out({
    serviceName: svc.name,
    durationMin: svc.min,
    price: svc.price,
    slots,
    byDoctor,
    ...(reason ? { reason } : {}),
    ...(unreadable.length ? { unreadable } : {}),
  });
}
