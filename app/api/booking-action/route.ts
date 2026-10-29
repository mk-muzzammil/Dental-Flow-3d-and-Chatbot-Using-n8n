import { type NextRequest } from 'next/server';
import { appMode, AppError, safeError, deadline, clinicDefaults } from '@/lib/server/config';
import { findBooking } from '@/lib/server/dental/appointments';
import { actionGuard, cancelBooking, confirmBooking } from '@/lib/server/dental/actions';
import {
  actionLink,
  bookingRows,
  confirmation,
  cancelledPage,
  page,
} from '@/lib/server/dental/notifications';
import { escapeHtml as esc } from '@/lib/server/security';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(request: NextRequest) {
  let html = '',
    status = 200;
  try {
    if (appMode() !== 'live') throw new AppError('demo_mode', 400);
    const q = request.nextUrl.searchParams,
      ref = q.get('ref') || '',
      token = q.get('token') || '',
      action = (q.get('action') || 'confirm').toLowerCase();
    if (
      !ref ||
      ref.length > 30 ||
      !token ||
      token.length > 200 ||
      !['confirm', 'cancel'].includes(action || '')
    )
      throw new AppError('invalid-link', 400);
    const signal = deadline(55_000, request.signal),
      b = await findBooking(ref, token, signal);
    if (!b) throw new AppError('not-found', 404);
    actionGuard(b, action as 'confirm' | 'cancel', 'token');
    if (action === 'confirm' && b.status === 'CONFIRMED')
      html = page('Your appointment is already confirmed', bookingRows(b));
    else if (action === 'cancel' && q.get('do') !== '1')
      html = page(
        'Cancel this appointment?',
        `${bookingRows(b)}<a class="btn" href="${esc(actionLink(b, 'cancel') + '&do=1')}">Yes, cancel my appointment</a>`,
        'warn',
      );
    else if (action === 'confirm') {
      const result = await confirmBooking(ref, token, signal);
      html = (await confirmation(result.booking, result.event)).page;
    } else {
      await cancelBooking(ref, { token }, signal);
      html = await cancelledPage(b);
    }
  } catch (error) {
    const detail = safeError(error);
    status = detail.status;
    const messages: Record<string, string> = {
      expired: 'This hold has expired. Please choose another appointment.',
      cancelled: 'This appointment has already been cancelled.',
      'too-late': 'It is too close to your appointment to cancel online. Please call the clinic.',
      past: 'This appointment has already passed.',
      'not-found': 'We could not find this appointment.',
      'invalid-link': 'This appointment link is not valid.',
    };
    html = page(
      'Appointment action unavailable',
      `<p>${esc(messages[detail.code] || 'We could not complete this action. Please contact the clinic before trying again.')}</p><p>${esc(clinicDefaults().CLINIC_PHONE)}</p>`,
      'warn',
    );
  }
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}
