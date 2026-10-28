# Local live testing

## Readiness observed on 28 October 2026

- MongoDB connection and ping succeeded for the configured test database.
- The environment password hash matches the requested local admin password; its dollar-sign escaping loads correctly.
- The token encryption key decodes to 32 bytes.
- The configured Gemini API key successfully fetched metadata for both configured models; both advertise generateContent support. This does not yet verify a complete conversation or available inference quota.
- APP_MODE is still demo. This simulates public bookings and prevents the real expiry handler from running.
- No Google connection or saved clinic resource selection exists in MongoDB yet. Google OAuth consent is still required in the admin portal.
- GOOGLE_CALENDAR_ID is primary, which means the connected account's personal primary calendar. It is a fallback, not a restriction to one calendar.
- The external scheduler secret duplicates the native cron secret. Leave EXTERNAL_CRON_SECRET empty for local manual testing. Use a different random value if enabling an external scheduler later.
- Obsolete N8N_WEB_CHAT_URL and N8N_WEB_CHAT_KEY settings are unused and can be removed.

Credentials pasted into a conversation should be replaced before production use. Keep replacements in local/deployment settings; never add them to this document or Git.

## Doctor calendar routing

The application reads each active doctor's Calendar ID from Doctors column C. Slot queries and the booking recheck use those individual calendars. The chosen doctor is recorded in Appointments S (ID), T (name), and U (Calendar ID). Confirmation, cancellation, and expiry use that saved Calendar ID. The fallback applies only when no valid active doctor calendars are found; it is not substituted for an individual doctor's unreadable calendar.

The two supplied test calendars are:

| Resource | Calendar ID |
|---|---|
| Main test calendar | `0df5044be69258f00d72dfd03e0c670d58cea67a0914b717f2b1a35c0b73c025@group.calendar.google.com` |
| Dr. Bilal Ahmed test calendar | `4a007accf65fec01d5e6b2e4f4d78b7af00f75328655bc35470eeb89483d5be4@group.calendar.google.com` |

Use the main test calendar as GOOGLE_CALENDAR_ID if that is the desired fallback. Also save it under Admin → Integrations → Fallback Calendar ID. Saved MongoDB settings take precedence over environment defaults.

For a fresh test Sheet, use these Doctors A:F values. The Ayesha mapping below assumes the main calendar belongs to her; keep the actual assignment if different. Use these IDs consistently in Hours column G. The public website uses dr-ayesha and dr-bilal as its dentist IDs.

| A: doctor_id | B: name | C: calendar_id | D: services | E: email | F: active |
|---|---|---|---|---|---|
| dr-ayesha | Dr. Ayesha Khan | Main test calendar ID above | checkup,cleaning,filling,extract,whiten | leave blank | TRUE |
| dr-bilal | Dr. Bilal Ahmed | Bilal test calendar ID above | checkup,rct | leave blank | TRUE |

This is sample configuration, not an instruction to overwrite existing clinic rules. Doctor services must match existing Services column A. Copy/paste the full Calendar IDs, not the labels used in this table. The connected Google account must be able to modify events on both calendars. The admin access check shows each calendar's ID and verifies free/busy reads; a successful test booking verifies writes.

## Optional sample configuration for an isolated test Sheet

If your existing Sheet already works with n8n, preserve its headers, tabs and configuration. If creating a fresh isolated copy, these minimal rows support the scenarios below. Keep all required tabs, including Holidays and FAQ, and preserve the Appointments A:U layout.

Services A:E:

| service_id | name | minutes | price | active |
|---|---|---|---|---|
| checkup | Check-up & Consultation | 30 | 1500 | TRUE |
| rct | Root Canal Treatment | 90 | 18000 | TRUE |

Hours A:G (Thursday is 29 October 2026; change the date/day if testing later):

| day | open | close | break_start | break_end | closed | doctor_id |
|---|---|---|---|---|---|---|
| Thursday | 10:00 | 18:00 | 14:00 | 15:00 | FALSE | dr-ayesha |
| Thursday | 13:00 | 18:00 | 14:00 | 15:00 | FALSE | dr-bilal |

A doctor with any doctor-specific Hours rows uses those rows instead of clinic-wide rows. Missing weekdays then mean unavailable, so add every intended working day. Leave Hours column G blank for clinic-wide hours.

Settings A:B:

| key | value |
|---|---|
| timezone | Asia/Karachi |
| slot_granularity | 15 |
| buffer_min | 10 |
| lead_hours | 2 |
| hold_minutes | 30 |

Do not add a holiday for the selected test date. Keep time/date cells in the string formats already used by the n8n Sheet.

## Startup and Google consent

