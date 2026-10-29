# DentalFlow

A multilingual dental-clinic website with a scroll-linked 3D experience, website chat, voice transcription, booking, and appointment cards. The server runs in Next.js. Google Sheets is the reception workbook; MongoDB holds editable clinic configuration and encrypted private booking fields; Google Calendar holds appointments; the connected owner’s Gmail sends confirmations.

## Run locally

Use Node.js 22 or newer and npm:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open `/en`, `/ur`, or `/ar`. `APP_MODE=demo` works without MongoDB, Google, or Gemini credentials. Demo appointments are simulated. Live mode never falls back to simulated success.

For local development with pnpm 11, use the checked-in pnpm lockfile and build approvals:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Keep your existing `.env.local`; copy `.env.example` only if you have not created it yet. Use one package manager consistently for local installs. Switching from npm to pnpm may print warnings about moving packages installed by another package manager. `pnpm-workspace.yaml` explicitly allows the install scripts for `@google/genai`, `esbuild`, and `protobufjs`, preventing `ERR_PNPM_IGNORED_BUILDS` for these dependencies. Review any newly blocked dependencies with `pnpm approve-builds`.

## Live setup

1. Fill the server-only values in `.env.local` using `.env.example`. Set a canonical `APP_URL`, MongoDB database, admin email, password hash, and three distinct secrets: JWT signing, token encryption, and cron authentication.
2. Generate a password hash with `npm run admin:hash`, providing the password on stdin. Passwords must be 8–1024 characters. Do not put passwords in command-line arguments. In a Next.js `.env.local`, escape every `$` in the generated hash as `\$`; in Vercel settings paste the literal hash without backslashes. Generate `TOKEN_ENCRYPTION_KEY` as 32 random bytes encoded as base64. JWT and cron secrets must each contain at least 32 characters.
3. Run `npm run db:init`. The script reads `.env.local`; indexes are also initialized on login and live mutations. Use a separate database for each clinic/environment.
4. In Google Cloud, enable Sheets, Calendar, and Gmail APIs. Create a **Web Application** OAuth client. Register the exact callback `APP_URL/api/admin/integrations/google/callback`. Set `GOOGLE_REDIRECT_URI` to that same URL.
5. Visit `/admin/login` and sign in with the environment credentials. Under **Integrations**, connect the owner’s Google account, select the clinic Sheet and fallback Calendar, and run the access checks. Google login does not create an admin account.
6. Add the Gemini API key and configured model names. Set `APP_MODE=live` only after testing with synthetic data and dedicated clinic resources.

Google OAuth requests offline access, identity/email, Sheets read/write, Calendar events/free-busy, and Gmail send. Tokens are encrypted with AES-256-GCM. Keep a backup of the encryption key; changing it requires reconnecting Google and reconciling any outstanding encrypted operations. External Google consent apps in Testing mode commonly require reconnecting after seven days. Complete the production consent/verification steps before using real clinic data.

The default models are `gemini-3.5-flash-lite` for chat/voice and `gemini-3.8-flash` for one voice backup attempt. Check model availability and project quotas in AI Studio. There is no automatic paid fallback. Free-tier model data handling must be reviewed before introducing real patient data.

## Admin portal

- `/admin/portal`: mode, integration readiness, and cleanup age.
- `/admin/portal/integrations`: owner connection, resource selection and access checks.
- `/admin/portal/clinic`: labelled forms for clinic details, services, doctors, schedules, specializations, holidays, FAQs and booking settings.
- `/admin/portal/cron`: scheduling state, Run now, filtered/cursor-paginated history.
- `/admin/portal/cron/runs/[runId]`: redacted execution details.
- `/admin/portal/operations`: failed, uncertain, or running operations with booking references and hashed identities.

Access JWTs last 15 minutes. Refresh sessions expire after seven days and rotate on use. Cookies are host-only, HttpOnly for credentials, SameSite=Lax, and Secure over HTTPS. The separate CSRF cookie supplies the session-bound header for mutations. Page proxy checks are repeated against the database in handlers. Changing admin credentials invalidates existing sessions.

