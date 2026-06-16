import { Router } from 'express';

const router = Router();

// EZ-920 GET /auth/check  — token validation for splash
router.get('/check', (_req, res) => res.status(501).json({ error: { code: 'NOT_IMPLEMENTED' } }));

// EZ-932 POST /auth/login
router.post('/login', (_req, res) => res.status(501).json({ error: { code: 'NOT_IMPLEMENTED' } }));

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

// EZ-942 POST /auth/refresh
router.post('/refresh', (_req, res) =>
  res.status(501).json({ error: { code: 'NOT_IMPLEMENTED' } }),
);

// EZ-943 POST /auth/logout
router.post('/logout', (_req, res) => res.status(501).json({ error: { code: 'NOT_IMPLEMENTED' } }));

export default router;
