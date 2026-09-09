import { UniqueConstraintError, ValidationError as SequelizeValidationError, WhereOptions } from 'sequelize';
import { MstSpecialization } from '@/db/models/mst-specialization.model';
import { MstLanguage } from '@/db/models/mst-language.model';
import { MstDropdownValue } from '@/db/models/mst-dropdown-value.model';
import { HttpError } from '@/middleware/error-handler';
import type {
  CreateSpecialization, UpdateSpecialization,
  CreateLanguage, UpdateLanguage,
  CreateDropdownValue, UpdateDropdownValue,
  ListQuery, DropdownListQuery,
} from './master-data.dto';

/**
 * BE-CFG-MD-01 — three parallel CRUD surfaces. Kept as explicit functions per
 * type (rather than a generic wrapper) so the type inference stays sharp and
 * error messages point at the specific master table.
 */

function activeWhere(q: ListQuery): WhereOptions {
  if (q.isActive === 'all')   return {};
  if (q.isActive === 'false') return { isActive: false };
  return { isActive: true };
}

function toConflict(err: unknown, kind: string): HttpError {
  if (err instanceof UniqueConstraintError) {
    return new HttpError(409, `${kind}_DUPLICATE`, 'A record with the same unique key already exists');
  }
  if (err instanceof SequelizeValidationError) {
    return new HttpError(400, `${kind}_INVALID`, err.message);
  }
  return err instanceof HttpError ? err : new HttpError(500, 'DB_ERROR', 'Database error');
}

// ── Specialization ────────────────────────────────────────────────────────
export const specializations = {
  async list(q: ListQuery) {
    return MstSpecialization.findAll({
      where: activeWhere(q),
      order: [['displayOrder', 'ASC'], ['name', 'ASC']],
    });
  },

  async get(id: string) {
    const row = await MstSpecialization.findByPk(id);
    if (!row) throw new HttpError(404, 'SPECIALIZATION_NOT_FOUND', 'Specialization not found');
    return row;
  },

  async create(body: CreateSpecialization) {
    try {
      return await MstSpecialization.create(body);
    } catch (err) {
      throw toConflict(err, 'SPECIALIZATION');
    }
  },

  async update(id: string, body: UpdateSpecialization) {
    const row = await specializations.get(id);
    try {
      return await row.update(body);
    } catch (err) {
      throw toConflict(err, 'SPECIALIZATION');
    }
  },

  /** Soft-delete: set isActive=false. Hard-delete not exposed — master data is referenced. */
  async remove(id: string) {
    const row = await specializations.get(id);
    if (!row.isActive) return row;
    await row.update({ isActive: false });
    return row;
  },
};

// ── Language ──────────────────────────────────────────────────────────────
export const languages = {
  async list(q: ListQuery) {
    return MstLanguage.findAll({
      where: activeWhere(q),
      order: [['displayOrder', 'ASC'], ['name', 'ASC']],
    });
  },

  async get(id: string) {
    const row = await MstLanguage.findByPk(id);
    if (!row) throw new HttpError(404, 'LANGUAGE_NOT_FOUND', 'Language not found');
    return row;
  },

  async create(body: CreateLanguage) {
    try {
      return await MstLanguage.create({ ...body, nativeName: body.nativeName ?? null });
    } catch (err) {
      throw toConflict(err, 'LANGUAGE');
    }
  },

  async update(id: string, body: UpdateLanguage) {
    const row = await languages.get(id);
    try {
      return await row.update(body);
    } catch (err) {
      throw toConflict(err, 'LANGUAGE');
    }
  },

  async remove(id: string) {
    const row = await languages.get(id);
    if (!row.isActive) return row;
    await row.update({ isActive: false });
    return row;
  },
};

// ── Dropdown values ───────────────────────────────────────────────────────
export const dropdownValues = {
  async list(q: DropdownListQuery) {
    return MstDropdownValue.findAll({
      where: { ...activeWhere(q), category: q.category },
      order: [['displayOrder', 'ASC'], ['label', 'ASC']],
    });
  },

  async get(id: string) {
    const row = await MstDropdownValue.findByPk(id);
    if (!row) throw new HttpError(404, 'DROPDOWN_VALUE_NOT_FOUND', 'Dropdown value not found');
    return row;
  },

  async create(body: CreateDropdownValue) {
    try {
      return await MstDropdownValue.create(body);
    } catch (err) {
      throw toConflict(err, 'DROPDOWN_VALUE');
    }
  },

  async update(id: string, body: UpdateDropdownValue) {
    const row = await dropdownValues.get(id);
    try {
      return await row.update(body);
    } catch (err) {
      throw toConflict(err, 'DROPDOWN_VALUE');
    }
  },

  async remove(id: string) {
    const row = await dropdownValues.get(id);
    if (!row.isActive) return row;
    await row.update({ isActive: false });
    return row;
  },
};
