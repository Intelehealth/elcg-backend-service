import { z } from 'zod';

/**
 * BE-CFG-MD-01 — Zod schemas for 3 master-data types.
 * Shared shape: name, displayOrder, isActive.
 * Language adds (code, nativeName). Dropdown-value adds (category, key, label).
 */

// ── Specialization ────────────────────────────────────────────────────────
export const CreateSpecialization = z.object({
  name: z.string().trim().min(1).max(120),
  displayOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.coerce.boolean().default(true),
});
export const UpdateSpecialization = CreateSpecialization.partial();
export type CreateSpecialization = z.infer<typeof CreateSpecialization>;
export type UpdateSpecialization = z.infer<typeof UpdateSpecialization>;

// ── Language ──────────────────────────────────────────────────────────────
export const CreateLanguage = z.object({
  code: z.string().trim().min(2).max(8).regex(/^[a-z]{2}(-[A-Za-z]{2,4})?$/, 'code must be an ISO 639-1 (or 639-1-country) tag: "en", "ne", "en-US"'),
  name: z.string().trim().min(1).max(80),
  nativeName: z.string().trim().min(1).max(80).nullable().optional(),
  displayOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.coerce.boolean().default(true),
});
export const UpdateLanguage = CreateLanguage.partial();
export type CreateLanguage = z.infer<typeof CreateLanguage>;
export type UpdateLanguage = z.infer<typeof UpdateLanguage>;

// ── Dropdown value ────────────────────────────────────────────────────────
export const CreateDropdownValue = z.object({
  category: z.string().trim().min(1).max(60).regex(/^[a-z0-9_.-]+$/, 'category is lowercase snake/kebab'),
  key:      z.string().trim().min(1).max(120),
  label:    z.string().trim().min(1).max(240),
  displayOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.coerce.boolean().default(true),
});
export const UpdateDropdownValue = CreateDropdownValue.partial();
export type CreateDropdownValue = z.infer<typeof CreateDropdownValue>;
export type UpdateDropdownValue = z.infer<typeof UpdateDropdownValue>;

// ── Shared query params ───────────────────────────────────────────────────
export const ListQuery = z.object({
  isActive: z
    .enum(['true', 'false', 'all'])
    .optional()
    .transform((v) => (v === undefined ? 'true' : v)),
});
export type ListQuery = z.infer<typeof ListQuery>;

export const DropdownListQuery = ListQuery.extend({
  category: z.string().trim().min(1).max(60),
});
export type DropdownListQuery = z.infer<typeof DropdownListQuery>;

export const IdParam = z.object({ id: z.string().uuid('id must be a UUID') });
export type IdParam = z.infer<typeof IdParam>;
