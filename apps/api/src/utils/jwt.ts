import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import crypto from 'crypto';

export interface AccessTokenPayload {
  sub: string;
  companyId: string;
  companySlug: string;
  companyDbName: string;
  roles: string[];
  permissions: string[];
  branchIds: string[];
}

export interface SuperAdminTokenPayload {
  sub: string;
  email: string;
  name: string;
  scope: 'super_admin';
}

export interface RefreshTokenPayload {
  sub: string;
  companyDbName: string;
  jti?: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as any };
  return jwt.sign(payload as object, env.JWT_SECRET, options);
}

export function signRefreshToken(userId: string, companyDbName: string): string {
  const options: SignOptions = { expiresIn: env.JWT_REFRESH_EXPIRES_IN as any };
  return jwt.sign(
    {
      sub: userId,
      companyDbName,
      jti: crypto.randomUUID(),
    },
    env.JWT_REFRESH_SECRET,
    options,
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
}

export function signSuperAdminToken(payload: SuperAdminTokenPayload): string {
  const options: SignOptions = { expiresIn: env.SUPER_ADMIN_JWT_EXPIRES_IN as any };
  return jwt.sign(payload as object, env.SUPER_ADMIN_JWT_SECRET, options);
}

export function verifySuperAdminToken(token: string): SuperAdminTokenPayload {
  return jwt.verify(token, env.SUPER_ADMIN_JWT_SECRET) as SuperAdminTokenPayload;
}
