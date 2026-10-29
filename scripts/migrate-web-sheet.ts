/** Run with --sheet-id <website workbook ID>; add --apply after reviewing the dry run. */
import { loadEnvConfig } from '@next/env';
import assert from 'node:assert/strict';
import { collection, initializeDatabase, retentionDate } from '../lib/server/db';
import { settings, type Settings } from '../lib/server/google/settings';
import { googleRequest, type Row } from '../lib/server/google/api';
import { encrypt, decrypt, type Ciphertext } from '../lib/server/security';
import { fromRow, identity } from '../lib/server/dental/appointments';
import { validateConfiguration, encryptDoctorConnections, type StorageProfile, type DoctorConnection } from '../lib/server/storage/profile';
import { sheetValues, savePrivateBooking, appointmentCells, patientId, cleanBookingRows, requireHeader } from '../lib/server/storage/worksheets';
import schema from '../lib/server/storage/schema.json';
import { withLease } from '../lib/server/operations/lease';
loadEnvConfig(process.cwd(), true);

type SheetMeta = { properties: { sheetId: number; title: string; gridProperties: { rowCount: number; columnCount: number } } };
type Snapshot = { metadata: { sheets: SheetMeta[] }; values: Record<string, Row[]>; capturedAt: string };
type Backup = { _id: string; data: Ciphertext; createdAt: Date; expiresAt?: Date };
const text = (v: unknown) => String(v ?? '').trim();
async function main() {
  const index = process.argv.indexOf('--sheet-id');
  const sheetId = index >= 0 ? process.argv[index + 1] : '';
  const selected = await settings();
  if (!sheetId || sheetId !== selected.sheetId) throw new Error('Pass --sheet-id matching the selected website workbook.');
  if (sheetId === '1N-qE4v81o0uxyXxLFeCamHSkvALFQIixrES3K6-hE6c') throw new Error('The original n8n workbook is explicitly excluded.');
  await initializeDatabase();
  await withLease(`sheet-migration:${sheetId}`, async () => {
    const profiles = await collection<StorageProfile>('clinic_configuration');
    const existing = await profiles.findOne({ _id: sheetId });
    if (existing?.state === 'active') {
      const rows = await cleanBookingRows(sheetId);
      console.log(JSON.stringify({ state: 'already_migrated', appointments: rows.filter(r => r[0]).length }));
      return;
    }
    const backupId = `${sheetId}:clean-v2`;
    const backups = await collection<Backup>('migration_backups');
    const saved = await backups.findOne({ _id: backupId });
    let snapshot: Snapshot;
    if (saved) snapshot = JSON.parse(decrypt(saved.data, `migration:${backupId}`));
    else {
      const metadata = await googleRequest<Snapshot['metadata']>('sheets', `/spreadsheets/${sheetId}?fields=sheets(properties)`);
      const ranges = metadata.sheets.map(s => `'${s.properties.title.replaceAll("'", "''")}'!A1:${column(s.properties.gridProperties.columnCount)}${s.properties.gridProperties.rowCount}`);
      const values = await sheetValues(sheetId, ranges);
      snapshot = { metadata, values: Object.fromEntries(metadata.sheets.map((s, i) => [s.properties.title, values[i]])), capturedAt: new Date().toISOString() };
    }
    const required = ['Appointments', 'Doctors', 'Services', 'Hours', 'Settings', 'Holidays', 'FAQ', 'Specializations'];
    if (required.some(t => !snapshot.values[t])) throw new Error('Required legacy tabs are missing; no changes made.');
    requireHeader(snapshot.values.Appointments, ['reference', 'created_at', 'status', 'service_id', 'service_name', 'date', 'time', 'duration_min', 'name', 'phone', 'email', 'notes', 'event_id', 'token', 'expires_at', 'first_visit', 'price', 'reminders_sent', 'doctor', 'doctor_name', 'calendar_id']);
    const configuration = validateConfiguration(Object.fromEntries(['Services', 'Hours', 'Settings', 'Holidays', 'FAQ', 'Specializations'].map(k => [k.toLowerCase(), snapshot.values[k].slice(1)])));
    configuration.settings = configuration.settings.filter(r => !/^(wa_|handoff_)/.test(text(r[0])));
    const connections: Record<string, DoctorConnection> = Object.create(null);
    const specs = new Map(configuration.specializations.map(r => [text(r[0]), text(r[1])]));
    const doctors = snapshot.values.Doctors.slice(1).filter(r => r[0]).map(r => {
      connections[text(r[0])] = { calendarId: text(r[2]), email: text(r[4]) };
      const ids = text(r[6]);
      return [r[0], r[1], r[3] || '', r[5] ?? true, ids, ids ? ids.split(/[\s,;]+/).map(id => specs.get(id) || id).join(', ') : 'Not specified'] as Row;
    });
    const legacy = snapshot.values.Appointments.slice(1).filter(r => r[0]).map(r => {
      const b = fromRow(r, selected.calendarId);
      if (!b.token || !b.eventId || !/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !/^\d{2}:\d{2}$/.test(b.time)) throw new Error('A booking needs reconciliation before migration.');
      const normalized = [...r]; normalized[5] = b.date; normalized[6] = b.time; normalized[20] = b.calendarId;
      return normalized;
    });
    if (new Set(legacy.map(r => identity(fromRow(r, selected.calendarId)))).size !== legacy.length) throw new Error('Duplicate booking identities need reconciliation.');
    const patients = [...new Map(legacy.map(r => {
      const id = patientId(sheetId, r);
      return [id, [id, text(r[8]), text(r[9]), text(r[10])] as Row] as const;
    })).values()];
    const output = { Appointments: [schema.Appointments, ...legacy.map(r => appointmentCells(r, patientId(sheetId, r)))], Patients: [schema.Patients, ...patients], Doctors: [schema.Doctors, ...doctors] };
    console.log(JSON.stringify({ apply: process.argv.includes('--apply'), appointments: legacy.length, patients: patients.length, doctors: doctors.length, keepTabs: Object.keys(output), moveConfigurationTo: 'MongoDB', privateFields: 'AES-256-GCM encrypted MongoDB records' }));
    if (!process.argv.includes('--apply')) return;
    if (!saved) await backups.insertOne({ _id: backupId, data: encrypt(JSON.stringify(snapshot), `migration:${backupId}`), createdAt: new Date() });
    // This flag blocks booking reads and Calendar/Gmail mutations until verified.
    await profiles.updateOne({ _id: sheetId }, { $set: { version: 2, state: 'migrating', configuration, doctorConnections: encryptDoctorConnections(sheetId, connections), updatedAt: new Date() } }, { upsert: true });
    const leases = await collection<{ _id: string; until: Date }>('execution_leases');
    for (let attempt = 0; ; attempt++) {
      const active = await leases.countDocuments({ _id: { $ne: `sheet-migration:${sheetId}` }, until: { $gt: new Date() } });
      if (!active) break;
      if (attempt >= 15) throw new Error('Waiting for active operations. Migration stays paused; rerun this command.');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    const [currentHeader] = await sheetValues(sheetId, ['Appointments!A1:U1']);
    if (currentHeader[0]?.[0] !== 'booking_id') {
      // A booking made after the snapshot must not be overwritten.
      const [currentBookings] = await sheetValues(sheetId, ['Appointments!A:U']);
      assert(JSON.stringify(currentBookings) === JSON.stringify(snapshot.values.Appointments.map(r => r.slice(0, 21))), 'Appointments changed since snapshot; reconcile the encrypted snapshot before proceeding.');
      for (const row of legacy) await savePrivateBooking(sheetId, row);
      const metadata = await googleRequest<Snapshot['metadata']>('sheets', `/spreadsheets/${sheetId}?fields=sheets(properties)`);
      const keep = new Set(Object.keys(output));
      const requests: unknown[] = [];
      const existingIds = new Set(metadata.sheets.map(s => s.properties.sheetId));
      let newId = 800000;
      for (const [title, values] of Object.entries(output)) {
        const old = metadata.sheets.find(s => s.properties.title === title);
        while (existingIds.has(newId)) newId++;
        const id = old?.properties.sheetId ?? newId++;
        existingIds.add(id);
        if (!old) requests.push({ addSheet: { properties: { sheetId: id, title, gridProperties: { rowCount: Math.max(1000, values.length + 100), columnCount: values[0].length, frozenRowCount: 1 } } } });
        else {
          requests.push({ updateCells: { range: { sheetId: id }, fields: 'userEnteredValue,note,textFormatRuns,dataValidation' } });
          const width = old.properties.gridProperties.columnCount;
          if (width > values[0].length) requests.push({ deleteDimension: { range: { sheetId: id, dimension: 'COLUMNS', startIndex: values[0].length, endIndex: width } } });
          requests.push({ updateSheetProperties: { properties: { sheetId: id, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } });
        }
        requests.push({ updateCells: { start: { sheetId: id, rowIndex: 0, columnIndex: 0 }, rows: values.map(row => ({ values: values[0].map((_, i) => ({ userEnteredValue: typeof row[i] === 'number' ? { numberValue: row[i] } : typeof row[i] === 'boolean' ? { boolValue: row[i] } : { stringValue: text(row[i]) } })) })), fields: 'userEnteredValue' } });
        requests.push({ repeatCell: { range: { sheetId: id }, cell: { userEnteredFormat: { backgroundColorStyle: { rgbColor: { red: 1, green: 1, blue: 1 } }, textFormat: { foregroundColorStyle: { rgbColor: { red: 0.04, green: 0.1, blue: 0.17 } }, fontSize: 10, bold: false }, wrapStrategy: 'WRAP', verticalAlignment: 'TOP' } }, fields: 'userEnteredFormat' } });
        requests.push({ repeatCell: { range: { sheetId: id, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { backgroundColorStyle: { rgbColor: { red: 0.075, green: 0.29, blue: 0.49 } }, textFormat: { foregroundColorStyle: { rgbColor: { red: 1, green: 1, blue: 1 } }, bold: true } } }, fields: 'userEnteredFormat.backgroundColorStyle,userEnteredFormat.textFormat' } });
        requests.push({ updateDimensionProperties: { range: { sheetId: id, dimension: 'COLUMNS', startIndex: 0, endIndex: values[0].length }, properties: { pixelSize: 160 }, fields: 'pixelSize' } });
        // Internal row IDs remain available for reconciliation but are hidden from reception's main view.
        if (title === 'Appointments') requests.push({ updateDimensionProperties: { range: { sheetId: id, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { hiddenByUser: true }, fields: 'hiddenByUser' } });
        requests.push({ autoResizeDimensions: { dimensions: { sheetId: id, dimension: 'ROWS', startIndex: 0, endIndex: values.length } } });
      }
      for (const old of metadata.sheets) if (!keep.has(old.properties.title)) requests.push({ deleteSheet: { sheetId: old.properties.sheetId } });
      // Remove old status formatting, which pointed at a different column in v1.
      const formats = await googleRequest<{ sheets: { properties: { sheetId: number }; conditionalFormats?: unknown[] }[] }>('sheets', `/spreadsheets/${sheetId}?fields=sheets(properties(sheetId),conditionalFormats)`);
      const keptIds = new Set(metadata.sheets.filter(s => keep.has(s.properties.title)).map(s => s.properties.sheetId));
      const removeFormats = formats.sheets.flatMap(s => keptIds.has(s.properties.sheetId) ? (s.conditionalFormats || []).map((_, i, a) => ({ deleteConditionalFormatRule: { sheetId: s.properties.sheetId, index: a.length - i - 1 } })) : []);
      await googleRequest('sheets', `/spreadsheets/${sheetId}:batchUpdate`, { method: 'POST', body: { requests: [...removeFormats, ...requests] } });
    }
    const hydrated = (await cleanBookingRows(sheetId)).filter(r => r[0]);
    assert.equal(hydrated.length, legacy.length);
    for (let i = 0; i < legacy.length; i++) assert(JSON.stringify(fromRow(hydrated[i], selected.calendarId)) === JSON.stringify(fromRow(legacy[i], selected.calendarId)), 'Booking verification failed; migration remains paused.');
    const finalMeta = await googleRequest<Snapshot['metadata']>('sheets', `/spreadsheets/${sheetId}?fields=sheets(properties)`);
    assert.deepEqual(finalMeta.sheets.map(s => s.properties.title).sort(), Object.keys(output).sort());
    await profiles.updateOne({ _id: sheetId }, { $set: { state: 'active', updatedAt: new Date() } });
    await (await collection<Settings>('app_settings')).updateOne({ _id: 'clinic' }, { $set: { schemaVersion: 2, ready: false } });
    await (await collection('clinic_cache')).deleteMany({});
    await backups.updateOne({ _id: backupId }, { $set: { expiresAt: retentionDate(30) } });
    console.log(JSON.stringify({ state: 'verified', preservedBookings: hydrated.length, tabs: Object.keys(output), encryptedBackupRetentionDays: 30 }));
  });
}
function column(n: number) { let value = ''; while (n > 0) { n--; value = String.fromCharCode(65 + n % 26) + value; n = Math.floor(n / 26); } return value; }
main().then(() => process.exit(0)).catch(error => { console.error(error instanceof Error ? error.message : 'Migration failed'); process.exit(1); });
