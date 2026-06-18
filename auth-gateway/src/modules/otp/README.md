# otp module

OTP generation, persistence, and SMS dispatch.
Backs EZ-933 (requestOtp) + EZ-934 (verifyOtp).

Provider selection by phone country code:
- India (+91) → 2Factor.in
- International → Twilio
- Nepal (+977) → Sparrow SMS

Rate-limit: `OTP_RATE_LIMIT_PER_HOUR` per phone. Lockout after `OTP_MAX_ATTEMPTS` bad verifies.

Files to add:
- `otp.model.ts` — Sequelize (otp_codes table: phone, code_hash, expires_at, attempts, used_at)
- `otp.service.ts` — generate, send, verify
- `providers/{twilio,twofactor,sparrow}.ts` — SMS adapters
