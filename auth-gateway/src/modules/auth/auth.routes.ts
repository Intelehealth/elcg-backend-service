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

// EZ-920 GET /auth/check — token validation for splash
router.get('/check', requireAuth, authController.check);

// EZ-932 POST /auth/login — consolidated: tokens + user + provider
router.post('/login', credentialRateLimit, asyncHandler(authController.login));

// EZ-942 POST /auth/refresh — rotating refresh
router.post('/refresh', credentialRateLimit, asyncHandler(authController.refresh));

// EZ-943 POST /auth/logout — blacklist access token + revoke refresh family
router.post('/logout', requireAuth, asyncHandler(authController.logout));

// EZ-933 POST /auth/requestOtp
router.post('/requestOtp', (_req, res) =>
  res.status(501).json({ error: { code: 'NOT_IMPLEMENTED' } }),
);

// EZ-934 POST /auth/verifyOtp
router.post('/verifyOtp', (_req, res) =>
  res.status(501).json({ error: { code: 'NOT_IMPLEMENTED' } }),
);

// EZ-939 POST /auth/resetPassword/:userUuid
router.post('/resetPassword/:userUuid', (_req, res) =>
  res.status(501).json({ error: { code: 'NOT_IMPLEMENTED' } }),
);

export default router;
