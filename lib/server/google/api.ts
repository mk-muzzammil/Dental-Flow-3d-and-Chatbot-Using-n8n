import 'server-only';
import { accessToken, connectionStatus } from './oauth';
import { settings } from './settings';
import { AppError, deadline } from '../config';
export type Row = (string | number | boolean)[];
export type GoogleEvent = {
  id: string;
  status?: string;
  created?: string;
  summary?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
};
export type BusyResponse = {
  calendars?: Record<string, { busy?: { start: string; end: string }[]; errors?: unknown[] }>;
};
export async function googleRequest<T>(
  service: 'sheets' | 'calendar' | 'gmail',
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal; deletedOK?: boolean } = {},
): Promise<T> {
  const host = {
    sheets: 'https://sheets.googleapis.com/v4',
    calendar: 'https://www.googleapis.com/calendar/v3',
    gmail: 'https://gmail.googleapis.com/gmail/v1',
  }[service];
  const token = await accessToken(options.signal),
    method = options.method || 'GET';
  for (let attempt = 0; ; attempt++) {
    const result = await fetch(host + path, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: deadline(20_000, options.signal),
      cache: 'no-store',
    });
    if (options.deletedOK && [404, 410].includes(result.status)) return undefined as T;
    if (result.ok) return (result.status === 204 ? undefined : await result.json()) as T;
    // Only reads can be replayed without reconciling their external effects.
    if (method === 'GET' && attempt < 2 && [429, 500, 502, 503, 504].includes(result.status)) {
      await new Promise((r) => setTimeout(r, 200 * 2 ** attempt + Math.random() * 100));
      continue;
    }
    throw new AppError(`${service}_${result.status}`, result.status >= 500 ? 503 : 502, service);
  }
}
export async function readRanges(ranges: string[], signal?: AbortSignal): Promise<Row[][]> {
  const s = await settings();
  if (!s.sheetId) throw new AppError('missing_google_sheets_id');
  const q = new URLSearchParams();
  ranges.forEach((range) => q.append('ranges', range));
  const result = await googleRequest<{ valueRanges?: { values?: Row[] }[] }>(
    'sheets',
    `/spreadsheets/${encodeURIComponent(s.sheetId)}/values:batchGet?${q}`,
    { signal },
  );
  return ranges.map((_, i) => result.valueRanges?.[i]?.values || []);
}
export async function updateRange(range: string, values: Row[], signal?: AbortSignal) {
  const s = await settings();
  const result = await googleRequest<{ updatedCells?: number }>(
    'sheets',
    `/spreadsheets/${encodeURIComponent(s.sheetId)}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    { method: 'PUT', body: { values }, signal },
  );
  if (!result.updatedCells) throw new AppError('sheets_write_unconfirmed');
}
export async function appendAppointment(values: Row, signal?: AbortSignal) {
  const s = await settings();
  const result = await googleRequest<{ updates?: { updatedRows?: number } }>(
    'sheets',
    `/spreadsheets/${encodeURIComponent(s.sheetId)}/values/Appointments!A:U:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: 'POST', body: { values: [values] }, signal },
  );
  if (result.updates?.updatedRows !== 1) throw new AppError('sheets_append_unconfirmed');
}
const calendarPath = (id: string) => `/calendars/${encodeURIComponent(id)}/events`;
export const freeBusy = (body: unknown, signal?: AbortSignal) =>
  googleRequest<BusyResponse>('calendar', '/freeBusy', { method: 'POST', body, signal });
export const createEvent = (calendar: string, body: unknown, signal?: AbortSignal) =>
  googleRequest<GoogleEvent>('calendar', calendarPath(calendar), { method: 'POST', body, signal });
export const patchEvent = (calendar: string, id: string, body: unknown, signal?: AbortSignal) =>
  googleRequest<GoogleEvent>('calendar', `${calendarPath(calendar)}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body,
    signal,
  });
export const deleteEvent = (calendar: string, id: string, signal?: AbortSignal) =>
  googleRequest<void>('calendar', `${calendarPath(calendar)}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    deletedOK: true,
    signal,
  });
export async function listEvents(calendar: string, query: URLSearchParams, signal?: AbortSignal) {
  const items: GoogleEvent[] = [];
  let page: string | undefined;
  do {
    if (page) query.set('pageToken', page);
    const result = await googleRequest<{ items?: GoogleEvent[]; nextPageToken?: string }>(
      'calendar',
      `${calendarPath(calendar)}?${query}`,
      { signal },
    );
    items.push(...(result.items || []));
    page = result.nextPageToken;
  } while (page);
  return items;
}
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  messageId: string,
  signal?: AbortSignal,
) {
  const emailAddress = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
  if (!emailAddress.test(to) || /[\r\n]/.test(subject + messageId)) throw new AppError('invalid_email', 400);
  const owner = await connectionStatus();
  if (owner.status !== 'connected' || !owner.email || !emailAddress.test(owner.email))
    throw new AppError('google_reconnect_required');
  // Fold encoded words without splitting UTF-8 characters (RFC 2047's 75-character limit).
  const chunks: string[] = [];
  let chunk = '';
  for (const character of subject) {
    if (Buffer.byteLength(chunk + character) > 42) {
      chunks.push(chunk);
      chunk = '';
    }
    chunk += character;
  }
  chunks.push(chunk);
  const encodedSubject = chunks
    .map((part) => `=?UTF-8?B?${Buffer.from(part).toString('base64')}?=`)
    .join('\r\n ');
  const raw = [
    `From: ${owner.email}`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    `Message-ID: <${messageId}@dentalflow.local>`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html)
      .toString('base64')
      .match(/.{1,76}/g)
      ?.join('\r\n') || '',
  ].join('\r\n');
  const sent = await googleRequest<{ id: string }>('gmail', '/users/me/messages/send', {
    method: 'POST',
    body: { raw: Buffer.from(raw).toString('base64url') },
    signal,
  });
  if (!sent.id) throw new AppError('gmail_send_unconfirmed');
  return sent;
}
