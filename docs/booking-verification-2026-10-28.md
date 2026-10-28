# Live booking verification — 28 October 2026

Tested the running localhost website through the user's Chromium session with the
Playwright Extension. Google Sheets, Calendar, Gmail, and MongoDB were live.
All appointment times below are Asia/Karachi (UTC+05:00).

The test patient was **DentalFlow Test Patient**, using phone and email details
explicitly supplied by the owner. No medical information was used. Contact
details and booking tokens are deliberately omitted from this report.

## Test records

| Reference | Entry path | Doctor | Appointment | Calendar | Final state |
| --- | --- | --- | --- | --- | --- |
| DN-390036 | Typed chat with explicit confirmation | Dr. Bilal Ahmed | 29 October, 14:00–14:30 | Dr. Bilal Ahmed (test), separate doctor calendar | CANCELLED |
| DN-786011 | Booking panel → Confirm booking → chat | Dr. Ayesha Khan | 29 October, 12:00–12:30 | Connected owner's primary calendar (Buraq Dev) | CANCELLED |

Each booking produced exactly one appointment row (rows 29 and 30 at test time).
Both rows remain as cancelled history. Both Calendar events have cancelled status,
both time windows are free again, and the test phone has no upcoming appointments.
Existing references DN-536581 and DN-913026 remain CONFIRMED.

## Executed cases

| Case | Procedure | Evidence and result |
| --- | --- | --- |
| Two-appointment limit | Submit the booking panel using the first supplied phone, which already had two upcoming bookings | PASS: chatbot explained the limit and returned no booking card |
| Doctor availability | Select Check-up & Consultation and Dr. Bilal in the booking panel | PASS: live slots appeared on his configured Thursday–Saturday working days |
| Typed booking | Explicitly confirm the offered 29 October 14:00 slot using the second supplied phone | PASS: HTTP 200, reference DN-390036, confirmation card, `emailCopy=true`, `whatsappSent=false` |
| Panel booking | Select Check-up & Consultation, Dr. Ayesha, 29 October 12:00; enter details and press Confirm booking | PASS: HTTP 200, reference DN-786011, confirmation card and email success |
| Sheet persistence | Read A:U for each new reference through the application's Google adapter | PASS: exactly one row per reference; correct patient name, normalized phone, email, service, date, time, 30-minute duration, price 1500, doctor and Calendar ID; event ID and token present; reserved column R remains blank |
| Calendar persistence | Fetch each row's exact Calendar ID/event ID; inspect Calendar browser tab | PASS: confirmed events with correct start/end and timezone in the respective calendars |
| Occupied slot | Query Google free/busy and website daily slots after booking | PASS: Bilal's 14:00 slot was busy and absent from available slots; Ayesha's event was also reported busy |
| Phone lookup | Click View My Appointments and enter the second supplied phone | PASS: website displayed DN-390036 with correct doctor, time and confirmed status |
| Email lookup | Call the website appointment-list API with the supplied email uppercased | PASS: case-insensitive lookup included DN-390036 alongside the owner's existing appointment; this was an API check, not a second UI form test |
| Cancellation controls | Click Cancel; on the second booking choose Keep it, then Cancel again | PASS: confirmation controls appeared; Keep it left the card confirmed |
| Cancellation | Press Yes, cancel for each test reference | PASS: HTTP 200, `cancelled=true`, `emailed=true`; cards showed Cancelled; Sheets statuses became CANCELLED with cancellation notes; Calendar events became cancelled |
| Repeated cancellation | Repeat the first cancellation through the public appointment API | PASS: returned the completed cancellation result; the journal retained one cancellation operation and two total notification operations for that booking |
| Slot recovery | Re-read free/busy and daily availability after cancellation | PASS: each window free; Bilal 14:00 and Ayesha 12:00 offered again |
| Lookup after cancellation | Re-run phone lookup after both cancellations | PASS: empty upcoming appointment list |
| Email delivery | Search the owner's Gmail for the test references | PASS: first confirmation and cancellation present; second confirmation present with corrected subject. Second cancellation's Gmail send is recorded complete in the operation journal |
| Recovery records | Inspect only operation status/step metadata for the two references | PASS: book, confirm, cancel and both notification operations complete; no failed or uncertain operations for these tests |

## Findings and changes

### The reported missing Calendar event

`Doctors!C2` contains `primary` for Dr. Ayesha. Her appointments therefore go to
the owner's primary calendar, not the separate **Dental Clinic — Demo** calendar.
The owner's **Buraq Dev** checkbox was unchecked in Calendar. Enabling that
display checkbox immediately showed the new Ayesha event. It was left enabled.

Dr. Bilal's row correctly identifies his separate test calendar, and the live
booking confirmed that routing works. No Calendar write defect was reproduced.

If Ayesha should use **Dental Clinic — Demo**, update her Doctors row's calendar
ID and the fallback Calendar in admin integration settings deliberately. Changing
only `.env.local` does not override a saved admin setting or a doctor-specific
Calendar ID. Existing appointment rows retain their original Calendar IDs and
must continue using them for cancellation; do not bulk-replace those values.

### Fixed: HTML entities in confirmation email subject

The first confirmation subject contained `Check-up &amp; Consultation`. The
confirmation template incorrectly HTML-escaped plain-text subject fields.
`lib/server/dental/templates.js` now leaves the subject as plain text; the Gmail
adapter still validates header values and MIME-encodes the subject. HTML body
values remain escaped.

Verification: inline regression assertions for the ampersand subject and escaped
HTML body passed; `npm run typecheck` passed; the second live confirmation in
Gmail displayed `Check-up & Consultation` correctly.

### Configuration inconsistencies still to resolve

- The Sheet's `clinic_phone` and the server fallback both contain the sample
  clinic number, while the public website displays another number. The
  booking-limit response accurately used that sample configuration. Set the
  intended clinic contact consistently before patient-facing use.
- The website and booking panel show Cavity Filling at 5,000 PKR, while Services
  contains 5,500 PKR. The tested check-up price agreed at 1,500 PKR. Decide the
  intended filling price and align the static website content and Sheet; no
  filling booking was submitted in this run.

No Sheet configuration, environment credentials, or existing appointments were
changed. The only application code change in this verification was the email
subject fix. Browser tooling was installed outside the repository.

## Repeating the core test

1. Use a labelled test patient and an owner-controlled inbox. Choose a phone
   below the two-upcoming-appointments limit.
2. Select an offered future slot for a specific doctor, confirm in the website,
   and record the returned reference.
3. Find that reference in Appointments; compare A:U with the requested details.
   Use column U for the actual Calendar and M for its event ID.
4. Check the event in that Calendar and confirm the slot is no longer offered.
5. Use View My Appointments with the phone or email and check the returned card.
6. Cancel only that test reference through the card's confirmation control.
7. Verify CANCELLED in Sheets, no busy event for that slot, restored availability,
   no upcoming card for the cancelled test, and confirmation/cancellation emails.

This run verifies the above live paths. It does not establish complete workflow
parity or cover concurrent races, provider outages, cron expiry, voice, all
languages, token-link actions, or every treatment and date boundary.
