import type { Request, Response, NextFunction } from 'express';
import * as authService from '../services/auth.service.js';
import * as registrationService from '../services/registration.service.js';

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password, companySlug } = req.body;
    const result = await authService.loginTenantUser(email, password, companySlug);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function listCompanies(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const result = await authService.listLoginCompanies(userId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function switchCompany(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const { companySlug } = req.body;
    const result = await authService.switchCompany(userId, companySlug);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = req.body;
    const result = await authService.refreshTokens(refreshToken);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = req.body;
    await authService.logout(refreshToken);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}

export async function me(req: Request, res: Response) {
  res.json({ success: true, data: req.user });
}

export async function registerRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const { firstName, lastName, email, password } = req.body;
    await registrationService.createRegistrationRequest({
      firstName,
      lastName,
      email,
      password,
    });
    res.status(201).json({ success: true, message: 'Request submitted successfully' });
  } catch (err) {
    next(err);
  }
}
