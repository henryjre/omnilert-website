import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler.js';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const roles = await tenantDb('roles').orderBy('priority', 'desc');
    res.json({ success: true, data: roles });
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const user = req.user!;
    const { name, description, color, priority, permissionIds } = req.body;

    // Prevent creating roles with priority >= user's highest role priority
    const userRoles = await tenantDb('user_roles')
      .join('roles', 'user_roles.role_id', 'roles.id')
      .where('user_roles.user_id', user.sub)
      .select('roles.priority');
    const maxPriority = Math.max(...userRoles.map((r: { priority: number }) => r.priority));

    if (priority >= maxPriority) {
      throw new AppError(403, 'Cannot create a role with priority equal to or higher than your own');
    }

    const [role] = await tenantDb('roles')
      .insert({ name, description: description || null, color: color || null, priority })
      .returning('*');

    // Assign permissions
    if (permissionIds && permissionIds.length > 0) {
      const rolePermRows = permissionIds.map((permId: string) => ({
        role_id: role.id,
        permission_id: permId,
      }));
      await tenantDb('role_permissions').insert(rolePermRows);
    }

    res.status(201).json({ success: true, data: role });
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const { id } = req.params;

    const existing = await tenantDb('roles').where({ id }).first();
    if (!existing) throw new AppError(404, 'Role not found');
    if (existing.is_system && req.body.name) {
      throw new AppError(403, 'Cannot rename system roles');
    }

    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.description !== undefined) updates.description = req.body.description;
    if (req.body.color !== undefined) updates.color = req.body.color;
    if (req.body.priority !== undefined) updates.priority = req.body.priority;

    const [role] = await tenantDb('roles').where({ id }).update(updates).returning('*');
    res.json({ success: true, data: role });
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const { id } = req.params;

    const role = await tenantDb('roles').where({ id }).first();
    if (!role) throw new AppError(404, 'Role not found');
    if (role.is_system) throw new AppError(403, 'Cannot delete system roles');

    await tenantDb('roles').where({ id }).delete();
    res.json({ success: true, message: 'Role deleted' });
  } catch (err) {
    next(err);
  }
}

export async function getPermissions(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const { id } = req.params;

    const permissions = await tenantDb('role_permissions')
      .join('permissions', 'role_permissions.permission_id', 'permissions.id')
      .where('role_permissions.role_id', id)
      .select('permissions.*');

    res.json({ success: true, data: permissions });
  } catch (err) {
    next(err);
  }
}

export async function setPermissions(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const { id } = req.params;
    const { permissionIds } = req.body;

    // Replace all permissions
    await tenantDb('role_permissions').where('role_id', id).delete();

    if (permissionIds && permissionIds.length > 0) {
      const rows = permissionIds.map((permId: string) => ({
        role_id: id,
        permission_id: permId,
      }));
      await tenantDb('role_permissions').insert(rows);
    }

    res.json({ success: true, message: 'Permissions updated' });
  } catch (err) {
    next(err);
  }
}

export async function listAllPermissions(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const permissions = await tenantDb('permissions').orderBy('category').orderBy('key');
    res.json({ success: true, data: permissions });
  } catch (err) {
    next(err);
  }
}
