import 'server-only';
import { savedClinicDefaults } from '../storage/clinic-defaults';
import { appUrl } from '../config';
import { escapeHtml as esc, digest } from '../security';
import { sendEmail, type GoogleEvent } from '../google/api';
import { operate } from '../operations/journal';
import { identity, when, type Booking } from './appointments';
import {
  confirmationTemplate,
  cancellationEmailTemplate,
  expiryTemplate,
  cancelledTemplate,
} from './templates';
export function actionLink(b: Booking, action: string) {
  return `${appUrl()}/api/booking-action?${new URLSearchParams({ ref: b.reference, token: b.token, action })}`;
}
export function page(title: string, body: string, tone: 'good' | 'warn' | 'bad' = 'good', footer = '') {
  const bar = { good: '#047857', warn: '#B45309', bad: '#B91C1C' }[tone];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{font-family:system-ui,sans-serif;background:#F2FBFD;color:#123F52;margin:0;padding:24px;line-height:1.55}.c{background:#fff;border:1px solid #CDE9F1;border-radius:20px;max-width:560px;margin:5vh auto;overflow:hidden}.h{background:${bar};color:white;padding:26px 28px}.h h1{margin:0;font-size:21px}.b{padding:28px}table{width:100%;border-collapse:collapse;font-size:14px;margin:18px 0}td{padding:10px 0;border-top:1px solid #EDF5F8}td:last-child{text-align:right;font-weight:700}.btn{display:block;text-align:center;background:#0E7490;color:white;text-decoration:none;padding:14px;border-radius:12px;font-weight:700;margin-top:8px}.f{font-size:12px;color:#4A6572;border-top:1px solid #EDF5F8;padding-top:16px;margin-top:22px}</style></head><body><div class="c"><div class="h"><h1>${esc(title)}</h1></div><div class="b">${body}<div class="f">${footer}</div></div></div></body></html>`;
}
export function bookingRows(b: Booking) {
  return `<table>${[['Treatment', b.service], ...(b.dentist ? [['Dentist', b.dentist]] : []), ['When', when(b)], ['Duration', `${b.minutes} minutes`], ['Reference', b.reference]].map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>`;
}
export async function confirmation(b: Booking, event?: GoogleEvent) {
  const value = confirmationTemplate(b, await savedClinicDefaults(), event);
  return { html: value.email, page: value.html, subject: value.subject };
}
export async function releaseNotice(b: Booking, expired: boolean) {
  if (expired) return expiryTemplate(b, await savedClinicDefaults());
  const value = cancellationEmailTemplate(b, await savedClinicDefaults(), undefined, when(b));
  return { html: value.email, subject: value.subject };
}
export const cancelledPage = async (b: Booking) => cancelledTemplate(b, await savedClinicDefaults()).html;
export async function notifyBooking(
  b: Booking,
  kind: 'confirmed' | 'cancelled' | 'expired',
  event?: GoogleEvent,
  signal?: AbortSignal,
) {
  if (!b.email) return false;
  const key = `${identity(b)}:${kind}`;
  try {
    return await operate(
      'notification',
      key,
      digest(key),
      async (journal) => {
        await journal.setIdentity(identity(b), b.reference);
        const mail = kind === 'confirmed' ? await confirmation(b, event) : await releaseNotice(b, kind === 'expired');
        await journal.step(
          'send',
          () => sendEmail(b.email, mail.subject, mail.html, journal.id, signal),
          undefined,
          true,
        );
        return true;
      },
      signal,
    );
  } catch {
    return false;
  } // Delivery failure must not undo a confirmed booking or successful cancellation.
}
