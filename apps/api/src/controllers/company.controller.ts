import type { Request, Response, NextFunction } from 'express';
import * as companyService from '../services/company.service.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

const ADMIN_ROLE_NAME = 'Administrator';

function ensureAdministrator(req: Request) {
  const roles = req.user?.roles ?? [];
  if (!roles.includes(ADMIN_ROLE_NAME)) {
    throw new AppError(403, 'Administrator role required');
  }
}

function mapCompany(company: any) {
  return {
    id: company.id,
    name: company.name,
    slug: company.slug,
    dbName: company.db_name,
    dbHost: company.db_host,
    dbPort: company.db_port,
    isActive: company.is_active,
    odooApiKey: company.odoo_api_key,
    themeColor: company.theme_color ?? '#2563EB',
    createdAt: company.created_at,
    updatedAt: company.updated_at,
  };
}

async function createCompanyFromBody(req: Request) {
  const { name, odooApiKey, adminEmail, adminPassword, adminFirstName, adminLastName } = req.body;
  return companyService.createCompany(
    name,
    { email: adminEmail, password: adminPassword, firstName: adminFirstName, lastName: adminLastName },
    odooApiKey,
  );
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const company = await createCompanyFromBody(req);
    res.status(201).json({ success: true, data: mapCompany(company) });
  } catch (err) {
    next(err);
  }
}

export async function createBySuperAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const superAdminId = req.superAdmin?.sub;
    if (!superAdminId) {
      throw new AppError(401, 'Unauthorized');
    }

    const { name, odooApiKey } = req.body;
    const company = await companyService.createCompanyForSuperAdmin(name, superAdminId, odooApiKey);
    logger.info(
      { superAdminId, companyId: company.id, companySlug: company.slug },
      'Company created by super admin',
    );
    res.status(201).json({ success: true, data: mapCompany(company) });
  } catch (err) {
    next(err);
  }
}

export async function createPublic(req: Request, res: Response, next: NextFunction) {
  try {
    const company = await createCompanyFromBody(req);
    res.status(201).json({ success: true, data: mapCompany(company) });
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const companies = await companyService.listCompanies();
    res.json({ success: true, data: companies });
  } catch (err) {
    next(err);
  }
}

export async function listPublic(_req: Request, res: Response, next: NextFunction) {
  try {
    const companies = await companyService.listCompaniesPublic();
    res.json({
      success: true,
      data: companies.map((c: any) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        themeColor: c.theme_color ?? '#2563EB',
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function get(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const company = await companyService.getCompany(id);
    res.json({ success: true, data: mapCompany(company) });
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const company = await companyService.updateCompany(id, req.body);
    res.json({ success: true, data: mapCompany(company) });
  } catch (err) {
    next(err);
  }
}

export async function getCurrent(req: Request, res: Response, next: NextFunction) {
  try {
    ensureAdministrator(req);
    const companyId = req.user!.companyId;
    const company = await companyService.getCurrentCompany(companyId);
    res.json({ success: true, data: mapCompany(company) });
  } catch (err) {
    next(err);
  }
}

export async function updateCurrent(req: Request, res: Response, next: NextFunction) {
  try {
    ensureAdministrator(req);
    const companyId = req.user!.companyId;
    const company = await companyService.updateCurrentCompany(companyId, req.body);
    res.json({ success: true, data: mapCompany(company) });
  } catch (err) {
    next(err);
  }
}
