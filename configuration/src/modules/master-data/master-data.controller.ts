import { Request, Response } from 'express';
import {
  CreateSpecialization, UpdateSpecialization,
  CreateLanguage, UpdateLanguage,
  CreateDropdownValue, UpdateDropdownValue,
  ListQuery, DropdownListQuery, IdParam,
} from './master-data.dto';
import { specializations, languages, dropdownValues } from './master-data.service';

/**
 * BE-CFG-MD-01 — thin HTTP layer. Zod parse + delegate. All error mapping
 * (unique-conflict, not-found, DB error) lives in master-data.service.
 */

// ── Specializations ───────────────────────────────────────────────────────
export const specializationsCtl = {
  async list(req: Request, res: Response): Promise<void> {
    const q = ListQuery.parse(req.query);
    res.json({ items: await specializations.list(q) });
  },
  async create(req: Request, res: Response): Promise<void> {
    const body = CreateSpecialization.parse(req.body);
    const row = await specializations.create(body);
    res.status(201).json(row);
  },
  async update(req: Request, res: Response): Promise<void> {
    const { id } = IdParam.parse(req.params);
    const body = UpdateSpecialization.parse(req.body);
    res.json(await specializations.update(id, body));
  },
  async remove(req: Request, res: Response): Promise<void> {
    const { id } = IdParam.parse(req.params);
    res.json(await specializations.remove(id));
  },
};

// ── Languages ─────────────────────────────────────────────────────────────
export const languagesCtl = {
  async list(req: Request, res: Response): Promise<void> {
    const q = ListQuery.parse(req.query);
    res.json({ items: await languages.list(q) });
  },
  async create(req: Request, res: Response): Promise<void> {
    const body = CreateLanguage.parse(req.body);
    const row = await languages.create(body);
    res.status(201).json(row);
  },
  async update(req: Request, res: Response): Promise<void> {
    const { id } = IdParam.parse(req.params);
    const body = UpdateLanguage.parse(req.body);
    res.json(await languages.update(id, body));
  },
  async remove(req: Request, res: Response): Promise<void> {
    const { id } = IdParam.parse(req.params);
    res.json(await languages.remove(id));
  },
};

// ── Dropdown values ───────────────────────────────────────────────────────
export const dropdownValuesCtl = {
  async list(req: Request, res: Response): Promise<void> {
    const q = DropdownListQuery.parse(req.query);
    res.json({ category: q.category, items: await dropdownValues.list(q) });
  },
  async create(req: Request, res: Response): Promise<void> {
    const body = CreateDropdownValue.parse(req.body);
    const row = await dropdownValues.create(body);
    res.status(201).json(row);
  },
  async update(req: Request, res: Response): Promise<void> {
    const { id } = IdParam.parse(req.params);
    const body = UpdateDropdownValue.parse(req.body);
    res.json(await dropdownValues.update(id, body));
  },
  async remove(req: Request, res: Response): Promise<void> {
    const { id } = IdParam.parse(req.params);
    res.json(await dropdownValues.remove(id));
  },
};
