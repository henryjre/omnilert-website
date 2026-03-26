import type { Request, Response } from 'express';
import { PERMISSIONS } from '@omnilert/shared';
import { db } from '../config/database.js';
import { getAssignedBranches } from '../services/assignedBranch.service.js';
import { normalizeEmail } from '../services/globalUser.service.js';

export async function list(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const canViewAllBranches = req.user!.permissions.includes(PERMISSIONS.ADMIN_VIEW_ALL_BRANCHES);

  // Determine super admin status
  const user = await db.getDb()('users').where({ id: userId }).first('email');
  const isSuperAdmin = user
    ? Boolean(
        await db.getDb()('super_admins')
          .whereRaw('LOWER(email) = ?', [normalizeEmail(String(user.email ?? ''))])
          .first('id'),
      )
    : false;

  const groups = await getAssignedBranches(userId, isSuperAdmin, canViewAllBranches);
  res.json({ success: true, data: groups });
}
