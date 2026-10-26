import 'server-only';
import type { Contact } from '@/lib/appointments';
import { readRanges, updateRange, type Row } from '../google/api';
import { settings } from '../google/settings';
import { clinicDefaults, AppError } from '../config';
import { digest } from '../security';
export type Booking = {
  reference: string;
  createdAt: string;
  status: string;
  serviceId: string;
  service: string;
  date: string;
  time: string;
  minutes: number;
  name: string;
  phone: string;
  email: string;
  notes: string;
  eventId: string;
  token: string;
  expiresAt: string;
  firstVisit: boolean;
  price: number;
  doctorId: string;
  dentist: string;
  calendarId: string;
};
const str = (v: unknown) => String(v ?? '').trim();
export const phoneTail = (value: unknown) => str(value).replace(/\D/g, '').slice(-10);
export const refKey = (value: unknown) =>
  str(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
export function fromRow(r: Row, fallback: string): Booking {
  const time = /^(\d{1,2}):(\d{2})/.exec(str(r[6]));
  return {
    reference: str(r[0]),
    createdAt: str(r[1]),
    status: str(r[2]).toUpperCase(),
    serviceId: str(r[3]),
    service: str(r[4]),
    date: str(r[5]),
    time: time ? `${time[1].padStart(2, '0')}:${time[2]}` : '',
    minutes: Number(r[7]) || 30,
    name: str(r[8]),
    phone: str(r[9]),
    email: str(r[10]),
    notes: str(r[11]),
    eventId: str(r[12]),
    token: str(r[13]),
    expiresAt: str(r[14]),
    firstVisit: str(r[15]) === 'YES',
    price: Number(r[16]) || 0,
    doctorId: str(r[18]),
    dentist: str(r[19]),
    calendarId: str(r[20]) || fallback,
  };
}
export const identity = (b: Pick<Booking, 'reference' | 'token' | 'eventId'>) =>
  digest(`${b.reference}\0${b.token}\0${b.eventId}`);
export const matches = (b: Booking, contact: Contact) =>
  (!!contact.phone &&
    phoneTail(contact.phone).length === 10 &&
    phoneTail(b.phone) === phoneTail(contact.phone)) ||
  (!!contact.email && b.email.toLowerCase() === contact.email.trim().toLowerCase());
// Preserve the workflows' current-offset calculation; DST generalization is outside this migration.
export function startAt(b: Pick<Booking, 'date' | 'time'>, timezone = clinicDefaults().TIMEZONE) {
  const offset =
    new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'longOffset' })
      .formatToParts(new Date())
      .find((x) => x.type === 'timeZoneName')
      ?.value.replace('GMT', '') || '+00:00';
  return Date.parse(`${b.date}T${b.time || '00:00'}:00${offset}`);
}
export async function appointments(signal?: AbortSignal) {
  const [data, s] = await Promise.all([readRanges(['Appointments!A2:U'], signal), settings()]);
  return data[0].map((row, index) => ({ booking: fromRow(row, s.calendarId), row: index + 2 }));
}
export async function findBooking(ref: string, token: string, signal?: AbortSignal) {
  return (await appointments(signal)).find(({ booking: b }) => b.reference === ref && b.token === token)
    ?.booking;
}
export async function writeBooking(b: Booking, status: string, note?: string, signal?: AbortSignal) {
  // Resolve immediately before each write; manual sorting in Sheets is not transactional.
  const found = (await appointments(signal)).find((x) => identity(x.booking) === identity(b));
  if (!found) throw new AppError('booking_not_found', 404);
  await updateRange(`Appointments!C${found.row}`, [[status]], signal);
  if (note !== undefined) {
    const relocated = (await appointments(signal)).find((x) => identity(x.booking) === identity(b));
    if (!relocated) throw new AppError('booking_not_found', 404);
    await updateRange(`Appointments!L${relocated.row}`, [[note]], signal);
  }
}
export function card(b: Booking) {
  return {
    reference: b.reference,
    service: b.service,
    dentist: b.dentist,
    date: b.date,
    time: b.time,
    minutes: b.minutes,
    status: b.status === 'PENDING' ? 'pending' : 'confirmed',
  };
}
export async function listAppointments(contact: Contact, signal?: AbortSignal) {
  const data = await appointments(signal);
  return {
    ok: true,
    appointments: data
      .map((x) => x.booking)
      .filter(
        (b) => matches(b, contact) && ['PENDING', 'CONFIRMED'].includes(b.status) && startAt(b) > Date.now(),
      )
      .sort((a, b) => startAt(a) - startAt(b))
      .slice(0, 10)
      .map(card),
    cutoffHours: 0,
  };
}
export async function upcomingCount(phone: string, signal?: AbortSignal) {
  return (await appointments(signal)).filter(
    ({ booking: b }) =>
      phoneTail(b.phone) === phoneTail(phone) &&
      ['PENDING', 'CONFIRMED'].includes(b.status) &&
      startAt(b) > Date.now() - 3600_000,
  ).length;
}
export const when = (b: Pick<Booking, 'date' | 'time'>) => {
  const [h, m] = b.time.split(':').map(Number);
  return `${new Date(b.date + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} at ${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};
