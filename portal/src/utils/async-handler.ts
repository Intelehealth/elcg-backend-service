import { NextFunction, Request, Response } from 'express';

/**
 * Wrap an async route handler so a rejection lands on `next(err)` — otherwise
 * Express's default handler swallows the rejection and the request hangs.
 * Every route in this service uses this wrapper unless the handler is trivially
 * synchronous.
 */
export function asyncHandler<Req extends Request = Request>(
  fn: (req: Req, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Req, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
