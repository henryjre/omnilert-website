import type { Request, Response, NextFunction } from 'express';
import type { Knex } from 'knex';
import { db } from '../config/database.js';

declare global {
  namespace Express {
    interface CompanyContext {
      companyId: string;
      companySlug: string;
      companyName: string;
      companyStorageRoot: string;
    }

    interface Request {
      tenantDb?: Knex;
      companyContext?: CompanyContext;
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
    const masterDb = db.getMasterDb();
    const company = await masterDb('companies')
      .where({
        id: req.user.companyId,
        db_name: req.user.companyDbName,
        is_active: true,
      })
      .first('id', 'name', 'slug', 'db_name');

    if (!company) {
      res.status(401).json({
        success: false,
        error: 'Company is no longer available. Please sign in again.',
      });
      return;
    }

    req.tenantDb = await db.getTenantDb(company.db_name as string);
    req.companyContext = {
      companyId: String(company.id),
      companySlug: String(company.slug),
      companyName: String(company.name),
      companyStorageRoot: String(company.slug),
    };
    next();
  } catch {
    res.status(401).json({
      success: false,
      error: 'Company is no longer available. Please sign in again.',
    });
  }
}
