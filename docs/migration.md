# Migration, operation, and cutover

## Preserved contracts and business rules

The browser still uses `GET/POST /api/chat`, `GET /api/slots`, and `POST /api/appointments`. The booking panel still submits a structured BOOKING FORM chat message. Chat replies retain `ok`, `reply`, `quickReplies`, `carousel`, `booking`, `note`, `lang`, and `heard`. Booking cards retain `whatsappSent`, always false. Phone-or-email appointment lookup remains unverified by explicit product decision. Patient contacts stay in browser memory; chat history stays in browser storage for 24 hours. No server-side chat archive or raw audio storage was added.

Availability uses the original workflow algorithms: active doctor eligibility and clinic fallback, doctor-specific days off, holiday/break checks, unreadable calendars treated as busy, 15-minute granularity, ten-minute asymmetric buffer, two-hour lead time, maximum eight next-slot suggestions, original tie ordering, and first-visit padding when it fits. Booking retains the thirty-minute lead-time allowance. The two-upcoming-bookings check remains fail-open on lookup failure. The post-create clash read also preserves its original fail-open behavior on provider failure; application locking does not make external Calendar editors transactional.

Website cancellation retains a zero-hour cutoff. Token-link cancellation retains a four-hour cutoff and the `do=1` confirmation interstitial. Expired pending holds cannot be confirmed. Calendar 404/410 deletion is accepted as already deleted; other failures prevent marking the Sheet cancelled or expired. Existing short references may collide, so internal operations use reference/token/event identity.

Appointments retain all 21 columns A–U, including the reserved R position. Writes retain USER_ENTERED and existing input sanitization. Services A:H, Hours A:G, Settings A:B, Holidays A:B, Doctors A:G, FAQ A:F, and optional Specializations A:E remain in Sheets. No Patients, Handoffs, or SessionState tab is required. Existing appointment rows and Calendar IDs are not renumbered.

The deterministic availability and clinic information ports are plain JavaScript modules with TypeScript boundary declarations. Both are required by the application. The workflow exports are retained as reference material and are never loaded by the production runtime.

## Recovery semantics

Every mutation establishes durable operation state before external effects. Encrypted contexts contain the minimum booking details needed to resume; API/portal responses expose only redacted operation metadata and references. Completed records expire after 30 days; unresolved records remain until investigated. The operation ID and deterministic Gmail Message-ID support tracing.

- Calendar create uses a deterministic event ID and reconciles the private reference/token properties before replay.
- Sheet append is reconciled by booking identity. If a prior attempt is ambiguous and no row can be found, it stops for review rather than appending blindly.
- Status updates re-resolve the row immediately before writing. Manual sorting during a write remains a Sheets concurrency limitation.
- After Calendar deletion succeeds, a failed Sheet step can resume without repeating the successful deletion.
- Expiry re-reads each booking under the same identity lease used by confirmation/cancellation. Interrupted expiry operations are considered by later cleanup runs.
- Confirmation mail failure leaves the appointment confirmed and returns `emailCopy=false`. The booking card states that the email copy could not be sent.
- A send with an uncertain outcome is never blindly resent. Search the owner’s Sent folder by the operation’s Message-ID (`<operation-id@dentalflow.local>`) and compare Sheets/Calendar before deciding whether a human follow-up is needed.
- Do not delete unresolved journal records to force a retry. Back up and reconcile external effects first. Never replay the booking under a new key just to retry its email.

There is no exactly-once transaction across MongoDB, Calendar, Sheets, and Gmail. Durable steps limit replay and make uncertainty visible. Short references are display identifiers, not authorization credentials.

## Staging and cutover

1. Create separate test Sheet, doctor calendars, MongoDB database, and synthetic patient inboxes. Use an isolated Google OAuth client where practical.
2. Populate required tabs and headers. Ensure each doctor calendar grants the connected owner the required access. Run portal checks and verify Sheet timezone against CLINIC_TIMEZONE.
3. Test live typed booking, panel booking, English/Urdu/Roman Urdu/Arabic conversations, voice primary/backup, phone/email lookup, web/token cancellation, expiry, and Gmail delivery. Test real Google 401/403 and revoked-grant recovery only against test resources.
4. Test a preview deployment using manual jobs; Vercel native cron scheduling is for production.
5. Back up production Sheets and calendar data. Inspect active pending holds and unresolved operations.
6. Configure production origin/callback, credentials, MongoDB, and hosting plan. Do not paste secrets into chat or commit them.
7. Pause old website mutation entrypoints and the old expiry schedule. Never run the old and new cleanup concurrently.
8. Deploy the verified Next.js release. Keep APP_MODE explicit; a live outage must not produce simulated appointments.
9. Perform controlled production smoke checks for booking, viewing, cancelling, email, and expiry. Confirm new links use `/api/booking-action` on the canonical domain.
10. Retire old website n8n credentials and entrypoints. Old ngrok/n8n email links are not preserved. WhatsApp workflows remain outside this migration.

Before retirement, rollback may use the previously verified deployment. After retirement, use a verified Next.js release or pause live writes while reconciling operations. Never silently roll back into demo mode.

## Hobby to Pro

Upgrade the hosting plan; set VERCEL_PLAN=pro; select the generated Pro configuration; redeploy; verify the ten-minute native schedule and CRON_SECRET in Vercel. Disable any external scheduler and set portal scheduling state to Native. Scheduling periods begin at activation and do not invent earlier misses. Observe three consecutive scheduled runs. Test a synthetic expired hold, overlapping manual invocation, and controlled missed/late/failed runs in staging.

Hobby remains manual-only for this ten-minute job. A local OS scheduler or optional external scheduler can call the authenticated route, but this does not change function quotas or the hosting plan’s commercial-use restrictions. If the selected scheduler has a short request timeout, use it only after measured runs fit that timeout.

## Known operating limits

Public rate limits remain process-local as approved; they are not shared between application instances. Login limits, locks, and idempotency are durable in MongoDB. Pool size is five per application instance; monitor aggregate connections and storage. Sheets API quotas are per project and account; cache/batch reads reduce consumption. Google/Gemini quotas are independent of the hosting plan.

Job timestamps are stored in UTC. The portal displays CLINIC_TIMEZONE (Asia/Karachi by default); date-range filters use UTC. Existing workflow timezone/current-offset calculations are retained; general DST behavior for other clinics is not introduced in this migration. No reminders or reply-to-confirm automation is claimed or implemented.
