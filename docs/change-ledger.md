# Approved migration change ledger

The verification column records checks completed during implementation. The migration-only test suites and runners were subsequently removed during repository cleanup; these entries are historical evidence, not commands available in the current checkout.

| Approved departure | Implementation | Verification |
|---|---|---|
| Missing workflow 11 replaced by website hold → confirm → final email | `dental/book.ts`, `actions.ts` | Booking integration test: immediate confirmation and 21-column layout |
| Website-only automation and copy | direct service routes, prompt, dictionaries, demo, templates | Prompt allowlist/copy tests; multilingual browser checks |
| Remove reminders and reply-to-confirm claims | patient templates and all website dictionaries | Template assertions and source scan |
| Secure 32-character lowercase alphanumeric tokens | `security.ts` | Token format/uniqueness test |
| Escape dynamic HTML | `templates.js`, `notifications.ts` | Synthetic injection test |
| Reject expired pending confirmations | `actions.ts` | Expired-hold confirmation test |
| Verify Calendar deletion before cancelled/expired status | `actions.ts`, Google adapter | 204/404/410/401/403/500 tests; partial-operation tests |
| Check and accurately report Sheet writes | Google adapter and journal | Missing update count and interrupted write tests |
| Overall chat deadline of 180 seconds | chat route and shared AbortSignal | Agent configuration tests; route maxDuration; production build |
| Preserve confirmed booking when email fails | separate notification operation | Email-loss test and model-after-booking failure test |

Requested infrastructure includes the separate admin layout, custom environment-password/JWT authentication, MongoDB sessions/limits/indexes, PKCE OAuth and encrypted Google tokens, job registry, Hobby/Pro generated configs, manual/native runner, history/missed occurrences, and operation recovery records.

The duplicated ChatWidget JSX was repaired as the baseline prerequisite. Next.js was patched from 16.4.0 to 16.4.3 after npm audit reported critical advisories in the baseline version. This is a dependency security patch, not a booking-policy change.

Workflow mapping: 01 → availability/rules/slots; 02 → booking hold and clash handling; 03 → token action and confirmation/cancellation services; 04 → expiry job; 07 → server-only upcoming-count lookup; 15 → clinic information/cache; 17 → direct Gemini chat, voice, five allowlisted tools and reply parsing; 18 → existing appointments API/services. Workflow 16 is excluded. The original exports are reference fixtures and are not modified or executed by the production runtime.
