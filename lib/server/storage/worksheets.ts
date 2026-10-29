import 'server-only';
import { googleRequest, type Row } from '../google/api';
import { collection } from '../db';
import { digest, secretHash, encrypt, decrypt, type Ciphertext } from '../security';
import { AppError } from '../config';
import { withLease } from '../operations/lease';
import schema from './schema.json';
import { doctorConnections, type StorageProfile } from './profile';

const text = (v: unknown) => String(v ?? '').trim();
export const bookingId = (row: Row) => digest(`${text(row[0])}\0${text(row[13])}\0${text(row[12])}`);
export const patientId = (sheetId: string, row: Row) => 'PT-' + secretHash(JSON.stringify([sheetId, text(row[8]).toLowerCase(), text(row[9]).replace(/\D/g, '').slice(-10), text(row[10]).toLowerCase()])).slice(0, 24);
export type PrivateBooking = { _id: string; sheetId: string; bookingId: string; patientId: string; data: Ciphertext; createdAt: Date; pendingMove?:string };
export function privateFields(row: Row) {
  return { notes: text(row[11]), eventId: text(row[12]), token: text(row[13]), expiresAt: text(row[14]), firstVisit: text(row[15]), calendarId: text(row[20]), startsAt:text(row[21]), endsAt:text(row[22]), timezone:text(row[23]), endTime:text(row[24]) };
}
export function appointmentCells(row: Row, pid: string): Row {
  return [bookingId(row), row[0], row[1], row[2], pid, row[3], row[4], row[5], row[6], row[7], row[18], row[19], row[16],row[24]||''];
}
export async function savePrivateBooking(sheetId: string, row: Row) {
  const bid = bookingId(row), id = `${sheetId}:${bid}`, pid = patientId(sheetId, row);
  await (await collection<PrivateBooking>('booking_private')).updateOne({ _id: id }, { $setOnInsert: {
    sheetId, bookingId: bid, patientId: pid, data: encrypt(JSON.stringify(privateFields(row)), `booking-private:${id}`), createdAt: new Date(),
  } }, { upsert: true });
  const saved = await (await collection<PrivateBooking>('booking_private')).findOne({ _id: id });
  if (!saved) throw new AppError('private_booking_write_failed');
  return saved;
}
export async function sheetValues(sheetId: string, ranges: string[], signal?: AbortSignal, unformatted = false): Promise<Row[][]> {
  const query = new URLSearchParams();
  ranges.forEach(range => query.append('ranges', range));
  if (unformatted) query.set('valueRenderOption', 'UNFORMATTED_VALUE');
  const result = await googleRequest<{ valueRanges?: { values?: Row[] }[] }>('sheets', `/spreadsheets/${sheetId}/values:batchGet?${query}`, { signal });
  return ranges.map((_, i) => result.valueRanges?.[i]?.values || []);
}
export function requireHeader(rows: Row[], expected: string[]) {
  if (expected.some((cell, i) => !(cell==='end_time' && rows[0]?.length===13) && rows[0]?.[i] !== cell)) throw new AppError('invalid_sheet_schema');
}
export async function cleanBookingRows(sheetId: string, signal?: AbortSignal): Promise<Row[]> {
  const [appointments, patients] = await sheetValues(sheetId, ['Appointments!A:N', 'Patients!A:D'], signal);
  requireHeader(appointments, schema.Appointments); requireHeader(patients, schema.Patients);
  const patientMap = new Map(patients.slice(1).filter(r => r[0]).map(r => [text(r[0]), r]));
  const ids = appointments.slice(1).filter(r => r[0]).map(r => `${sheetId}:${r[0]}`);
  const records = await (await collection<PrivateBooking>('booking_private')).find({ _id: { $in: ids } }).toArray();
  const map = new Map(records.map(r => [r._id, r]));
  return appointments.slice(1).map(row => {
    if (!row[0]) {
      if (row.some(c => text(c))) throw new AppError('misaligned_sheet_row_repair_required');
      return [];
    }
    const record = map.get(`${sheetId}:${row[0]}`), patient = patientMap.get(text(row[4]));
    if (!record || !patient || record.patientId !== text(row[4])) throw new AppError('booking_data_incomplete');
    const hidden = JSON.parse(decrypt(record.data, `booking-private:${record._id}`)) as ReturnType<typeof privateFields>;
    const result: Row = [row[1], row[2], row[3], row[5], row[6], row[7], row[8], row[9], patient[1] || '', patient[2] || '', patient[3] || '', hidden.notes, hidden.eventId, hidden.token, hidden.expiresAt, hidden.firstVisit, row[12], '', row[10], row[11], hidden.calendarId,hidden.startsAt||'',hidden.endsAt||'',hidden.timezone||'',row[13]||hidden.endTime||''];
    if (bookingId(result) !== text(row[0])) throw new AppError('booking_identity_mismatch');
    return result;
  });
}
export async function cleanDoctorRows(profile: StorageProfile, signal?: AbortSignal) {
  if (profile.pendingDoctorEdit) throw new AppError('doctor_update_pending_retry_save', 503);
  const [rows] = await sheetValues(profile._id, ['Doctors!A:F'], signal);
  requireHeader(rows, schema.Doctors);
  const privateDoctors = doctorConnections(profile);
  return rows.slice(1).filter(r => r[0]).map(r => {
    const privateDoctor = privateDoctors[text(r[0])];
    if (!privateDoctor?.calendarId && text(r[3]).toUpperCase() !== 'FALSE') throw new AppError('doctor_calendar_not_configured');
    return [r[0], r[1], privateDoctor?.calendarId || '', r[2] || '', privateDoctor?.email || '', r[3] ?? true, r[4] || ''] as Row;
  });
}
export async function appendRaw(sheetId: string, range: string, row: Row, signal?: AbortSignal) {
  const [tab, columns] = range.split('!');
  if (!/^A:[A-Z]+$/.test(columns) || !['Appointments', 'Patients', 'Doctors'].includes(tab))
    throw new AppError('invalid_sheet_range');
  // values.append guesses a logical table and can start in column B even for A:N.
  // Serialize writers and address the next row explicitly, then verify its identity.
  return withLease(`sheet-write:${sheetId}:${tab}`, async () => {
    const [rows] = await sheetValues(sheetId, [range], signal, true);
    if (rows.some((r, i) => i > 0 && !r[0] && r.some(c => text(c))))
      throw new AppError('misaligned_sheet_row_repair_required');
    if (rows.some((r, i) => i > 0 && r[0] === row[0])) return;
    const next = rows.length + 1;
    const target = `${tab}!A${next}:${columns.split(':')[1]}${next}`;
    let writeError: unknown;
    try {
      const result = await googleRequest<{ updatedCells?: number }>('sheets',
        `/spreadsheets/${sheetId}/values/${encodeURIComponent(target)}?valueInputOption=RAW`,
        { method: 'PUT', body: { values: [row] }, signal });
      if (result.updatedCells !== row.length) throw new AppError('sheets_write_unconfirmed');
    } catch (error) { writeError = error; }
    const [verified] = await sheetValues(sheetId, [range], signal, true);
    const saved = verified.find((r, i) => i > 0 && r[0] === row[0]);
    if (!saved || row.some((cell, i) => text(saved[i]) !== text(cell)))
      throw writeError || new AppError('sheets_write_unconfirmed');
  }, { signal });
}
export async function appendCleanBooking(sheetId: string, row: Row, signal?: AbortSignal) {
  const saved = await savePrivateBooking(sheetId, row);
  await withLease(`patients:${sheetId}`, async () => {
    const [rows] = await sheetValues(sheetId, ['Patients!A:D'], signal);
    requireHeader(rows, schema.Patients);
    if (!rows.some(r => r[0] === saved.patientId)) {
      try { await appendRaw(sheetId, 'Patients!A:D', [saved.patientId, row[8], text(row[9]), row[10]], signal); }
      catch (error) {
        const [recheck] = await sheetValues(sheetId, ['Patients!A:D'], signal);
        if (!recheck.some(r => r[0] === saved.patientId)) throw error;
      }
    }
  }, { signal });
  const [existing] = await sheetValues(sheetId, ['Appointments!A:N'], signal);
  requireHeader(existing, schema.Appointments);
  if (!existing.some(r => r[0] === saved.bookingId)) await appendRaw(sheetId, 'Appointments!A:N', appointmentCells(row, saved.patientId), signal);
}
export async function updatePrivateNote(sheetId: string, id: string, note: string) {
  const records = await collection<PrivateBooking>('booking_private');
  const record = await records.findOne({ _id: `${sheetId}:${id}` });
  if (!record) throw new AppError('booking_data_incomplete');
  const purpose = `booking-private:${record._id}`;
  const data = JSON.parse(decrypt(record.data, purpose));
  data.notes = note;
  const result = await records.updateOne({ _id: record._id }, { $set: { data: encrypt(JSON.stringify(data), purpose) } });
  if (!result.matchedCount) throw new AppError('private_booking_write_failed');
}
