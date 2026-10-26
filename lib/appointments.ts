/** "My appointments" in the chat: what the chat window, the site's /api/appointments route send each other. */

export type Appointment = {
  reference: string;
  service: string;
  dentist: string;
  /** YYYY-MM-DD and HH:MM, clinic time */
  date: string;
  time: string;
  minutes: number;
  status: 'confirmed' | 'pending' | 'cancelled';
};

export type Contact = { phone?: string; email?: string };

export type AppointmentsRequest =
  | { action: 'list'; contact: Contact; lang: string }
  | { action: 'cancel'; contact: Contact; reference: string; lang: string };

export type AppointmentsAnswer =
  | { ok: true; appointments: Appointment[] }
  | { ok: true; cancelled: true; reference: string; emailed: boolean }
  | { ok: false; reason: string };

const EMAIL = /[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]{2,}/;

/** Reads a mobile number and/or an email out of what the visitor typed ("0300 1234567", "+92 300…", "me@x.com", or both). */
export function readContact(text: string): Contact | null {
  const s = String(text || '').slice(0, 200);
  const email = (EMAIL.exec(s)?.[0] ?? '').toLowerCase().replace(/[.,;]+$/, '');
  const digits = s.replace(EMAIL, ' ').replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '').replace(/^\+/, '');
  const phone = digits.length >= 10 && digits.length <= 15 ? digits : '';
  if (!phone && !email) return null;
  return { ...(phone ? { phone } : {}), ...(email ? { email } : {}) };
}

const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

/** Keeps only the expected, size-limited fields of the service response. */
export function cleanAnswer(raw: unknown): AppointmentsAnswer {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (o.ok !== true) return { ok: false, reason: str(o.reason, 40) || 'failed' };
  if (o.status === 'cancelled' || o.cancelled === true) return { ok: true, cancelled: true, reference: str(o.reference, 30), emailed: o.emailed === true };
  const list = Array.isArray(o.appointments) ? o.appointments : [];
  const appointments = list.slice(0, 10).flatMap(a => {
    const x = (a ?? {}) as Record<string, unknown>;
    const reference = str(x.reference, 30), date = str(x.date, 10), time = str(x.time, 5);
    if (!reference || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return [];
    return [{ reference, date, time, service: str(x.service, 80), dentist: str(x.dentist, 80),
      minutes: Math.min(480, Math.max(5, Number(x.minutes) || 30)), status: x.status === 'pending' ? 'pending' : 'confirmed' } as Appointment];
  });
  return { ok: true, appointments };
}
