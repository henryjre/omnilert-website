import { db } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { comparePassword, hashPassword } from '../utils/password.js';

interface SuperAdminRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toPublic(admin: SuperAdminRow) {
  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    createdAt: admin.created_at,
    updatedAt: admin.updated_at,
  };
}

export async function hasAnySuperAdmin(): Promise<boolean> {
  const masterDb = db.getMasterDb();
  const row = await masterDb<SuperAdminRow>('super_admins').count<{ count: string }>('id as count').first();
  return Number(row?.count ?? 0) > 0;
}

export async function createFirstSuperAdmin(input: {
  name: string;
  email: string;
  password: string;
}) {
  const masterDb = db.getMasterDb();
  const exists = await hasAnySuperAdmin();
  if (exists) {
    throw new AppError(409, 'Super admin already initialized');
  }

  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);

  const [created] = await masterDb<SuperAdminRow>('super_admins')
    .insert({
      name: input.name.trim(),
      email,
      password_hash: passwordHash,
    })
    .returning('*');

  return toPublic(created);
}

export async function loginSuperAdmin(emailRaw: string, password: string) {
  const masterDb = db.getMasterDb();
  const email = normalizeEmail(emailRaw);
  const admin = await masterDb<SuperAdminRow>('super_admins').where({ email }).first();
  if (!admin) {
    throw new AppError(401, 'Invalid email or password');
  }

  const matches = await comparePassword(password, admin.password_hash);
  if (!matches) {
    throw new AppError(401, 'Invalid email or password');
  }

  return toPublic(admin);
}

export async function getSuperAdminById(id: string) {
  const masterDb = db.getMasterDb();
  const admin = await masterDb<SuperAdminRow>('super_admins').where({ id }).first();
  if (!admin) {
    throw new AppError(404, 'Super admin not found');
  }
  return toPublic(admin);
}
