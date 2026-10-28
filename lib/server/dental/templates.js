// Shared patient email and action-page design. All dynamic HTML values are escaped.
import { escapeHtml as esc } from '../security';

const decorate = (b, c) => ({
  ...c, ...b, ref: b.reference,
  prettyDate: new Date(b.date + 'T12:00:00Z').toLocaleDateString('en-GB', {
    timeZone: c.TIMEZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }),
  prettyTime: (() => {
    const [h, m] = b.time.split(':').map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  })(),
});

const paragraph = (text) => `<p class="copy" style="margin:0 0 18px;color:#33465a;font-size:15px;line-height:1.7">${text}</p>`;
const link = (label, url) => `<a class="text-link" href="${esc(url)}" style="color:#134a7c;text-decoration:underline;font-weight:600">${esc(label)}</a>`;
const button = (label, url) => `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:24px 0"><tr><td class="button-cell" align="center" bgcolor="#134a7c" style="background-color:#134a7c;border-radius:12px;mso-padding-alt:16px 24px"><a class="button-link" href="${esc(url)}" style="display:block;padding:16px 24px;color:#ffffff !important;text-decoration:none;font:700 15px/1.4 Arial,Helvetica,sans-serif;border:1px solid #134a7c;border-radius:12px"><span style="color:#ffffff">${esc(label)}</span></a></td></tr></table>`;

function details(v) {
  const rows = [
    ['Treatment', v.service], ...(v.dentist ? [['Dentist', v.dentist]] : []),
    ['Date', v.prettyDate], ['Time', v.prettyTime], ['Duration', `${v.minutes} minutes`], ['Reference', v.ref],
  ];
  return `<table class="details" cellspacing="0" cellpadding="0" border="0" width="100%" style="width:100%;border-collapse:collapse;margin:24px 0;table-layout:fixed">${rows.map(([label, value]) => `<tr><th class="detail-label" scope="row" width="30%" align="left" valign="top" style="width:30%;padding:13px 12px 13px 0;border-bottom:1px solid #e1e7ed;color:#52677b;font-size:13px;font-weight:400;line-height:1.6;text-align:left">${esc(label)}</th><td class="detail-value" valign="top" style="padding:13px 0;border-bottom:1px solid #e1e7ed;color:#0a1a2b;font-size:14px;font-weight:600;line-height:1.6;overflow-wrap:anywhere;word-break:break-word">${esc(value)}</td></tr>`).join('')}</table>`;
}

