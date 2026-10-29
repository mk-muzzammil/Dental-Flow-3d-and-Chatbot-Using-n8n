import 'server-only';
import type { Contact } from '@/lib/appointments';
import { deleteEvent, patchEvent } from '../google/api';
import { AppError, clinicDefaults } from '../config';
import { digest } from '../security';
import { withLease } from '../operations/lease';
import { operate } from '../operations/journal';
import {
  appointments,
  findBooking,
  identity,
  matches,
  refKey,
  startAt,
  writeBooking,
  type Booking,
} from './appointments';
import { collection } from '../db';
import type { PrivateBooking } from '../storage/worksheets';
import { releaseReservation } from './reservations';
import { notifyBooking } from './notifications';
export function actionGuard(b: Booking, action: 'confirm' | 'cancel', channel: 'web' | 'token') {
  if (b.status === 'CANCELLED')
    throw new AppError(channel === 'web' ? 'already-cancelled' : 'cancelled', 409);
  if (b.status === 'EXPIRED') throw new AppError(channel === 'web' ? 'not-active' : 'expired', 409);
  if (!['PENDING', 'CONFIRMED'].includes(b.status)) throw new AppError('not-active', 409);
  if (action === 'confirm' && b.status === 'PENDING' && Date.parse(b.expiresAt) <= Date.now())
    throw new AppError('expired', 409);
  const hours = (startAt(b) - Date.now()) / 3600_000;
  if (channel === 'web' ? !Number.isFinite(hours) || hours <= 0 : hours < -1) throw new AppError('past', 409);
  if (action === 'cancel' && hours < (channel === 'web' ? 0 : 4)) throw new AppError('too-late', 409);
}
export async function confirmBooking(ref: string, token: string, signal?: AbortSignal) {
  const initial = await findBooking(ref, token, signal);
  if (!initial) throw new AppError('not-found', 404);
  const key = identity(initial);
  return withLease(
    `booking:${key}`,
    () =>
      operate(
        'confirm',
        key,
        digest(key),
        async (journal) => {
          await journal.setIdentity(key, initial.reference);
          const b = await findBooking(ref, token, signal);
          if (!b) throw new AppError('not-found', 404);
          actionGuard(b, 'confirm', 'token');
          const event = await journal.step('calendar', () =>
            patchEvent(
              b.calendarId,
              b.eventId,
              {
                summary: `[CONFIRMED] ${b.name} — ${b.service}`,
                colorId: '10',
                extendedProperties: { private: { ref: b.reference, token: b.token, status: 'CONFIRMED' } },
              },
              signal,
            ),
          );
          await journal.step('sheet', () => writeBooking(b, 'CONFIRMED', undefined, signal));
          const emailCopy = await notifyBooking(b, 'confirmed', event, signal);
          return { booking: { ...b, status: 'CONFIRMED' }, event, emailCopy };
        },
        signal,
      ),
    { signal },
  );
}
export async function cancelBooking(
  ref: string,
  authorization: { contact: Contact } | { token: string },
  signal?: AbortSignal,
) {
  const web = 'contact' in authorization;
  const initial = (await appointments(signal)).find(({ booking: b }) =>
    web
      ? refKey(b.reference) === refKey(ref) && matches(b, authorization.contact)
      : b.reference === ref && b.token === authorization.token,
  )?.booking;
  if (!initial) throw new AppError('not-found', 404);
  const key = identity(initial);
  return withLease(
    `booking:${key}`,
    () =>
      operate(
        'cancel',
        key,
        digest(key),
        async (journal) => {
          await journal.setIdentity(key, initial.reference);
          const b = await findBooking(initial.reference, initial.token, signal);
          if (!b || identity(b) !== key) throw new AppError('not-found', 404);
          if(await(await collection<PrivateBooking>('booking_private')).findOne({bookingId:key,pendingMove:{$exists:true}}))throw new AppError('booking-update-pending',409);
          if (b.status === 'CANCELLED' && !journal.context())
            throw new AppError(web ? 'already-cancelled' : 'cancelled', 409);
          // A completed Sheet write followed by an interrupted journal update is safe to resume.
          if (b.status !== 'CANCELLED') actionGuard(b, 'cancel', web ? 'web' : 'token');
          await journal.step('calendar', () =>
            deleteEvent(b.calendarId, b.eventId || '__no-event__', signal),
          );
          const context = journal.context<{ note: string }>();
          const note =
            context?.note ??
            `${b.notes}${b.notes ? ' | ' : ''}Cancelled by patient in the website chat ${new Date().toLocaleString('en-GB', { timeZone: clinicDefaults().TIMEZONE })}`;
          if (!context) await journal.saveContext({ note });
          await journal.step('sheet', () => writeBooking(b, 'CANCELLED', web ? note : undefined, signal));
          await releaseReservation(identity(b));
          const emailed = web ? await notifyBooking(b, 'cancelled', undefined, signal) : false;
          return { ok: true, reference: b.reference, status: 'cancelled', emailed };
        },
        signal,
      ),
    { signal },
  );
}
export async function expireBooking(initial: Booking, signal?: AbortSignal) {
  const key = identity(initial);
  return withLease(
    `booking:${key}`,
    () =>
      operate(
        'expire',
        key,
        digest(key),
        async (journal) => {
          await journal.setIdentity(key, initial.reference);
          await journal.saveContext(initial);
          const b = await findBooking(initial.reference, initial.token, signal);
          if (
            !b ||
            identity(b) !== key ||
            !['PENDING', 'EXPIRED'].includes(b.status) ||
            !(Date.parse(b.expiresAt) <= Date.now())
          )
            return { skipped: true, emailed: false };
          if(await(await collection<PrivateBooking>('booking_private')).findOne({bookingId:key,pendingMove:{$exists:true}}))throw new AppError('booking-update-pending',409);
          await journal.step('calendar', () =>
            deleteEvent(b.calendarId, b.eventId || '__no-event__', signal),
          );
          await journal.step('sheet', () => writeBooking(b, 'EXPIRED', undefined, signal));
          await releaseReservation(identity(b));
          const emailed = await notifyBooking(b, 'expired', undefined, signal);
          return { skipped: false, emailed, notificationFailed: !!b.email && !emailed };
        },
        signal,
      ),
    { signal },
  );
}
