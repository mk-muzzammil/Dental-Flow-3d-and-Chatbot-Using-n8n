# Appointment slots

The chat booking panel follows service → day → time → confirmation. It shows exactly the current clinic-local Monday–Sunday week, with past, closed and full days disabled. Days and 12-hour times use full-width tiles, one per row, with the website's medical blue, white and soft-grey theme. Time tiles also show the appointment end time. Confirmation includes the start and end time. Stale selections refresh availability while retaining patient details.

Booking ahead into next week remains an open product decision. When no bookable day remains, the picker explains this and offers clinic contact details instead of jumping ahead. At Monday 00:00 in the configured clinic timezone, the new week becomes the current week automatically. An open picker checks every 30 seconds and on tab focus/visibility restoration, clears old selections, reloads days and retains entered patient details. It preserves in-flight or uncertain booking requests for recovery rather than discarding their idempotency keys. For Asia/Karachi, the 26 October–1 November 2026 week becomes 2–8 November at midnight on 2 November, regardless of the visitor's timezone.

## Availability and administration

- Capacity is per doctor Calendar, with no chair model. The picker automatically selects an eligible doctor; a doctor card can retain a specific preference. Shared Calendar IDs share capacity.
- Clinic hours, weekly off days, breaks, holidays and doctor schedules apply together. A doctor cannot override a clinic closure or work beyond clinic hours. Unreadable calendars fail closed.
- New-clinic/demo defaults are 10:00–19:00 and a 30-minute interval. The migration preserves existing configured clinic hours and off days.
- The grid is aligned to local midnight: a 30-minute interval allows :00 and :30. Every service duration must be a positive multiple of the interval. No buffer, first-visit padding or additional lead time is added.
- A booking occupies `[start, end)`. Back-to-back bookings are allowed. Existing appointments retain their saved duration even after the service is edited.
- Use **Admin → Clinic → Services / Working hours / Booking rules** to edit durations, schedules, weekly off days and interval. Saving an incompatible interval is blocked. Schedule changes show the affected future appointment references and require acknowledgement; those appointments remain unchanged.
- Clinic timezone is an IANA timezone. Temporal resolves offsets for the appointment date. Nonexistent or repeated DST start/end times are omitted rather than guessed. This UI supports same-day working hours, not overnight schedules.

## Storage and integrity

Google Sheets retains Appointments, Patients and Doctors. Appointments columns A:M are unchanged; N is `end_time`. Date, start time and saved duration remain visible. UTC `startsAt` / `endsAt` and the booking timezone are stored in encrypted MongoDB booking metadata.

Availability combines Calendar busy intervals, active Sheet appointments and MongoDB reservations. Confirmation rechecks configuration version, service, day, grid, current time, doctor schedule and overlap. Atomic calendar/day reservation claims prevent overlapping application bookings; a clinic settings lease coordinates configuration edits and booking creation. A busy operation returns a retryable response.

Cancellation and expiry release a reservation only after Calendar deletion and Sheet status update succeed. Rescheduling explicitly confirms the replacement interval using the current service duration, moves the existing Calendar event and retains the booking reference. The old interval stays reserved until the move is persisted. An interrupted move can be resumed from the appointment picker; its journal prevents cancellation or a competing move from corrupting it.

Calendar, Sheets and MongoDB are not one transaction. Manual Calendar editors do not participate in application locks. Ambiguous external writes stay recorded for recovery rather than being treated as success. Email failure does not undo a confirmed appointment.

## Migration

First configure the isolated website workbook and complete the three-tab storage migration. Do not target the n8n workbook. Pause patient/admin writes during migration and keep the token-encryption key available for recovery.

```sh
npm run slots:migrate -- --sheet-id YOUR_WEB_SHEET_ID
npm run slots:migrate -- --sheet-id YOUR_WEB_SHEET_ID --apply
```

The default command is a dry run. Apply mode verifies active Calendar intervals, saves an encrypted recovery snapshot, changes 45-minute service definitions to 60, sets interval 30 / buffer 0 / lead 0, backfills saved booking intervals and adds column N. Other incompatible service durations block migration. Existing appointments and Calendar events are not rescheduled or lengthened. Rerunning after success makes no changes.

The migration is already applied to the selected **DentalFlow Web — New Clinic** workbook in this workspace: cleaning, filling and extraction are now 60-minute services; the two existing booking records retained their original 45-minute duration. Existing clinic hours were preserved. The n8n workbook and calendars were not modified.

If migration fails, the profile remains locked in `migrating` state. Inspect and reconcile the reported issue before retrying. Its encrypted snapshot is in `migration_backups` under `<sheetId>:availability-v2` with 30-day retention; do not overwrite newer operational data with a backup blindly.

## Verification

```sh
npm run typecheck
npm run test:availability
npm run test:clinic
npx playwright install chromium
npm run test:booking-ui
npm run build
```

`test:availability` needs no database. It covers the Root Canal example, closing boundaries, back-to-back and mixed durations, breaks/off days, past starts, interval validation, current-week boundaries and DST.

`test:clinic` requires the configured MongoDB connection and encryption key. It creates and deletes only its own `dfverify_*` database; all Google calls are mocked and unknown endpoints fail. It covers booking/retries, lookup, cancellation/expiry, email failures, actual concurrent booking attempts, atomic reservation contention, admin interval validation/conflict warnings and interrupted rescheduling recovery. Its application clock is fixed to a future Wednesday so tests do not depend on remaining availability in the real week.

`test:booking-ui` starts a demo server if no server is running on port 3000, or reuses that server. It intercepts availability and booking writes with synthetic responses, so it does not create real appointments. It checks the 320/360/380px flow, disabled days, tap targets, overflow, full-interval summary, and stale-slot recovery. To use an installed Chromium instead of downloading Playwright's browser:

```sh
CHROMIUM_PATH=/usr/bin/chromium npm run test:booking-ui
```

The booking mutation suite uses synthetic data and mocked Google APIs. It does not substitute for a separately authorized live booking/email smoke test.
