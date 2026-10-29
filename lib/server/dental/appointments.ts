import 'server-only';
import { localInstant } from '@/lib/availability';
import type { Contact } from '@/lib/appointments';
import { readRanges, updateRange, appendAppointment, type Row } from '../google/api';
import { storageProfile } from '../storage/profile';
import { cleanBookingRows, appendCleanBooking, updatePrivateNote } from '../storage/worksheets';
import { settings } from '../google/settings';
import { clinicDefaults, AppError } from '../config';
import { digest } from '../security';
export type Booking = {
  startsAt?: string;
  endsAt?: string;
  timezone?: string;
  endTime?: string;
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
// USER_ENTERED writes can be returned as Sheets serials when cells have a
// numeric format. Normalize both those values and the existing text layout.
export function sheetDate(value: unknown): string {
  const text = str(value);
  if (!/^\d+(?:\.\d+)?$/.test(text)) return text;
  const days = Number(text);
  if (days < 1 || days > 2958465) return '';
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(days) * 86_400_000)
    .toISOString().slice(0, 10);
}
export function sheetTime(value: unknown): string {
  const text = str(value);
  if (/^(?:0(?:\.\d+)?|\.\d+)$/.test(text)) {
    const minutes = Math.round(Number(text) * 1440) % 1440;
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }
  const time = /^(\d{1,2}):(\d{2})/.exec(text);
  return time && Number(time[1]) < 24 && Number(time[2]) < 60
    ? `${time[1].padStart(2, '0')}:${time[2]}` : '';
}
export function fromRow(r: Row, fallback: string): Booking {
  return {
    startsAt: str(r[21]) || undefined, endsAt: str(r[22]) || undefined, timezone: str(r[23]) || undefined, endTime: str(r[24]) || undefined,
    reference: str(r[0]),
    createdAt: str(r[1]),
    status: str(r[2]).toUpperCase(),
    serviceId: str(r[3]),
    service: str(r[4]),
    date: sheetDate(r[5]),
    time: sheetTime(r[6]),
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
export function startAt(b: Pick<Booking,'date'|'time'|'startsAt'|'timezone'>,timezone=clinicDefaults().TIMEZONE){
  return b.startsAt?Date.parse(b.startsAt):localInstant(b.date,b.time,b.timezone||timezone);
}
export async function appointments(signal?: AbortSignal) {
  const s = await settings();
  const profile = await storageProfile(s.sheetId);
  const data = profile
    ? await cleanBookingRows(s.sheetId, signal)
    : (await readRanges(['Appointments!A2:U'], signal))[0];
  return data.map((row, index) => ({ booking: fromRow(row, s.calendarId), row: index + 2 }))
    .filter(x => x.booking.reference);
}
export async function appendBooking(row: Row, signal?: AbortSignal) {
  const s = await settings();
  const profile = await storageProfile(s.sheetId);
  if (profile) return appendCleanBooking(s.sheetId, row, signal);
  return appendAppointment(row, signal);
}
export async function findBooking(ref: string, token: string, signal?: AbortSignal) {
  return (await appointments(signal)).find(({ booking: b }) => b.reference === ref && b.token === token)
    ?.booking;
}
export async function writeBooking(b: Booking, status: string, note?: string, signal?: AbortSignal) {
  // Resolve immediately before each write; manual sorting in Sheets is not transactional.
  const found = (await appointments(signal)).find((x) => identity(x.booking) === identity(b));
  if (!found) throw new AppError('booking_not_found', 404);
  const selected = await settings();
  if (await storageProfile(selected.sheetId)) {
    if (note !== undefined) await updatePrivateNote(selected.sheetId, identity(b), note);
    await updateRange(`Appointments!D${found.row}`, [[status]], signal);
    return;
  }
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
    serviceId:b.serviceId,doctorId:b.doctorId,
    service: b.service,
    dentist: b.dentist,
    date: b.date,
    time: b.time,
    minutes: b.minutes,
    endTime:b.endTime,
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
export const when = (b: Pick<Booking, 'date' | 'time' | 'endTime'>) => {
  const [h, m] = b.time.split(':').map(Number);
  return `${new Date(b.date + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} at ${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}${b.endTime?' – '+(()=>{const [eh,em]=b.endTime!.split(':').map(Number);return `${((eh+11)%12)+1}:${String(em).padStart(2,'0')} ${eh>=12?'PM':'AM'}`;})():''}`;
};
