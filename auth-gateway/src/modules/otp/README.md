# otp module

OTP generation, persistence, and SMS dispatch for password reset.
Backs EZ-933 (`POST /auth/requestOtp`), EZ-934 (`POST /auth/verifyOtp`), and
EZ-939 (`POST /auth/resetPassword/:userUuid`).

## Follows the proven `mindmap-api-NAS` flow

This intentionally mirrors `mindmap-api-NAS/portal/services/auth.service.js`'s
working password-reset flow rather than inventing a new one — India continues
to go through 2Factor's `AUTOGEN2` with the same API key, and OTP state lives
in the same `user_settings` table `portal` already reads/writes, so the two
services don't split-brain on OTP state during the migration period. The only
genuinely new work is routing Nepal/international numbers to Sparrow/Twilio,
which the legacy service never had (it called 2Factor unconditionally,
regardless of country).

## Request contract — identifies the account by phone, not username

The real client has no username/email at this point — it only knows a phone
number — so `requestOtp`/`verifyOtp` match the *real* production contract:

```
POST /auth/requestOtp  { otpFor: 'password', phoneNumber, countryCode?, source? }
POST /auth/verifyOtp   { verifyFor: 'password', phoneNumber, countryCode?, otp }
POST /auth/resetPassword/:userUuid  { newPassword, resetToken }
```

`countryCode` is accepted for contract compatibility but not trusted as the
send destination — see deviation 1 below. `verifyOtp`'s response includes
`userUuid` (`{ verified, userUuid, resetToken, expiresIn }`): it's the only way
the client learns the id `resetPassword`'s URL needs, since it never had a
username to begin with — legacy's own response includes it for the same reason.

Three deliberate deviations from legacy, each called out because they were a
judgment call, not a mistake:

1. **The account is looked up by phone (`auth.repository.findAccountByPhoneNumber`,
   matching `provider_attribute` on `phoneNumber`), and the code is sent to
   whatever phone/country code that same lookup found on file** — not the
   request's own `phoneNumber`/`countryCode` values. This matches what legacy's
   own `'password'` case actually does — it re-derives phone/countryCode from
   the DB after finding the account via the same join, discarding whatever the
   client sent for the send step.
2. **The response is identical whether the phone matches no account, the
   account has no phone on file, or the OTP was sent successfully.** Legacy's
   messages differ ("No user exists with this username." vs "No phoneNumber/
   email updated..."), which leaks account existence to an unauthenticated
   caller. This closes that gap; no application-level behavior otherwise changes.
3. **`resetPassword` requires the `resetToken` JWT `verifyOtp` mints on
   success**, not legacy's check (which only confirms *some* `user_settings`
   row exists with `otpFor: 'P'` — not that the code was ever correctly
   verified, or is still unexpired — meaning legacy would let anyone who
   merely knows a phone number reset that account's password without ever
   receiving the SMS). `verifyOtp` also clears the OTP row on success; legacy
   leaves it live for the rest of its window, allowing a replay within it.
   Requires the client to carry `resetToken` from step 2 into step 3 — a
   contract addition beyond legacy's `{ newPassword }`-only body, accepted as
   a client-side follow-up change rather than reproducing the gap.

Scope is password reset only (`otpFor: 'P'`) — the `'U'` (forgot username) and
`'A'` (login step-up) purposes legacy also has are not implemented here.

## Provider selection by country code

- India (`+91`) → `SMS_PROVIDER_INDIA` (default `2factor`) — `AUTOGEN2`: 2Factor
  generates the OTP itself and returns it; the code actually sent is whatever
  it returns, not a locally generated one.
- Nepal (`+977`) → `SMS_PROVIDER_NEPAL` (default `sparrow`) — new. Sends a
  locally generated code.
- Everything else → `SMS_PROVIDER_INTL` (default `twilio`) — new. Sends a
  locally generated code.

Each region's provider is a config value, not a code path (`providers/index.ts`'s
`REGISTRY`) — swapping a region's vendor is an env change.

## Storage: `user_settings` (shared with `portal`, not a new table)

`user-settings.model.ts` maps the table `portal`'s migrations already created
in `mindmap_server` — no migration lives here. One row per user (`user_uuid`
is the primary key), `otp`/`otpFor` upserted by `saveOtp`, matching legacy's
own `saveOtp` exactly. `otp` is stored **in plaintext**, same as legacy — this
is a real, accepted tradeoff for staying compatible with the shared column
(hashing it would break `portal`'s own plaintext reads/writes against the same
row). Expiry is judged the same way legacy does: `Date.now() - row.updatedAt`
against `OTP_EXPIRY_SECONDS` (default 60s, matching legacy's hardcoded 1-minute
window).

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
service never hashes or stores passwords itself.

## Files

- `user-settings.model.ts` / `user-settings.repository.ts` — the shared table above.
- `otp.service.ts` — `requestOtp`/`verifyOtp`/`resetPassword`.
- `providers/types.ts` — the `SmsProvider` interface + shared `buildMessage`
  (used by Twilio/Sparrow; 2Factor composes its own text).
- `providers/{twofactor,twilio,sparrow}.ts` — one HTTP adapter each (Node's
  native `fetch`, no new dependency).
- `providers/index.ts` — `selectProvider(countryCode)`, the region → vendor
  registry above.

## Known limitation

Phone lookup (`findAccountByPhoneNumber`) goes through the `provider` table, so
it only works for accounts that have a `Provider` row — same limitation legacy
has via its own `provider`/`provider_attribute` joins. A non-provider OpenMRS
account (e.g. an admin-only user) has no phone to send an OTP to.
