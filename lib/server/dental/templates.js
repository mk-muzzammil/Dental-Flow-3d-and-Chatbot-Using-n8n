// Existing patient templates, with approved escaping and website-only links.
import { escapeHtml as esc } from '../security';
const decorate = (b, c) => ({
  ...c,
  ...b,
  ref: b.reference,
  token: b.token,
  prettyDate: new Date(b.date + 'T12:00:00Z').toLocaleDateString('en-GB', {
    timeZone: c.TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }),
  prettyTime: (() => {
    const [h, m] = b.time.split(':').map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  })(),
  appt: {
    ...b,
    ref: b.reference,
    serviceName: b.service,
    doctorName: b.dentist,
    duration: b.minutes,
    when: '',
  },
});

const page = (tone, title, body, extra) => {
  const bar = { good: '#047857', warn: '#B45309', bad: '#B91C1C' }[tone];
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:'Atkinson Hyperlegible',system-ui,sans-serif;background:#F2FBFD;color:#123F52;
margin:0;padding:24px;display:flex;align-items:center;justify-content:center;min-height:100vh;line-height:1.55}
.c{background:#fff;border:1px solid #CDE9F1;border-radius:20px;max-width:520px;width:100%;
box-shadow:0 12px 40px -18px rgba(18,63,82,.3);overflow:hidden}
.h{background:${bar};color:#fff;padding:26px 28px}.h h1{margin:0;font-size:21px}
.b{padding:28px}.b p{margin:0 0 15px}
table{width:100%;border-collapse:collapse;font-size:14px;margin:18px 0}
td{padding:10px 0;border-top:1px solid #EDF5F8}td:first-child{color:#4A6572}
td:last-child{text-align:right;font-weight:700}
.btn{display:block;text-align:center;background:#0E7490;color:#fff;text-decoration:none;
padding:14px;border-radius:12px;font-weight:700;margin-top:8px}
.f{font-size:12px;color:#4A6572;border-top:1px solid #EDF5F8;padding-top:16px;margin-top:22px}</style></head>
<body><div class="c"><div class="h"><h1>${title}</h1></div><div class="b">${body}
<div class="f">${extra || ''}</div></div></div></body></html>`;
};

export function confirmationTemplate(b, c, ev = {}, label = '') {
  const v = decorate(b, c);

  const a = v.appt;
  const gcal = (() => {
    try {
      const s = new Date(ev.start.dateTime),
        e = new Date(ev.end.dateTime);
      const z = (d) =>
        d
          .toISOString()
          .replace(/[-:]/g, '')
          .replace(/\.\d{3}/, '');
      return (
        'https://calendar.google.com/calendar/render?action=TEMPLATE' +
        `&text=${encodeURIComponent(a.serviceName + ' — ' + v.CLINIC_NAME)}` +
        `&dates=${z(s)}/${z(e)}` +
        `&location=${encodeURIComponent(v.CLINIC_ADDRESS)}` +
        `&details=${encodeURIComponent('Reference ' + a.ref + '. Please arrive 10 minutes early.')}`
      );
    } catch (err) {
      return '';
    }
  })();

  const rows = `<table>
<tr><td>Treatment</td><td>${esc(a.serviceName)}</td></tr>
${a.doctorName ? `<tr><td>Dentist</td><td>${esc(a.doctorName)}</td></tr>` : ''}
<tr><td>Date</td><td>${esc(v.prettyDate)}</td></tr>
<tr><td>Time</td><td>${esc(v.prettyTime)}</td></tr>
<tr><td>Duration</td><td>${esc(a.duration)} minutes</td></tr>
<tr><td>Reference</td><td>${esc(a.ref)}</td></tr></table>`;

  const cancelLink =
    `${v.PUBLIC_BASE}/api/booking-action?ref=${encodeURIComponent(a.ref)}` +
    `&token=${encodeURIComponent(v.token)}&action=cancel`;

  const html = page(
    'good',
    'Your appointment is confirmed',
    `<p>Thank you, <strong>${esc(a.name)}</strong>. We look forward to seeing you.</p>${rows}
   ${gcal ? `<a class="btn" href="${esc(gcal)}">Add to my calendar</a>` : ''}
   <p style="margin-top:20px;font-size:14px;text-align:center">
     <a href="${esc(cancelLink)}" style="color:#4A6572">Need to cancel?</a></p>`,
    `Please arrive 10 minutes early.<br>${esc(v.CLINIC_ADDRESS)} &middot; ${esc(v.CLINIC_PHONE)}`,
  );

  const email = page(
    'good',
    'Appointment confirmed',
    `<p>Hello <strong>${esc(a.name)}</strong>, your appointment at ${esc(v.CLINIC_NAME)} is confirmed.</p>${rows}
   ${gcal ? `<a class="btn" href="${esc(gcal)}">Add to my calendar</a>` : ''}
   <p style="margin-top:18px;font-size:14px">Need to change it?
   <a href="${esc(cancelLink)}">Cancel this appointment</a>.</p>`,
    `Please arrive 10 minutes early.<br>${esc(v.CLINIC_ADDRESS)} &middot; ${esc(v.CLINIC_PHONE)}`,
  );

  return {
    ...v,
    html,
    email,
    subject: `Confirmed: ${esc(a.serviceName)} on ${esc(v.prettyDate)} at ${esc(v.prettyTime)}  [Ref: ${esc(a.ref)}]`,
  };
}

export function cancelledTemplate(b, c, ev = {}, label = '') {
  const v = decorate(b, c),
    a = v.appt;
  const html = page(
    'warn',
    'Appointment cancelled',
    `<p>Your appointment on <strong>${esc(v.prettyDate)} at ${esc(v.prettyTime)}</strong> has been cancelled
   and the slot released for other patients.</p>
   <p>Changed your mind? You can book again any time.</p>
   <a class="btn" href="${esc(v.BOOKING_URL)}">Book a new appointment</a>`,
    `${esc(v.CLINIC_NAME)} &middot; ${esc(v.CLINIC_PHONE)}`,
  );
  return { ...v, html };
}

export function expiryTemplate(b, c, ev = {}, label = '') {
  const v = decorate(b, c);
  const html = `
<div style="font-family:Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#123F52">
  <div style="background:#B45309;color:#fff;padding:20px 24px;border-radius:14px 14px 0 0;font-size:18px;font-weight:bold">
    Your slot hold has expired</div>
  <div style="border:1px solid #CDE9F1;border-top:0;border-radius:0 0 14px 14px;padding:24px;background:#fff">
    <p>Hello ${esc(v.name)},</p>
    <p>We held <strong>${esc(v.prettyDate)} at ${esc(v.prettyTime)}</strong> for you, but the confirmation
       link was not used in time, so the slot has been released for other patients.</p>
    <p>No problem &mdash; you can book again in under a minute.</p>
    <a href="${esc(v.BOOKING_URL)}" style="display:block;text-align:center;background:#0E7490;color:#fff;
       text-decoration:none;padding:14px;border-radius:12px;font-weight:bold">Book again</a>
  </div></div>`;
  return { ...v, html, subject: `Your held slot has been released  [Ref: ${v.ref}]` };
}

export function cancellationEmailTemplate(b, c, ev = {}, label = '') {
  /* The answer for the chat window, and the cancellation email for the patient. */
  const v = decorate(b, c);
  const a = { ...b, when: label };
  const sendEmail = v.EMAIL_PATIENT === true && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(a.email);
  const email = `
<div style="font-family:Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#16272F">
  <div style="border-left:3px solid #B91C1C;padding:14px 18px;background:#FEF2F2;border-radius:0 8px 8px 0">
    <p style="margin:0;font-size:15px"><strong>Your appointment has been cancelled.</strong></p>
  </div>
  <p style="font-size:15px;line-height:1.6">Hello ${esc(a.name) || 'there'},</p>
  <p style="font-size:15px;line-height:1.6">The appointment below was cancelled in the chat on our website. The time is now free for another patient.</p>
  <table style="font-size:15px;line-height:1.9;border-collapse:collapse;margin:18px 0">
    <tr><td style="color:#566B75;padding-right:18px">Reference</td><td><strong>${esc(a.reference)}</strong></td></tr>
    <tr><td style="color:#566B75;padding-right:18px">Treatment</td><td>${esc(a.service)}</td></tr>
    ${a.dentist ? `<tr><td style="color:#566B75;padding-right:18px">Dentist</td><td>${esc(a.dentist)}</td></tr>` : ''}
    <tr><td style="color:#566B75;padding-right:18px">Was booked for</td><td>${esc(a.when)}</td></tr>
  </table>
  <p style="font-size:15px;line-height:1.6">Changed your mind? You can book another time in the chat on our website.</p>
  <p style="font-size:13px;color:#566B75;line-height:1.6">${esc(v.CLINIC_NAME)} &middot; ${esc(v.CLINIC_PHONE)}<br>
    If you did not cancel this yourself, please phone us straight away.</p>
</div>`;
  return {
    ...v,
    sendEmail,
    subject: `Cancelled: ${a.service} on ${a.when} (${a.reference})`,
    email,
    response: { ok: true, reference: a.reference, status: 'cancelled', emailed: sendEmail },
  };
}
