import type { Request, Response, NextFunction } from 'express';
import * as companyService from '../services/company.service.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { uploadFile, buildTenantStoragePrefix, deleteFolder, getCompanyStorageRoot } from '../services/storage.service.js';
import { db } from '../config/database.js';

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
    isRoot: company.is_root ?? false,
    odooApiKey: company.odoo_api_key,
    themeColor: company.theme_color ?? '#2563EB',
    companyCode: company.company_code ?? null,
    logoUrl: company.logo_url ?? null,
    canDeleteCompany: company.canDeleteCompany ?? false,
    createdAt: company.created_at,
    updatedAt: company.updated_at,
  };
}

async function createCompanyFromBody(req: Request) {
  const { name, odooApiKey, adminEmail, adminPassword, adminFirstName, adminLastName, companyCode } = req.body;
  return companyService.createCompany(
    name,
    { email: adminEmail, password: adminPassword, firstName: adminFirstName, lastName: adminLastName },
    odooApiKey,
    companyCode,
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

    const { name, odooApiKey, companyCode, themeColor } = req.body;
    const company = await companyService.createCompanyForSuperAdmin(name, superAdminId, odooApiKey, companyCode, themeColor);
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
    ensureAdministrator(req);
    const companies = await companyService.listCompanies();
    res.json({ success: true, data: companies.map(mapCompany) });
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
    const userId = req.user!.sub;
    const company = await companyService.getCurrentCompany(companyId);
    const canDeleteCompany = await companyService.canUserDeleteCompany(companyId, userId);
    res.json({ success: true, data: mapCompany({ ...company, canDeleteCompany }) });
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

export async function deleteCurrent(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) {
      throw new AppError(401, 'Unauthorized');
    }

    const result = await companyService.deleteCurrentCompany({
      companyId: user.companyId,
      userId: user.sub,
      typedCompanyName: req.body.companyName,
      superAdminEmail: req.body.superAdminEmail,
      superAdminPassword: req.body.superAdminPassword,
    });

    logger.warn(
      {
        companyId: user.companyId,
        deletedByUserId: user.sub,
      },
      'Company deleted via superuser action',
    );

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function updateByAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    ensureAdministrator(req);
    const id = req.params.id as string;
    const company = await companyService.updateCompany(id, req.body);
    res.json({ success: true, data: mapCompany(company) });
  } catch (err) {
    next(err);
  }
}

export async function deleteById(req: Request, res: Response, next: NextFunction) {
  try {
    const superAdmin = req.superAdmin;
    if (!superAdmin) {
      throw new AppError(401, 'Unauthorized');
    }

    const companyId = req.params.id as string;
    const result = await companyService.deleteCompanyById({
      companyId,
      typedCompanyName: req.body.companyName,
      superAdminEmail: req.body.superAdminEmail,
      superAdminPassword: req.body.superAdminPassword,
    });

    logger.warn(
      { companyId, deletedBySuperAdminId: superAdmin.sub },
      'Company deleted by super admin',
    );

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function uploadLogo(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'Unauthorized');

    const file = req.file as Express.Multer.File | undefined;
    if (!file) throw new AppError(400, 'No file uploaded');

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.mimetype)) {
      throw new AppError(400, 'Only JPEG, PNG, WebP, or GIF images are allowed');
    }

    const companyId = req.params.id as string;
    const company = await db.getDb()('companies').where({ id: companyId }).first();
    if (!company) throw new AppError(404, 'Company not found');

    const companyStorageRoot = getCompanyStorageRoot(company.slug);
    const folderPath = buildTenantStoragePrefix(companyStorageRoot, 'Company Logos', companyId);

    if (company.logo_url) {
      const deleted = await deleteFolder(folderPath);
      if (!deleted) logger.warn({ companyId }, 'Failed to delete old logo folder before replacement');
    }

    const logoUrl = await uploadFile(file.buffer, file.originalname, file.mimetype, folderPath);
    if (!logoUrl) throw new AppError(500, 'Failed to upload logo');

    const [updated] = await db.getDb()('companies')
      .where({ id: companyId })
      .update({ logo_url: logoUrl, updated_at: new Date() })
      .returning('*');

    res.json({ success: true, data: mapCompany(updated) });
  } catch (err) {
    next(err);
  }
}