/** Inline styles cover clients that strip CSS; media queries enhance clients with dark-mode support. */
function layout(v, status, title, preheader, content, note) {
  const tones = {
    confirmed: ['Confirmed', '#047857', '#ecfdf5'],
    cancelled: ['Cancelled', '#9f3345', '#fff1f2'],
    expired: ['Hold expired', '#92400e', '#fffbeb'],
  };
  const [badge, color, background] = tones[status];
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${esc(title)}</title>
<style>
:root{color-scheme:light dark;supported-color-schemes:light dark}
body,table,td,th,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table{border-spacing:0}a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}
@media(max-width:620px){.outer{padding:16px 8px!important}.header,.content,.footer{padding-left:22px!important;padding-right:22px!important}.title{font-size:28px!important}.detail-label{width:29%!important}}
@media(prefers-color-scheme:dark){body,.canvas{background-color:#0a1a2b!important}.card,.content{background-color:#13263b!important}.header{background-color:#0b2f52!important}.title,.detail-value{color:#edf4fb!important}.copy{color:#d2dfed!important}.muted,.detail-label{color:#a8bacd!important}.footer{background-color:#102236!important}.card,.footer,.detail-label,.detail-value{border-color:#2d435c!important}.text-link{color:#9dcefa!important}.button-cell{background-color:#134a7c!important}.button-link,.button-link span{color:#ffffff!important}.status{background-color:#203e58!important;color:#d5eaff!important}}
[data-ogsc] .canvas{background-color:#0a1a2b!important}[data-ogsc] .card,[data-ogsc] .content{background-color:#13263b!important}[data-ogsc] .copy,[data-ogsc] .detail-value,[data-ogsc] .title{color:#edf4fb!important}[data-ogsc] .footer{background-color:#102236!important}[data-ogsc] .card,[data-ogsc] .footer,[data-ogsc] .detail-label,[data-ogsc] .detail-value{border-color:#2d435c!important}[data-ogsc] .status{background-color:#203e58!important;color:#d5eaff!important}[data-ogsc] .muted,[data-ogsc] .detail-label{color:#a8bacd!important}[data-ogsc] .text-link{color:#9dcefa!important}[data-ogsc] .button-link,[data-ogsc] .button-link span{color:#ffffff!important}
</style></head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#0a1a2b">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${esc(preheader)}</div>
<table class="canvas" role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f4f6f8" style="width:100%;background-color:#f4f6f8"><tr><td class="outer" align="center" style="padding:40px 16px">
<table class="card" role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e1e7ed;border-radius:20px;overflow:hidden">
<tr><td class="header" bgcolor="#0b2f52" style="background-color:#0b2f52;padding:28px 36px;border-radius:19px 19px 0 0"><p style="margin:0 0 8px;color:#b8d8f3;font-size:11px;line-height:1.4;font-weight:700;letter-spacing:2px;text-transform:uppercase">Patient care</p><p style="margin:0;color:#ffffff;font-size:20px;line-height:1.4;font-weight:700">${esc(v.CLINIC_NAME)}</p></td></tr>
<tr><td class="content" style="padding:32px 36px;background-color:#ffffff">
<span class="status" style="display:inline-block;padding:6px 11px;border-radius:30px;font-size:11px;line-height:1.4;font-weight:700;color:${color};background-color:${background}">${esc(badge)}</span>
<h1 class="title" style="margin:18px 0 22px;color:#0a1a2b;font:400 32px/1.2 Georgia,'Times New Roman',serif">${esc(title)}</h1>
${content}
</td></tr>
<tr><td class="footer" bgcolor="#f4f6f8" style="padding:24px 36px;background-color:#f4f6f8;border-top:1px solid #e1e7ed;border-radius:0 0 19px 19px">
<p class="muted" style="margin:0 0 12px;color:#52677b;font-size:12px;line-height:1.7">${note}</p>
<p class="muted" style="margin:0;color:#52677b;font-size:12px;line-height:1.7"><strong>${esc(v.CLINIC_NAME)}</strong><br>${esc(v.CLINIC_ADDRESS)}<br>${esc(v.CLINIC_PHONE)}</p>
</td></tr></table></td></tr></table></body></html>`;
}

function calendarLink(v, event) {
  try {
    const stamp = (s) => new Date(s).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const q = new URLSearchParams({ action: 'TEMPLATE', text: `${v.service} — ${v.CLINIC_NAME}`,
      dates: `${stamp(event.start.dateTime)}/${stamp(event.end.dateTime)}`, location: v.CLINIC_ADDRESS,
      details: `Reference ${v.ref}. Please arrive 10 minutes early.` });
    return `https://calendar.google.com/calendar/render?${q}`;
  } catch { return ''; }
}

export function confirmationTemplate(b, c, event = {}) {
  const v = decorate(b, c);
  const addCalendar = calendarLink(v, event);
  const cancel = `${v.PUBLIC_BASE}/api/booking-action?${new URLSearchParams({ref:v.ref,token:v.token,action:'cancel'})}`;
  const html = layout(v, 'confirmed', 'Your appointment is confirmed', `${v.prettyDate} at ${v.prettyTime} with ${v.dentist || v.CLINIC_NAME}.`,
    paragraph(`Hello <strong>${esc(v.name)}</strong>, your appointment is confirmed. We look forward to welcoming you.`) + details(v)
    + (addCalendar ? button('Add to my calendar', addCalendar) : '')
    + paragraph(`Need to change your plans? ${link('Cancel this appointment', cancel)}.`),
    'Please arrive 10 minutes early. You can view your appointments or book another visit in the chat on our website.');
  return { ...v, html, email: html,
    // Plain-text headers are validated and MIME-encoded by the Gmail adapter.
    subject: `Confirmed: ${v.service} on ${v.prettyDate} at ${v.prettyTime}  [Ref: ${v.ref}]` };
}

export function cancelledTemplate(b, c) {
  const v = decorate(b, c);
  const html = layout(v, 'cancelled', 'Your appointment is cancelled', `Appointment ${v.ref} is cancelled and the time has been released.`,
    paragraph(`Hello <strong>${esc(v.name) || 'there'}</strong>, your appointment has been cancelled. This time is now available for another patient.`)
    + details(v) + button('Book a new appointment', v.BOOKING_URL)
    + paragraph('You can choose another treatment, dentist or time in the chat on our website.'),
    'If you did not request this cancellation, please call the clinic.');
  return { ...v, html };
}

export function expiryTemplate(b, c) {
  const v = decorate(b, c);
  const html = layout(v, 'expired', 'Your slot hold has expired', `The hold for ${v.prettyDate} at ${v.prettyTime} has expired.`,
    paragraph(`Hello <strong>${esc(v.name) || 'there'}</strong>, the confirmation period for your held appointment ended, so the time has been released.`)
    + details(v) + button('Choose another time', v.BOOKING_URL)
    + paragraph('You can check the latest available times and book again in the chat on our website.'),
    'This notice concerns an unconfirmed hold. Please call the clinic if you need help choosing another time.');
  return { ...v, html, subject: `Your held slot has been released  [Ref: ${v.ref}]` };
}

export function cancellationEmailTemplate(b, c, event = {}, label = '') {
  const v = decorate(b, c);
  const { html: email } = cancelledTemplate(b, c);
  const sendEmail = v.EMAIL_PATIENT === true && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(b.email);
  return { ...v, sendEmail, email,
    subject: `Cancelled: ${b.service} on ${label || `${v.prettyDate} at ${v.prettyTime}`} (${b.reference})`,
    response: { ok: true, reference: b.reference, status: 'cancelled', emailed: sendEmail } };
}
