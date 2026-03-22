import type { Request, Response, NextFunction } from 'express';
import { db } from '../config/database.js';
import { getCompanyStorageRoot } from '../services/storage.service.js';

declare global {
  namespace Express {
    interface CompanyContext {
      companyId: string;
      companySlug: string;
      companyName: string;
      companyStorageRoot: string;
    }

    interface Request {
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
    const company = await db.getDb()('companies')
      .where({ id: req.user.companyId, is_active: true })
      .first('id', 'name', 'slug');

    if (!company) {
      res.status(401).json({
        success: false,
        error: 'Company is no longer available. Please sign in again.',
      });
      return;
    }

    req.companyContext = {
      companyId: String(company.id),
      companySlug: String(company.slug),
      companyName: String(company.name),
      companyStorageRoot: getCompanyStorageRoot(String(company.slug)),
    };
    next();
  } catch {
    res.status(401).json({
      success: false,
      error: 'Company is no longer available. Please sign in again.',
    });
  }
}
