# otp module

OTP generation, persistence, SMS + email dispatch for password reset AND
forgot-username. Backs EZ-933 (`POST /auth/requestOtp`), EZ-934
(`POST /auth/verifyOtp`), and EZ-939 (`POST /auth/resetPassword/:userUuid`).

## Follows the proven `mindmap-api-NAS` flow

This intentionally mirrors `mindmap-api-NAS/portal/services/auth.service.js`'s
working flow rather than inventing a new one — India continues to go through
2Factor's `AUTOGEN2` with the same API key, the account lookups match legacy's
own `provider_attribute`/`users` joins exactly (phone-or-email for
forgot-username, username-or-phone-or-email for password reset), and OTP
state lives in the same `user_settings` table `portal` already reads/writes,
so the two services don't split-brain on OTP state during the migration
period. The genuinely new work is: routing Nepal/international numbers to
Sparrow/Twilio (legacy called 2Factor unconditionally, regardless of
country), and the security hardening called out in the deviations below.

## Two purposes, one pair of endpoints

```
POST /auth/requestOtp
  otpFor: 'username' → { otpFor: 'username', phoneNumber?, email?, source? }
  otpFor: 'password' → { otpFor: 'password', username?, phoneNumber?, email?, countryCode?, source? }

POST /auth/verifyOtp
  verifyFor: 'username' → { verifyFor: 'username', phoneNumber?, email?, otp }
  verifyFor: 'password' → { verifyFor: 'password', username?, phoneNumber?, email?, otp }

POST /auth/resetPassword/:userUuid  { newPassword, resetToken }
```

**`otpFor: 'username'`** (forgot-username) — the account is identified by
`phoneNumber` OR `email` (there's no username to look up by — recovering it
is the whole point), and the OTP is sent on that same channel: a
`phoneNumber` request texts it, an `email` request emails it. On a
successful `verifyOtp`, the username itself is **emailed** directly
(`sendUsernameEmail` — never returned in the API response, matching legacy's
own delivery-not-response design) — SMS delivery of the recovered username
is legacy's own unfinished/commented-out code path and is not reproduced
here; only what legacy actually ships (email) is.

**`otpFor: 'password'`** — identified by `username` if given, else by
`phoneNumber`/`email` (legacy's own fallback). The code is sent to **both**
phone and email when both are on file (the same code, reused for the email
send — matching legacy's reuse of the SMS-returned/generated value), or to
email alone with a freshly generated code when there's no phone on file.
`verifyOtp`'s response includes `userUuid`/`resetToken`/`expiresIn` — the
only way the client learns the id `resetPassword`'s URL needs, since it may
never have had a username to begin with; legacy's own response includes it
for the same reason. `verifyFor: 'username'` has no such follow-up, so those
fields are absent from its response.

`countryCode` is accepted for contract compatibility but not trusted as the
send destination — see deviation 1 below.

Deliberate deviations from legacy, each called out because they were a
judgment call, not a mistake:

1. **The account's contact details (phone/countryCode/email) are always
   re-derived from the DB** (`auth.repository.findAccountByContact` /
   `findAccountByUsername`), never the request's own `phoneNumber`/
   `countryCode`/`email` values — matching what legacy's own lookup does
   (re-deriving from the same join, discarding whatever the client sent for
   the actual send step).
2. **The response is identical regardless of what happened inside
   `requestOtp`** — no account match, no contact info on file, a full send,
   or (new) a failed email after a successful SMS all resolve the same way —
   no signal an attacker could use to enumerate accounts. Legacy's own
   messages differ by case, and legacy's `'password'` case would even
   surface an *overall failure* if the email send failed after the SMS
   already succeeded (`.catch(error => { throw error })` inside the phone
   branch) — discarding a real success over an unrelated channel's outage.
   That specific bit of legacy's behavior is NOT reproduced: every channel
   here is independent best-effort, logged on failure, never thrown — see
   `otp.service.ts`'s `requestPasswordResetOtp` for the exact reasoning.
3. **`resetPassword` requires the `resetToken` JWT `verifyOtp` mints on
   success**, not legacy's check (which only confirms *some* `user_settings`
   row exists with `otpFor: 'P'` — not that the code was ever correctly
   verified, or is still unexpired). `verifyOtp` also clears the OTP row on
   success; legacy leaves it live for the rest of its window, allowing a
   replay within it.

## Provider selection by country code (SMS)

- India (`+91`) → `SMS_PROVIDER_INDIA` (default `2factor`) — `AUTOGEN2`: 2Factor
  generates the OTP itself and returns it; the code actually sent is whatever
  it returns, not a locally generated one.
- Nepal (`+977`) → `SMS_PROVIDER_NEPAL` (default `sparrow`) — new. Sends a
  locally generated code.
- Everything else → `SMS_PROVIDER_INTL` (default `twilio`) — new. Sends a
  locally generated code.

Each region's provider is a config value, not a code path (`providers/index.ts`'s
`REGISTRY`) — swapping a region's vendor is an env change.

