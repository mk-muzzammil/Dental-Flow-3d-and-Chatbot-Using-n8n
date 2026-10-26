// Shared deterministic availability rules, ported from workflows 01 and 02.
export const DF = (() => {
  const clean = (v) => String(v ?? '').trim();
  // "14:00", "14:00:00", "14.00" and "2:00 PM" all mean the same time; a sheet may show any of them.
  const toMin = (t) => {
    const m = /^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*([ap])?\.?m?\.?$/i.exec(clean(t));
    if (!m) return NaN;
    let h = Number(m[1]);
    const ap = (m[3] || '').toLowerCase();
    if (ap === 'p' && h < 12) h += 12;
    if (ap === 'a' && h === 12) h = 0;
    return h * 60 + Number(m[2]);
  };
  const toHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const truthy = (v) => clean(v).toUpperCase() === 'TRUE';
  const parts = (isoStr, tz) => {
    const f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const p = Object.fromEntries(f.formatToParts(new Date(isoStr)).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, min: (Number(p.hour) % 24) * 60 + Number(p.minute) };
  };
  const dayName = (date, tz) =>
    new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' })
      .format(new Date(date + 'T12:00:00Z'))
      .toLowerCase();

  function settings(rows) {
    const s = {};
    for (const r of rows || []) s[clean(r[0])] = r[1];
    return s;
  }

  function services(rows) {
    return (rows || [])
      .map((r) => ({
        id: clean(r[0]),
        name: clean(r[1]),
        min: Number(r[2]),
        price: Number(r[3]),
        active: r[4] === undefined || clean(r[4]).toUpperCase() !== 'FALSE',
      }))
      .filter((s) => s.id);
  }

  function doctors(rows, fallbackCalendar, fallbackName) {
    const list = (rows || [])
      .map((r) => ({
        id: clean(r[0]).toLowerCase(),
        name: clean(r[1]) || clean(r[0]),
        calendarId: clean(r[2]),
        services: clean(r[3]),
        email: clean(r[4]),
        active: r[5] === undefined || clean(r[5]).toUpperCase() !== 'FALSE',
      }))
      .filter((d) => d.id && d.calendarId && d.active);
    if (list.length) return list;
    return [
      {
        id: 'clinic',
        name: fallbackName || 'the dentist',
        calendarId: fallbackCalendar || 'primary',
        services: 'all',
        email: '',
        active: true,
        implicit: true,
      },
    ];
  }

  const doesService = (d, svcId) => {
    const s = d.services.toLowerCase();
    return (
      !s ||
      s === 'all' ||
      s
        .split(/[\s,;]+/)
        .filter(Boolean)
        .includes(String(svcId).toLowerCase())
    );
  };

  // wanted: a doctor id, or '' / 'any' for every doctor who does this treatment
  function eligible(docs, svcId, wanted) {
    const w = clean(wanted).toLowerCase();
    const any = !w || w === 'any';
    return docs.filter((d) => doesService(d, svcId) && (any || d.id === w));
  }

  function hoursFor(hoursRows, doctorId, dow) {
    const rows = hoursRows || [];
    const own = rows.filter((r) => clean(r[6]).toLowerCase() === doctorId);
    const pool = own.length ? own : rows.filter((r) => !clean(r[6]));
    const r = pool.find((x) => clean(x[0]).toLowerCase() === dow);
    if (!r || truthy(r[5])) return null; // no row or closed = not working
    const open = toMin(r[1] || '10:00'),
      close = toMin(r[2] || '20:00');
    if (!(close > open)) return null;
    const bs = toMin(r[3]),
      be = toMin(r[4]);
    return { open, close, brk: bs < be ? [bs, be] : null };
  }

  // Busy blocks for one calendar on one day, in minutes. A calendar Google
  // could not read is treated as fully busy: an unreadable diary must never
  // look empty, or that doctor would be double-booked.
  // Google may answer for "primary" under the account's email address instead.
  // `asked` is every calendar id we asked about: one answer under a key we did
  // not ask for can only be that calendar.
  function busyFor(fb, calId, day, tz, asked) {
    const cal = (fb && fb.calendars) || {};
    let entry = cal[calId];
    if (!entry) {
      const keys = Object.keys(cal);
      const spare = asked ? keys.filter((k) => !asked.includes(k)) : keys;
      if (spare.length === 1 && (asked || keys.length === 1)) entry = cal[spare[0]];
    }
    if (!entry || (entry.errors && entry.errors.length)) return { ok: false, blocks: [[0, 1440]] };
    const blocks = [];
    for (const b of entry.busy || []) {
      const s = parts(b.start, tz),
        e = parts(b.end, tz);
      if (e.date < day || s.date > day) continue;
      blocks.push([s.date < day ? 0 : s.min, e.date > day ? 1440 : e.min]);
    }
    return { ok: true, blocks };
  }

  // Does an appointment of `dur` minutes at `start` fit this doctor's day?
  function fits(start, dur, buffer, h, blocks) {
    if (!h || !(start >= h.open) || start + dur > h.close) return false;
    const all = h.brk ? blocks.concat([h.brk]) : blocks;
    return !all.some(([bs, be]) => start < be && start + dur + buffer > bs);
  }

  function freeTimes({ dur, buffer, gran, earliest, h, blocks }) {
    const out = [];
    if (!h) return out;
    for (let t = h.open; t + dur <= h.close; t += gran) {
      if (t < earliest) continue;
      if (fits(t, dur, buffer, h, blocks)) out.push(toHHMM(t));
    }
    return out;
  }

  const busyMinutes = (blocks) => blocks.reduce((n, [a, b]) => n + Math.max(0, b - a), 0);

  return {
    clean,
    toMin,
    toHHMM,
    parts,
    dayName,
    settings,
    services,
    doctors,
    doesService,
    eligible,
    hoursFor,
    busyFor,
    fits,
    freeTimes,
    busyMinutes,
  };
})();
