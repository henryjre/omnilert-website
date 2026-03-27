import type { Request, Response, NextFunction } from 'express';
import { db } from '../config/database.js';
import { getCompanyStorageRoot } from '../services/storage.service.js';
import { normalizeEmail } from '../services/globalUser.service.js';

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

async function isSuperAdminUser(userId: string): Promise<boolean> {
  const user = await db.getDb()('users').where({ id: userId }).first('email');
  if (!user) return false;
  return Boolean(
    await db.getDb()('super_admins')
      .whereRaw('LOWER(email) = ?', [normalizeEmail(String(user.email ?? ''))])
      .first('id'),
  );
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
    // Check for X-Company-Id header override
    const headerCompanyId = req.headers['x-company-id'] as string | undefined;
    let effectiveCompanyId: string = req.user.companyId;

    if (headerCompanyId && /^[0-9a-f-]{36}$/i.test(headerCompanyId)) {
      const superAdmin = await isSuperAdminUser(req.user.sub);

      if (!superAdmin) {
        const hasAccess = await db.getDb()('user_company_access')
          .where({
            user_id: req.user.sub,
            company_id: headerCompanyId,
            is_active: true,
          })
          .first('id');

        if (!hasAccess) {
          res.status(403).json({
            success: false,
            error: 'You do not have access to the requested company',
          });
          return;
        }
      }

      effectiveCompanyId = headerCompanyId;
    }

    const company = await db.getDb()('companies')
      .where({ id: effectiveCompanyId, is_active: true })
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