## Clean website workbook (schema v2)

Only the website workbook should be migrated; the original n8n workbook must remain unchanged.

| Location | Data |
|---|---|
| Sheets: Appointments | Booking ID, reference, creation time, status, patient ID, service, date/time, duration, doctor and price |
| Sheets: Patients | Patient ID, name, phone and email; shared across repeated bookings with the same identity |
| Sheets: Doctors | Doctor ID/name, services, active state and specialization IDs/labels |
| MongoDB: clinic_configuration | Services/prices/translations, hours, holidays, FAQs, specialization catalog and clinic settings; doctor Calendar IDs/staff emails are encrypted |
| MongoDB: booking_private | Encrypted cancellation tokens, Calendar event/Calendar IDs, hold expiry, first-visit flag and private notes |
| Server code: lib/server/storage/schema.json | Fixed worksheet column definitions only; no clinic records or credentials |

Use **Admin → Clinic management** to edit configuration without JSON. Apply record edits to a draft, then Save changes to publish. Doctor edits save directly to the Doctors Sheet; Calendar IDs and staff emails stay encrypted in MongoDB. IDs remain stable, records can be deactivated, and stale edits are rejected. An interrupted doctor save has a Resume interrupted save control; availability pauses until the cross-store update finishes. Calendar access checks verify availability access, not event-write permission. The Doctors `specialization_ids` column uses the IDs in the MongoDB specialization catalog; `specializations` is the reception-facing label. Blank qualifications are marked “Not specified”, never inferred from treatment availability. The internal booking ID column is hidden for readability, not security; patient IDs remain visible to connect the two reception tabs. Preserve IDs when sorting rows. Raw-value writes retain phone leading zeros and ISO date/time text.

Deploy the updated code before migration. Preview and then apply to the explicitly selected website workbook:

```sh
npm run sheet:migrate -- --sheet-id YOUR_WEBSITE_SHEET_ID
npm run sheet:migrate -- --sheet-id YOUR_WEBSITE_SHEET_ID --apply
```

The script verifies selection and legacy headers, makes an encrypted recovery snapshot, pauses live booking operations, moves private records, and replaces the tabs in one Sheets batch. It checks hydrated bookings against the snapshot before activating schema v2. A rerun verifies an already migrated workbook without duplicating records. If interrupted, keep this code deployed and rerun the same command; the migration flag fails closed while unresolved. A source-change assertion requires reconciling the snapshot first. Do not restore an old deployment against a schema-v2 workbook.

Migration snapshots are in `migration_backups`, encrypted with the existing token-encryption key. They expire 30 days after successful migration; unresolved snapshots are retained. Restoring a snapshot is an operator recovery procedure: decrypt it server-side, restore its original tab values, and revert the matching storage profile together while writes are paused. Never paste decrypted snapshots into logs or commits. Keep the encryption key backed up: it now protects booking links and doctor connections as well as OAuth credentials. `booking_private` has no automatic TTL because historical records still refer to it.

This reduces exposed fields but does not make patient Sheets anonymous: names, phone numbers, email addresses and treatment details are still personal data. Keep workbook access restricted to authorized clinic staff. Removing cells/tabs does not erase Google Sheets revision history or recipients’ existing copies. The original phone-or-email public lookup policy remains unchanged.

## Scheduling and deployment

The only website job is `release-expired-holds`, intended every ten minutes. The default Hobby configuration has **no native cron entries**. Use Run now or an authenticated CLI POST. Commercial clinic deployments require an appropriate hosting plan.

```sh
npm run cron:check
npm run cron:generate
npm run cron:select -- pro
# Set VERCEL_PLAN=pro in the deployment environment, then redeploy.
```

The registry is `lib/server/jobs/metadata.json`. Generated `vercel.hobby.json` and `vercel.pro.json` are checked for drift during every build; the selected `vercel.json` must match `VERCEL_PLAN`. Both configurations explicitly use npm. Configuration selection changes the deployment schedule; changing the portal’s scheduling state alone does not provision a scheduler.

