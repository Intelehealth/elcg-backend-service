import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { HttpError } from '@/middleware/error-handler';
import { resolveDownstream } from './router-table';
import { forward } from './proxy.service';

/**
 * BE-GW-PROXY-01 — catch-all `/api/v1/*` handler. Assumes `requireAuth` has
 * already populated `req.user` (mounted before this in proxy.routes).
 */

export async function proxyAll(req: Request, res: Response): Promise<void> {
  // req.baseUrl is '/api/v1', req.path is the rest ('/openmrs/getVisits').
  const pathAfterV1 = req.path;
  if (!pathAfterV1.startsWith('/')) {
    throw new HttpError(400, 'PROXY_BAD_PATH', 'Path must begin with /');
  }

  const downstream = resolveDownstream(pathAfterV1);
  if (!downstream) {
    throw new HttpError(404, 'PROXY_NO_ROUTE',
      `No downstream service registered for ${pathAfterV1}`);
  }

  const authHeader = req.header('Authorization') ?? undefined;
  const inbound: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue;
    inbound[k] = Array.isArray(v) ? v.join(', ') : String(v);
  }

  const result = await forward({
    downstream,
    method: req.method,
    pathAfterV1,
    query: req.query as Record<string, unknown>,
    body: req.body,
    headers: inbound,
    requestId: req.id ? String(req.id) : randomUUID(),
    userId: req.user?.sub,
    userRole: req.user?.role,
    authorization: authHeader,
  });

  // Copy the downstream's headers onto our response, then send the body verbatim.
  for (const [k, v] of Object.entries(result.headers)) res.setHeader(k, v);
  res.status(result.status).send(result.data);
}
