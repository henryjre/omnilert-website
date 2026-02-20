import type { Request, Response, NextFunction } from 'express';

export function requirePermission(...requiredPermissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const userPermissions = new Set(req.user.permissions);
    const missing = requiredPermissions.filter((p) => !userPermissions.has(p));

    if (missing.length > 0) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: `Missing permissions: ${missing.join(', ')}`,
      });
      return;
    }

    next();
  };
}

export function requireAnyPermission(...requiredPermissions: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Not authenticated' });
      return;
    }

    const userPermissions = new Set(req.user.permissions);
    const hasAny = requiredPermissions.some((p) => userPermissions.has(p));

    if (!hasAny) {
      res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: `Requires one of: ${requiredPermissions.join(', ')}`,
      });
      return;
    }

    next();
  };
}