## Email channel

`email.ts` — Gmail OAuth2 transport via `nodemailer`, matching
`mindmap-api-NAS/portal/handlers/functions.js`'s `sendEmail` exactly (pooled,
`service: 'gmail'`, OAuth2 auth — not a raw SMTP username/password).
Configured via `MAIL_USERNAME`/`MAIL_PASSWORD`/`OAUTH_CLIENT_ID`/
`OAUTH_CLIENT_SECRET`/`OAUTH_CLIENT_REFRESH_TOKEN` (all optional — an
environment with none of these set simply can't send that channel, same
posture as an SMS provider missing its own API key; `EmailProviderError` is
thrown and caught the same way an `SmsProviderError` is).

The two HTML templates (`email-templates.ts`) are ported verbatim from
`mindmap-api-NAS/portal/common/emailtemplates/{otpTemplate,usernameTemplate}.html`
— same markup, same `$otpFor`/`$otp`/`$username` placeholder tokens filled
with a plain string `.replace()`. They're inlined as TS string constants
rather than kept as separate `.html` files read via `fs.readFileSync`
(legacy's own approach): this project's build (`tsc && tsc-alias`) only
compiles `.ts` sources into `dist/` — there's no static-asset-copy step, so
`.html` files would silently work under `tsx` (dev) and silently break in a
real build. Inlining sidesteps that entirely.

## Storage: `user_settings` (shared with `portal`, not a new table)

`user-settings.model.ts` maps the table `portal`'s migrations already created
in `mindmap_server` — no migration lives here. One row per user (`user_uuid`
is the primary key), `otp`/`otpFor` upserted by `saveOtp`, matching legacy's
own `saveOtp` exactly — `otpFor` is `'U'` for username-recovery OTPs, `'P'`
for password-reset ones, same ENUM values as legacy. `otp` is stored **in
plaintext**, same as legacy — this is a real, accepted tradeoff for staying
compatible with the shared column (hashing it would break `portal`'s own
plaintext reads/writes against the same row). Expiry is judged the same way
legacy does: `Date.now() - row.updatedAt` against `OTP_EXPIRY_SECONDS`
(default 60s, matching legacy's hardcoded 1-minute window).

## Rate limiting

- Per-IP: `otpRateLimit` middleware in `auth.routes.ts` (`OTP_RATE_LIMIT_PER_HOUR × 10`),
  applied to `requestOtp`, `verifyOtp`, and `resetPassword`.
- No per-account/per-phone attempt lockout on `verifyOtp` — `user_settings` has
  no attempts column, and legacy doesn't track this either. `OTP_MAX_ATTEMPTS`
  stays declared in `env.ts` for future use but isn't enforced by this flow;
  the per-IP throttle above is the actual defense today, same posture as legacy.

## resetPassword — writes through OpenMRS's own REST API

`POST /openmrs/ws/rest/v1/password/:userUuid`, Basic Auth with an OpenMRS admin
account (`OPENMRS_REST_BASE_URL` / `OPENMRS_ADMIN_USERNAME` / `OPENMRS_ADMIN_PASSWORD`),
same as legacy — so OpenMRS's own password hashing/history rules apply; this
service never hashes or stores passwords itself. Applies to `otpFor: 'password'`
only — there is no reset-password step for `otpFor: 'username'`.

## Files

- `user-settings.model.ts` / `user-settings.repository.ts` — the shared table above.
- `otp.service.ts` — `requestOtp`/`verifyOtp`/`resetPassword`, both purposes.
- `email.ts` / `email-templates.ts` — the email channel above.
- `providers/types.ts` — the `SmsProvider` interface + shared `buildMessage`
  (used by Twilio/Sparrow; 2Factor composes its own text).
- `providers/{twofactor,twilio,sparrow}.ts` — one HTTP adapter each (Node's
  native `fetch`, no new dependency).
- `providers/index.ts` — `selectProvider(countryCode)`, the region → vendor
  registry above.

## Known limitation

Both account lookups (`findAccountByContact`/`findAccountByUsername`) go
through the `provider` table, so they only work for accounts that have a
`Provider` row — same limitation legacy has via its own `provider`/
`provider_attribute` joins. A non-provider OpenMRS account (e.g. an
admin-only user) has no phone/email on file to send an OTP to at all.

The `'A'` (login step-up / 2FA) `otpFor`/`verifyFor` purpose legacy also has
is still not implemented here — out of scope for this pass, which covers
`'U'` (forgot-username) and `'P'` (password reset) only.
