import type { Request, Response, NextFunction } from 'express';
import type { Knex } from 'knex';
import { db } from '../config/database.js';

declare global {
  namespace Express {
    interface Request {
      tenantDb?: Knex;
    }
  }
}

export async function resolveCompany(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Not authenticated' });
    return;
  }

  try {
    req.tenantDb = await db.getTenantDb(req.user.companyDbName);
    next();
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to connect to company database' });
  }
}
