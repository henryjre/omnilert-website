import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler.js';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const user = req.user!;
    const includeInactive = req.query.includeInactive === 'true';

    let query = tenantDb('branches');

    if (!includeInactive) {
      query = query.where('is_active', true);
    }

    // If user doesn't have admin.view_all_branches, filter by assigned branches
    if (!user.permissions.includes('admin.view_all_branches')) {
      query = query.whereIn('id', user.branchIds);
    }

    const branches = await query
      .select('id', 'name', 'address', 'odoo_branch_id', 'is_active', 'is_main_branch')
      .orderBy('name');
    res.json({ success: true, data: branches });
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const { name, address, odooBranchId, isMainBranch } = req.body;

    const [branch] = await tenantDb('branches')
      .insert({
        name,
        address: address || null,
        odoo_branch_id: odooBranchId || null,
        is_main_branch: Boolean(isMainBranch),
      })
      .returning('*');

    res.status(201).json({ success: true, data: branch });
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const { id } = req.params;
    const updates: Record<string, unknown> = { updated_at: new Date() };

    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.address !== undefined) updates.address = req.body.address;
    if (req.body.isActive !== undefined) updates.is_active = req.body.isActive;
    if (req.body.isMainBranch !== undefined) updates.is_main_branch = req.body.isMainBranch;
    if (req.body.odooBranchId !== undefined) updates.odoo_branch_id = req.body.odooBranchId;

    const [branch] = await tenantDb('branches').where({ id }).update(updates).returning('*');
    if (!branch) throw new AppError(404, 'Branch not found');

    res.json({ success: true, data: branch });
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const { id } = req.params;

    const [branch] = await tenantDb('branches')
      .where({ id })
      .update({ is_active: false, updated_at: new Date() })
      .returning('*');

    if (!branch) throw new AppError(404, 'Branch not found');

    res.json({ success: true, message: 'Branch deactivated' });
  } catch (err) {
    next(err);
  }
}
