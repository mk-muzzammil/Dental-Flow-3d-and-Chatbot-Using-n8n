# DentalFlow

A multilingual dental-clinic website with a scroll-linked 3D experience, website chat, voice transcription, booking, and appointment cards. The server runs in Next.js. Google Sheets remains the clinic data store; Google Calendar holds appointments; the connected owner’s Gmail sends confirmations.

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
- `/admin/portal/integrations`: owner connection, resource selection, access checks.
- `/admin/portal/cron`: scheduling state, Run now, filtered/cursor-paginated history.
- `/admin/portal/cron/runs/[runId]`: redacted execution details.
- `/admin/portal/operations`: failed, uncertain, or running operations with booking references and hashed identities.

Access JWTs last 15 minutes. Refresh sessions expire after seven days and rotate on use. Cookies are host-only, HttpOnly for credentials, SameSite=Lax, and Secure over HTTPS. The separate CSRF cookie supplies the session-bound header for mutations. Page proxy checks are repeated against the database in handlers. Changing admin credentials invalidates existing sessions.

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

`content/clinic.ts` controls public website copy, dentists, treatments, and prices. The live assistant reads Google Sheets, so keep both sources aligned. No production runtime path calls n8n or a WhatsApp API.
