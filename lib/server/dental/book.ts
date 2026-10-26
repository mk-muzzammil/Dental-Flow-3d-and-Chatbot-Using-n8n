import 'server-only';
import { AppError, clinicDefaults, checkSignal } from '../config';
import { bookingReference, bookingToken, digest, secretHash } from '../security';
import { settings } from '../google/settings';
import {
  createEvent,
  listEvents,
  deleteEvent,
  appendAppointment,
  freeBusy,
  type GoogleEvent,
  type Row,
} from '../google/api';
import { operate } from '../operations/journal';
import { readClinic, busyWindow } from './clinic';
import { DF } from './rules';
import { checkAvailability } from './checkAvailability';
import { findBooking, upcomingCount, identity, fromRow, when } from './appointments';
import { confirmBooking } from './actions';
import type { BookingInput, Hold } from './types';
export function validateBooking(raw: Record<string, unknown>): BookingInput {
  const clean = (v: unknown) =>
    String(v ?? '')
      .replace(/[\r\n\t]+/g, ' ')
      .trim();
  const name = clean(raw.name)
    .replace(/^[=+\-@\s]+/, '')
    .slice(0, 80);
  if ((name.match(/\p{L}/gu) || []).length < 2) throw new AppError('invalid-name', 400);
  let phone = clean(raw.phone).replace(/[^\d+]/g, '');
  phone = phone.startsWith('+')
    ? phone.slice(1).replace(/\D/g, '')
    : phone.startsWith('00')
      ? phone.slice(2)
      : phone.startsWith('0')
        ? '92' + phone.slice(1)
        : phone;
  phone = phone.replace(/\D/g, '');
  if (phone.length < 11 || phone.length > 15) throw new AppError('invalid-phone', 400);
  const email = clean(raw.email)
    .replace(/^[=+\-@\s]+/, '')
    .slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new AppError('invalid-email', 400);
  const service = clean(raw.service),
    date = clean(raw.date),
    time = clean(raw.time);
  if (!service || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
    throw new AppError('bad-request', 400);
  return {
    name,
    phone,
    email,
    service,
    date,
    time,
    notes: clean(raw.notes)
      .replace(/^[=+\-@\s]+/, '')
      .slice(0, 300),
    doctor: clean(raw.doctor) || 'any',
    language: clean(raw.language) || 'en',
    firstVisit: raw.firstVisit === true,
  };
}
export function losesClash(ours: GoogleEvent, events: GoogleEvent[]) {
  const t = (s?: string) => Date.parse(s || ''),
    s = t(ours.start?.dateTime),
    e = t(ours.end?.dateTime);
  return events.some(
    (other) =>
      other.id !== ours.id &&
      other.status !== 'cancelled' &&
      other.transparency !== 'transparent' &&
      t(other.start?.dateTime || other.start?.date) < e &&
      t(other.end?.dateTime || other.end?.date) > s &&
      ((t(other.created) || 0) < (t(ours.created) || 0) ||
        ((t(other.created) || 0) === (t(ours.created) || 0) && other.id < ours.id)),
  );
}
export function appointmentRow(h: Hold, eventId: string, createdAt: string): Row {
  return [
    h.ref,
    createdAt,
    'PENDING',
    h.service,
    h.serviceName,
    h.date,
    h.time,
    h.durationMin,
    h.name,
    h.phone,
    h.email,
    h.notes,
    eventId,
    h.token,
    h.expiresAt,
    h.firstVisit ? 'YES' : 'NO',
    h.price,
    '',
    h.doctorId,
    h.doctorName,
    h.calendarId,
  ];
}
export async function createBooking(raw: Record<string, unknown>, requestKey: string, signal?: AbortSignal) {
  const input = validateBooking(raw),
    fingerprint = secretHash(JSON.stringify(input));
  return operate(
    'book',
    requestKey,
    fingerprint,
    async (journal) => {
      let context = journal.context<{ hold: Hold; createdAt: string }>();
      if (!context) {
        // Preserve the website's existing fail-open booking-cap lookup.
        let count = 0;
        try {
          count = await upcomingCount(input.phone, signal);
        } catch {
          checkSignal(signal);
        }
        if (count >= 2)
          return {
            ok: false,
            reason: 'too-many',
            message: `This number already has ${count} upcoming appointments. Kindly give the clinic's phone number, ${clinicDefaults().CLINIC_PHONE}, to arrange more.`,
          };
        const [data, selected] = await Promise.all([readClinic(signal), settings()]);
        const docs = DF.eligible(
          DF.doctors(
            data[4],
            selected.calendarId,
            DF.settings(data[2]).clinic_name || clinicDefaults().CLINIC_NAME,
          ),
          input.service,
          input.doctor,
        );
        const choices = {
          eligible: docs,
          freeBusyItems: (docs.length ? docs : [{ calendarId: selected.calendarId }]).map((d) => ({
            id: d.calendarId,
          })),
        };
        const busy = await freeBusy({ ...busyWindow(input.date), items: choices.freeBusyItems }, signal);
        const hold = checkAvailability(
          {
            ...input,
            ref: bookingReference(),
            token: bookingToken(),
            CALENDAR_ID: selected.calendarId,
            CLINIC_NAME: clinicDefaults().CLINIC_NAME,
          },
          data,
          choices,
          busy,
        );
        if (!hold.free)
          return {
            ok: false,
            reason: hold.reason,
            message: 'That slot is no longer available. Please choose another time.',
          };
        context = { hold, createdAt: new Date().toISOString() };
        await journal.saveContext(context);
      }
      const { hold: h, createdAt } = context;
      // Caller-supplied event IDs make Calendar create replay safe after reconciliation.
      const eventId = digest(`event:${h.ref}:${h.token}`);
      const reconcile = async () => {
        const events = await listEvents(
          h.calendarId,
          new URLSearchParams([
            ['privateExtendedProperty', `ref=${h.ref}`],
            ['privateExtendedProperty', `token=${h.token}`],
          ]),
          signal,
        );
        const found = events.find((e) => e.status !== 'cancelled');
        return found ? { found: true as const, value: found } : { found: false as const };
      };
      const event = await journal.step<GoogleEvent>(
        'createCalendar',
        async () => {
          try {
            return await createEvent(h.calendarId, { ...h.event, id: eventId }, signal);
          } catch (error) {
            const existing = await reconcile();
            if (existing.found) return existing.value;
            throw error;
          }
        },
        reconcile,
      );
      const b = fromRow(appointmentRow(h, event.id, createdAt), h.calendarId);
      await journal.setIdentity(identity(b), b.reference);
      const clash = await journal.step('clash', async () => {
        // Preserve workflow 02's winner ordering and its fail-open clash-read behavior.
        const events = await listEvents(
          h.calendarId,
          new URLSearchParams({
            timeMin: event.start?.dateTime || new Date().toISOString(),
            timeMax: event.end?.dateTime || new Date().toISOString(),
            singleEvents: 'true',
            maxResults: '50',
          }),
          signal,
        ).catch(() => {
          checkSignal(signal);
          return [];
        });
        return losesClash(event, events);
      });
      if (clash) {
        await journal.step('withdraw', () => deleteEvent(h.calendarId, event.id, signal));
        return {
          ok: false,
          reason: 'slot-taken',
          message: 'That slot has just been taken. Please choose another time.',
        };
      }
      await journal.step(
        'appendSheet',
        async () => {
          const existing = await findBooking(h.ref, h.token, signal);
          if (existing) return true;
          await appendAppointment(appointmentRow(h, event.id, createdAt), signal);
          return true;
        },
        async () =>
          (await findBooking(h.ref, h.token, signal))
            ? { found: true as const, value: true }
            : { found: false as const },
        true,
      );
      const confirmed = await confirmBooking(h.ref, h.token, signal);
      return {
        ok: true,
        reference: h.ref,
        status: 'confirmed',
        service: h.serviceName,
        dentist: h.doctorName,
        when: when(b),
        whatsappSent: false,
        emailCopy: confirmed.emailCopy,
        next: 'Tell the visitor their appointment is confirmed. Show the reference and appointment details.',
      };
    },
    signal,
  );
}
