// Deterministic port of 02-book-and-hold / Check Availability.
import { DF } from './rules.js';
export function checkAvailability(v, data, w, fb) {
  const prettyDate = (d, tz) =>
    new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', {
      timeZone: tz,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  const pretty12 = (t) => {
    const [h, m] = String(t).split(':').map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  };

  const rows = (i) => data[i] || [];

  const svc = DF.services(rows(0)).find((s) => s.id === v.service);
  if (!svc) throw new Error('Unknown service: ' + v.service);

  const set = DF.settings(rows(2));
  const TZ = set.timezone || 'Asia/Karachi';
  const BUFFER = Number(set.buffer_min ?? 10);
  const HOLD = Number(set.hold_minutes ?? 30);
  const holidays = new Set(rows(3).map((r) => DF.clean(r[0])));

  const start = DF.toMin(v.time);
  const LEAD_H = Number(set.lead_hours ?? 2);
  // The slot list is built for the treatment's normal length. A first visit gets
  // 10 extra minutes when they fit; when they don't, the patient still gets the
  // time they were offered rather than a "slot taken" for a slot that is free.
  const plain = svc.min,
    padded = svc.min + (v.firstVisit ? 10 : 0);
  const dow = DF.dayName(v.date, TZ);
  const nowP = DF.parts(new Date().toISOString(), TZ);

  /* ---- THE RE-CHECK, per doctor ------------------------------------------
   The patient's slot list may be minutes old. Each candidate doctor must be
   working at that time, readable in Google Calendar, and free (plus buffer).
   For "any", the least busy doctor that day gets the patient, which spreads
   bookings evenly; a tie goes to whoever is listed first in the Doctors tab. */
  let chosen = null,
    reason = 'slot-taken',
    dur = plain;
  // Same lead time as the slot list, less 30 minutes for the time it takes to fill in the form.
  const tooSoon = v.date === nowP.date && start < nowP.min + LEAD_H * 60 - 30;
  if (holidays.has(v.date)) reason = 'holiday';
  else if (v.date < nowP.date || (v.date === nowP.date && start <= nowP.min)) reason = 'past';
  else if (tooSoon) reason = 'too-soon';
  else if (!w.eligible.length) reason = 'no-doctor';
  else {
    const asked = w.eligible.map((x) => x.calendarId);
    const cands = w.eligible
      .map((d, i) => ({
        d,
        i,
        h: DF.hoursFor(rows(1), d.id, dow),
        busy: DF.busyFor(fb, d.calendarId, v.date, TZ, asked),
      }))
      .filter((x) => x.h && x.busy.ok);
    const order = (a, b) => DF.busyMinutes(a.busy.blocks) - DF.busyMinutes(b.busy.blocks) || a.i - b.i;
    for (const len of padded > plain ? [padded, plain] : [plain]) {
      const fit = cands.filter((x) => DF.fits(start, len, BUFFER, x.h, x.busy.blocks)).sort(order);
      if (fit.length) {
        chosen = fit[0].d;
        dur = len;
        break;
      }
    }
  }
  const free = !!chosen;
  const doctorId = chosen && !chosen.implicit ? chosen.id : '';
  const doctorName = chosen && !chosen.implicit ? chosen.name : '';
  const calendarId = chosen ? chosen.calendarId : '';

  const expiresAt = new Date(Date.now() + HOLD * 60000).toISOString();
  const event = !chosen
    ? null
    : {
        summary: `[PENDING] ${v.name} — ${svc.name}`,
        description: [
          `Reference: ${v.ref}`,
          `Patient: ${v.name}`,
          `Phone: ${v.phone}`,
          `Email: ${v.email || '—'}`,
          ...(doctorName ? [`Dentist: ${doctorName}`] : []),
          `First visit: ${v.firstVisit ? 'Yes' : 'No'}`,
          `Notes: ${v.notes || '—'}`,
          '',
          'STATUS: awaiting patient confirmation.',
          'This hold is released automatically if the patient does not confirm.',
        ].join('\n'),
        start: { dateTime: `${v.date}T${DF.toHHMM(start)}:00`, timeZone: TZ },
        end: { dateTime: `${v.date}T${DF.toHHMM(start + dur)}:00`, timeZone: TZ },
        colorId: '6',
        extendedProperties: {
          private: {
            ref: v.ref,
            token: v.token,
            status: 'PENDING',
            expiresAt,
            phone: v.phone,
            email: v.email,
            serviceId: svc.id,
            doctor: doctorId,
          },
        },
      };

  return {
    ...v,
    free,
    reason: free ? 'ok' : reason,
    event,
    timezone: TZ,
    holdMinutes: HOLD,
    doctorId,
    doctorName,
    calendarId,
    serviceName: svc.name,
    price: svc.price,
    durationMin: dur,
    expiresAt,
    prettyDate: prettyDate(v.date, TZ),
    prettyTime: pretty12(v.time),
  };
}