Native Vercel GETs use `Authorization: Bearer CRON_SECRET`. Manual POSTs use that same credential, or an authenticated admin session plus CSRF. Use a stable `Idempotency-Key` when retrying one manual request. Every POST remains manual, regardless of schedule headers. Optional external scheduling uses GET with a distinct `EXTERNAL_CRON_SECRET` and must be explicitly enabled in the portal. Keep its timeout above the measured handler duration; do not acknowledge early and rely on background execution.

Enable Fluid Compute with Node.js functions on the Vercel project. The job has a 240-second work budget inside a 300-second function. Chat has one 180-second overall deadline. Production native scheduling is enabled only on Pro. Manual-only periods generate no missed runs. Pro scheduled occurrences have a two-minute grace period; manual runs do not erase missed occurrences. History and audit records retain 30 days; unresolved operations have no TTL.

## Verify

```sh
npm run typecheck
npm run build
npm audit
```

The migration-only automated test harness and its dependencies have been removed. Typechecking and production builds remain available; live behavior should be checked against dedicated staging resources using the migration checklist.

See [migration and recovery](docs/migration.md) and [approved change ledger](docs/change-ledger.md). Live OAuth consent, Google resource access, Gmail delivery, Gemini semantic behavior, and Vercel scheduling still require environment-specific staging verification.

For local testing with separate doctor calendars, sample patient data, and manual expiry runs, follow the [local live testing guide](docs/local-live-testing.md).

## Application structure

| Location | Responsibility |
|---|---|
| `app/[lang]`, `components/sections`, `components/three` | Public multilingual website and 3D experience |
| `components/chat` | Existing booking panel, chat, voice, appointment cards |
| `app/admin`, `components/admin` | Separate owner portal and login |
| `lib/server/auth`, `db`, `operations` | Sessions, durable limits, execution leases, recovery journals |
| `lib/server/google` | OAuth, encrypted credentials, Sheets/Calendar/Gmail adapters |
| `lib/server/dental` | Availability, booking, confirmation, cancellation, expiry, clinic information |
| `lib/server/chat` | Gemini prompt, allowlisted tools, voice, response parsing |
| `lib/server/jobs` | Registry, runner, scheduling periods, missed-run history |
| `Web-N8N-Workflows` | Original reference exports; never loaded by production runtime |

`content/clinic.ts` provides demo content and 3D artwork configuration. In live mode, the public website, booking panel and assistant use the managed clinic configuration and Doctors Sheet. Live clinic management requires the clean-workbook migration. No private Calendar IDs, staff emails or booking tokens are included in public clinic data. Existing bookings retain their service/price/calendar snapshots. Schedule changes do not move existing appointments; review those bookings separately. Working hours support one opening period and one optional break per day. No production runtime path calls n8n or a WhatsApp API.

Clinic editor verification: `npm run test:clinic` uses the configured MongoDB server with a uniquely named temporary database, mocks every Google request, and drops only that temporary database afterward. It covers booking regression, doctor saves, response-loss retries, Sheet-write failure recovery, stale-edit rejection and public-data privacy. The MongoDB user needs permission to create/drop this temporary database; the configured clinic database is not modified.

For current-week booking, duration rules, rescheduling, migration and automated tests, see [appointment slots](docs/appointment-slots.md).

## Repository checks

```sh
npm run typecheck
npm run test:availability
npm run test:framing
npm run test:clinic
npm run test:booking-ui
npm run build
```

Tests live in `tests/`. The clinic integration test uses an isolated temporary MongoDB database and mocked Google calls; it needs the configured database connection. The availability and 3D-framing checks run without external services. Migration, initialization and model-generation utilities remain in `scripts/`. TypeScript rejects unused local declarations and parameters. Browser logs, snapshots, test reports and coverage are generated locally and ignored by Git.
