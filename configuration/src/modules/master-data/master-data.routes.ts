import { Router } from 'express';
import { asyncHandler } from '@/utils/async-handler';
import { requireAuth } from '@/modules/jwt/jwt.middleware';
import { requireRoles } from '@/modules/jwt/roles.middleware';
import {
  specializationsCtl,
  languagesCtl,
  dropdownValuesCtl,
} from './master-data.controller';

/**
 * BE-CFG-MD-01 — mounted at /config from app.ts.
 *
 *   /config/specializations         (list, create, update, delete)
 *   /config/languages               (list, create, update, delete)
 *   /config/dropdown-values         (list?category=…, create, update, delete)
 *
 * Reads: any authenticated user.
 * Writes: Admin / SystemAdministrator only.
 */
const router = Router();

const ADMIN_ROLES = ['Admin', 'SystemAdministrator'];

// ── Specializations ───────────────────────────────────────────────────────
router.get('/specializations',           requireAuth,                             asyncHandler(specializationsCtl.list));
router.post('/specializations',          requireAuth, requireRoles(...ADMIN_ROLES), asyncHandler(specializationsCtl.create));
router.put('/specializations/:id',       requireAuth, requireRoles(...ADMIN_ROLES), asyncHandler(specializationsCtl.update));
router.delete('/specializations/:id',    requireAuth, requireRoles(...ADMIN_ROLES), asyncHandler(specializationsCtl.remove));

// ── Languages ─────────────────────────────────────────────────────────────
router.get('/languages',                 requireAuth,                             asyncHandler(languagesCtl.list));
router.post('/languages',                requireAuth, requireRoles(...ADMIN_ROLES), asyncHandler(languagesCtl.create));
router.put('/languages/:id',             requireAuth, requireRoles(...ADMIN_ROLES), asyncHandler(languagesCtl.update));
router.delete('/languages/:id',          requireAuth, requireRoles(...ADMIN_ROLES), asyncHandler(languagesCtl.remove));

// ── Dropdown values ───────────────────────────────────────────────────────
router.get('/dropdown-values',           requireAuth,                             asyncHandler(dropdownValuesCtl.list));
router.post('/dropdown-values',          requireAuth, requireRoles(...ADMIN_ROLES), asyncHandler(dropdownValuesCtl.create));
router.put('/dropdown-values/:id',       requireAuth, requireRoles(...ADMIN_ROLES), asyncHandler(dropdownValuesCtl.update));
router.delete('/dropdown-values/:id',    requireAuth, requireRoles(...ADMIN_ROLES), asyncHandler(dropdownValuesCtl.remove));

export default router;
