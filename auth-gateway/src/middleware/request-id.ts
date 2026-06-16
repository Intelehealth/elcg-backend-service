import { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('X-Request-ID');
  const id = incoming && incoming.length > 0 ? incoming : uuidv4();
  // `req.id` is already declared by pino-http on IncomingMessage; assign through.
  (req as Request & { id: string }).id = id;
  res.setHeader('X-Request-ID', id);
  next();
}
