import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '@/config/env';
import { asyncHandler } from '@/utils/async-handler';
import { requireAuth } from '@/modules/jwt/jwt.middleware';
import * as authController from '@/modules/auth/auth.controller';

const router = Router();

/**
 * Per-IP throttle. Complements the per-account lockout in the service layer:
 * lockout stops attacks on one account, this stops one host spraying many accounts.
 */
const credentialRateLimit = rateLimit({
  windowMs: env.LOGIN_LOCKOUT_WINDOW_MIN * 60_000,
  limit: env.LOGIN_LOCKOUT_ATTEMPTS * 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: { code: 'RATE_LIMITED', message: 'Too many attempts, please try again later' },
  },
});

/**
 * Per-IP throttle for requestOtp/verifyOtp. Complements the per-phone limit
 * enforced inside otp.service.ts (OTP_RATE_LIMIT_PER_HOUR) the same way
 * credentialRateLimit complements the per-account login lockout: this stops one
 * host spraying many phones/accounts, the service-layer check stops one phone
 * being spammed via many hosts.
 */
const otpRateLimit = rateLimit({
  windowMs: 60 * 60_000,
  limit: env.OTP_RATE_LIMIT_PER_HOUR * 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: { code: 'RATE_LIMITED', message: 'Too many attempts, please try again later' },
  },
});

// EZ-920 GET /auth/check — token validation for splash
router.get('/check', requireAuth, authController.check);

// EZ-932 POST /auth/login — consolidated: tokens + user + provider
router.post('/login', credentialRateLimit, asyncHandler(authController.login));

// EZ-942 POST /auth/refresh — rotating refresh
router.post('/refresh', credentialRateLimit, asyncHandler(authController.refresh));

// EZ-943 POST /auth/logout — blacklist access token + revoke refresh family
router.post('/logout', requireAuth, asyncHandler(authController.logout));

// EZ-933 POST /auth/requestOtp — password-reset OTP via 2Factor/Twilio/Sparrow
router.post('/requestOtp', otpRateLimit, asyncHandler(authController.requestOtp));

// EZ-934 POST /auth/verifyOtp
router.post('/verifyOtp', otpRateLimit, asyncHandler(authController.verifyOtp));

// EZ-939 POST /auth/resetPassword/:userUuid — gated on verifyOtp's resetToken, not a session
router.post('/resetPassword/:userUuid', otpRateLimit, asyncHandler(authController.resetPassword));

export default router;
