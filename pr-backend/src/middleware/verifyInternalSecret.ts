import { Request, Response, NextFunction } from 'express';
import 'dotenv/config';

export function verifyInternalSecret(req: Request, res: Response, next: NextFunction): void {
  const secretHeader = req.headers['x-internal-secret'];
  const expectedSecret = process.env.INTERNAL_API_SECRET;

  if (!expectedSecret || !secretHeader || secretHeader !== expectedSecret) {
    res.status(401).json({ error: 'Unauthorized: Missing or mismatched x-internal-secret header' });
    return;
  }

  next();
}