1. Keep APP_MODE=demo while completing setup. Keep VERCEL_PLAN=hobby and the scheduler in Manual only.
2. Set the fallback Calendar ID as described above. Remove obsolete n8n variables and leave the external scheduler secret empty.
3. Run `npm ci` if dependencies are missing, then `npm run db:init` and `npm run dev` from the repository root.
4. Visit http://localhost:3000/admin/login and sign in with the configured admin credentials.
5. Open Integrations, click Connect Google, and authorize the owner account. That account must be an OAuth test user while the Google consent app is in Testing mode.
6. Save the Sheet and fallback Calendar selections. Click Check access and structure. Check the reported Calendar ID for each doctor against the table above.
7. Set APP_MODE=live, stop the server, and restart `npm run dev`. GET http://localhost:3000/api/chat must return `{"demo":false}`.
8. Keep old n8n mutation endpoints and expiry scheduling paused for the shared test resources while testing Next.js.

## Booking and cancellation scenarios

Use a controlled inbox you can read for every email-delivery test. Addresses ending in example.test are placeholders and will not deliver mail. No SMS or WhatsApp message is sent.

| Scenario | Input | Expected evidence |
|---|---|---|
| Clinic information | “What treatments do you offer?” | Information comes from the selected Sheet |
| Ayesha booking | Name: Demo Patient A; phone: 03000000001; email: your controlled inbox; checkup; Dr. Ayesha; choose an offered future slot | Confirmation card, Sheet CONFIRMED row with S=dr-ayesha and U=main calendar, event only on that calendar, final confirmation email |
| Bilal booking | Name: Demo Patient B; phone: 03000000002; same controlled inbox; checkup or rct; Dr. Bilal; choose an offered slot | S=dr-bilal and U=Bilal calendar; event on Bilal's calendar |
| Independent calendars | On a shared working day, book an available checkup time for Ayesha, then request the same time for Bilal | Bilal's time remains available if his own calendar/hours permit it |
| Conflict | Request the booked time again for the same doctor | It is unavailable; another slot is offered |
| Lookup | Open appointment cards and use one test phone | Only that phone's upcoming records are shown; using the shared inbox can show both test patients because email matching is OR-based |
| Cancellation | Cancel Patient A through the appointment card | Sheet CANCELLED; event removed from Ayesha's calendar; Bilal's appointment remains |
| Voice/languages | Ask for available slots by voice and in English, Urdu/Roman Urdu, and Arabic | Transcript and appropriate response; choose a slot and confirm before booking |

Keep appointments at least two hours in the future, respect doctor breaks/holidays, and use only slots returned by the app. The website permits at most two upcoming appointments per phone. Cancel earlier test appointments before adding more with the same phone.

## Manual cron testing

Open http://localhost:3000/admin/portal/cron. All registered website cron jobs are listed. The only scheduled job in the approved website scope is Release expired holds (`release-expired-holds`), with an intended ten-minute schedule. Use Manual only on localhost and click Run now. Booking, confirmation, cancellation, slot lookup and FAQ are request-driven services. The WhatsApp patient-memory cleanup is excluded.

1. Start with no expired PENDING rows. Run now should report success with zero processed items, and create a manual/admin history entry. If your Sheet has old expired pending holds, cleanup will act on those too; inspect the Sheet first.
2. To exercise deletion, create one disposable test booking through the website, using your controlled inbox. Record its reference and verify its Calendar event exists.
3. In that one test row only, set C (status) to PENDING and O (expiry) to an ISO timestamp in the past, for example `2026-10-27T00:00:00Z`. Keep M (event ID), N (token), S/T (doctor), U (calendar), and all other columns intact. This seeds an expiry candidate; it does not test interruption during initial hold creation.
4. Click Run now. Expect one processed/succeeded item, C=EXPIRED, deletion from the row's U calendar, and an expiry email if delivery succeeds. Delivery errors are visible in history/recovery records.
5. Click Run now again. The completed row should not be processed or emailed again.
6. For the non-expired case, use a different disposable row set to PENDING with an expiry in the future. Cleanup must leave it and its Calendar event untouched.

Normal website bookings confirm immediately, so they are not expiry candidates. This cron exists for abandoned legacy holds and interrupted booking operations. Never convert an actual patient's confirmed booking into a test hold.

## What was verified versus what remains

Six synthetic two-calendar scenarios were compared directly against the original n8n JavaScript for doctor selection, slot calculation and booking recheck. They matched, including a busy Ayesha calendar, an independently free Bilal calendar, and an unreadable calendar.

The port retains workflows 01, 02, 03, 04, 07, 15, 17 and 18 as direct services. Workflow 17's missing workflow-11 booking dependency is the explicitly approved hold → confirm → final email replacement. Workflow 16 is excluded. Security/write-failure fixes and website-only messaging are documented in change-ledger.md.

Real Google Sheet contents, Calendar permissions, Gmail delivery and complete Gemini conversations still require the owner OAuth connection and the live tests above. Source parity and successful MongoDB access alone do not establish full end-to-end success.
