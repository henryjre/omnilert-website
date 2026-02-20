import type { Request, Response, NextFunction } from 'express';
import { verifySuperAdminToken, type SuperAdminTokenPayload } from '../utils/jwt.js';

declare global {
  namespace Express {
    interface Request {
      superAdmin?: SuperAdminTokenPayload;
    }
  }
}

export function authenticateSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifySuperAdminToken(token);
    if (payload.scope !== 'super_admin') {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }
    req.superAdmin = payload;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Unauthorized' });
  }
}
