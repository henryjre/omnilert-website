import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { db } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { decryptText, encryptText } from '../utils/secureText.js';
import { hashPassword } from '../utils/password.js';
import {
  callOdooKw,
  createOrUpdateEmployeeForRegistration,
  formatBranchEmployeeCode,
  formatEmployeeDisplayName,
  getEmployeeIdentitySnapshot,
  syncAvatarToOdoo,
  syncUserProfileToOdoo,
  unifyPartnerContactsByEmail,
} from './odoo.service.js';
import { sendRegistrationApprovedEmail } from './mail.service.js';
import { getIO } from '../config/socket.js';
import { normalizeEmail } from './globalUser.service.js';
import { buildTenantStoragePrefix, deleteFolder, uploadFile } from './storage.service.js';

const REGISTRATION_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;
const DEFAULT_REGISTRATION_COMPANY_ID = 1;
const UUID_V4_LIKE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CompanyAssignmentInput = {
  companyId: string;
  branchIds: string[];
};

type ResidentBranchInput = {
  companyId: string;
  branchId: string;
};

type RegistrationProfileInput = {
  firstName: string;
  middleName: string;
  lastName: string;
  suffix?: string;
  birthday: string;
  gender: string;
  maritalStatus: string;
  address: string;
  mobileNumber: string;
  sssNumber?: string;
  tinNumber?: string;
  pagibigNumber?: string;
  philhealthNumber?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  emergencyRelationship?: string;
  email: string;
};

type RegistrationApprovalProfileInput = Partial<RegistrationProfileInput & {
  profilePictureUrl: string;
  validIdUrl: string;
}>;

type RegistrationUploadInput = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

type ResolvedCompanyAssignment = {
  companyId: string;
  companyName: string;
  companySlug: string;
  companyCode: string;
  branches: Array<{ id: string; name: string; odooBranchId: number }>;
};

type ApprovalUserRow = {
  id: string;
  email: string;
  user_key: string | null;
  employee_number: number | null;
  discord_user_id?: string | null;
};

type OdooEmployeeByWebsiteKeyRow = {
  id: number;
  work_email?: string | null;
  company_id?: [number, string] | false;
  barcode?: string | null;
  active?: boolean;
};

function inferImageMimeAndExt(buffer: Buffer): { mime: string; ext: string } {
  if (buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
    && buffer[4] === 0x0d
    && buffer[5] === 0x0a
    && buffer[6] === 0x1a
    && buffer[7] === 0x0a) {
    return { mime: 'image/png', ext: 'png' };
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }

  if (buffer.length >= 12
    && buffer[0] === 0x52
    && buffer[1] === 0x49
    && buffer[2] === 0x46
    && buffer[3] === 0x46
    && buffer[8] === 0x57
    && buffer[9] === 0x45
    && buffer[10] === 0x42
    && buffer[11] === 0x50) {
    return { mime: 'image/webp', ext: 'webp' };
  }

  return { mime: 'image/jpeg', ext: 'jpg' };
}

export function normalizeOptionalUserKey(input: string | undefined): string | undefined {
  if (input === undefined) return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  if (!UUID_V4_LIKE_PATTERN.test(trimmed)) {
    throw new AppError(400, 'Invalid user key. Expected a UUID value.');
  }
  return trimmed;
}

export function resolveProvidedUserKeyEmployeeNumberOrThrow(input: {
  providedEmployeeNumber?: number;
  existingIdentityEmployeeNumber: number | null;
}): number | null {
  const existingEmployeeNumber = Number(input.existingIdentityEmployeeNumber ?? 0);
  const hasExistingEmployeeNumber = Number.isInteger(existingEmployeeNumber) && existingEmployeeNumber > 0;

  if (input.providedEmployeeNumber != null) {
    if (hasExistingEmployeeNumber && existingEmployeeNumber !== input.providedEmployeeNumber) {
      throw new AppError(
        400,
        `Provided employee number ${input.providedEmployeeNumber} does not match existing identity employee number ${existingEmployeeNumber}.`,
      );
    }
    return input.providedEmployeeNumber;
  }

  if (hasExistingEmployeeNumber) {
    return existingEmployeeNumber;
  }

  return null;
}

export function selectApprovalCanonicalUsers(input: {
  existingByEmail: ApprovalUserRow | null;
  existingByUserKey: ApprovalUserRow | null;
}): { canonicalUserId: string | null; duplicateUserId: string | null } {
  if (input.existingByUserKey) {
    return {
      canonicalUserId: input.existingByUserKey.id,
      duplicateUserId: input.existingByEmail && input.existingByEmail.id !== input.existingByUserKey.id
        ? input.existingByEmail.id
        : null,
    };
  }

  if (input.existingByEmail) {
    return {
      canonicalUserId: input.existingByEmail.id,
      duplicateUserId: null,
    };
  }

  return {
    canonicalUserId: null,
    duplicateUserId: null,
  };
}

async function mergeRegistrationDuplicateUser(input: {
  trx: Knex.Transaction;
  canonicalUserId: string;
  duplicateUserId: string;
  canonicalEmail: string;
}): Promise<void> {
  const { trx, canonicalUserId, duplicateUserId, canonicalEmail } = input;
  const now = new Date();

  await trx('user_roles')
    .insert(
      trx('user_roles')
        .select(
          trx.raw('gen_random_uuid() as id'),
          trx.raw('? as user_id', [canonicalUserId]),
          'role_id',
          'assigned_by',
          'created_at',
        )
        .where({ user_id: duplicateUserId }),
    )
    .onConflict(['user_id', 'role_id'])
    .ignore();

  await trx('user_company_access')
    .insert(
      trx('user_company_access')
        .select(
          trx.raw('gen_random_uuid() as id'),
          trx.raw('? as user_id', [canonicalUserId]),
          'company_id',
          'position_title',
          'date_started',
          'is_active',
          'created_at',
          trx.raw('? as updated_at', [now]),
        )
        .where({ user_id: duplicateUserId }),
    )
    .onConflict(['user_id', 'company_id'])
    .ignore();

  await trx('user_company_branches')
    .insert(
      trx('user_company_branches')
        .select(
          trx.raw('gen_random_uuid() as id'),
          trx.raw('? as user_id', [canonicalUserId]),
          'company_id',
          'branch_id',
          'assignment_type',
          'created_at',
          trx.raw('? as updated_at', [now]),
        )
        .where({ user_id: duplicateUserId }),
    )
    .onConflict(['user_id', 'company_id', 'branch_id'])
    .ignore();

  await trx('user_branches')
    .insert(
      trx('user_branches')
        .select(
          trx.raw('gen_random_uuid() as id'),
          'company_id',
          trx.raw('? as user_id', [canonicalUserId]),
          'branch_id',
          'is_primary',
          'created_at',
        )
        .where({ user_id: duplicateUserId }),
    )
    .onConflict(['user_id', 'branch_id'])
    .ignore();

  const archivedEmail = `${canonicalEmail}.merged.${duplicateUserId}@archived.local`;
  await trx('users')
    .where({ id: duplicateUserId })
    .update({
      email: archivedEmail,
      user_key: null,
      employee_number: null,
      is_active: false,
      employment_status: 'inactive',
      updated_at: now,
    });
}

function randomPin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function cleanString(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function cleanOptionalString(value: unknown): string | undefined {
  const cleaned = cleanString(value);
  return cleaned.length > 0 ? cleaned : undefined;
}

function buildLegalNameFromRegistration(profile: {
  firstName: unknown;
  middleName: unknown;
  lastName: unknown;
  suffix?: unknown;
}): string {
  return [
    cleanString(profile.firstName),
    cleanString(profile.middleName),
    cleanString(profile.lastName),
    cleanString(profile.suffix),
  ].filter(Boolean).join(' ');
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' ? value as Record<string, unknown> : {};
}

function resolveRegistrationProfile(request: any, edits?: RegistrationApprovalProfileInput): RegistrationProfileInput & {
  profilePictureUrl: string | null;
  validIdUrl: string | null;
} {
  const source = { ...request, ...parseJsonObject(request.approved_profile), ...(edits ?? {}) };
  return {
    firstName: cleanString(source.firstName ?? source.first_name),
    middleName: cleanString(source.middleName ?? source.middle_name ?? 'N/A'),
    lastName: cleanString(source.lastName ?? source.last_name),
    suffix: cleanOptionalString(source.suffix),
    birthday: cleanString(source.birthday),
    gender: cleanString(source.gender),
    maritalStatus: cleanString(source.maritalStatus ?? source.marital_status),
    address: cleanString(source.address),
    mobileNumber: cleanString(source.mobileNumber ?? source.mobile_number),
    sssNumber: cleanOptionalString(source.sssNumber ?? source.sss_number),
    tinNumber: cleanOptionalString(source.tinNumber ?? source.tin_number),
    pagibigNumber: cleanOptionalString(source.pagibigNumber ?? source.pagibig_number),
    philhealthNumber: cleanOptionalString(source.philhealthNumber ?? source.philhealth_number),
    emergencyContact: cleanOptionalString(source.emergencyContact ?? source.emergency_contact),
    emergencyPhone: cleanOptionalString(source.emergencyPhone ?? source.emergency_phone),
    emergencyRelationship: cleanOptionalString(source.emergencyRelationship ?? source.emergency_relationship),
    email: normalizeEmail(String(source.email ?? '')),
    profilePictureUrl: cleanOptionalString(source.profilePictureUrl ?? source.profile_picture_url) ?? null,
    validIdUrl: cleanOptionalString(source.validIdUrl ?? source.valid_id_url) ?? null,
  };
}

function sanitizeRegistrationRequest(row: any): any {
  const {
    encrypted_password: _encryptedPassword,
    discord_user_id: _discordUserId,
    ...rest
  } = row;
  return rest;
}

async function emitRegistrationVerificationUpdateGlobal(payload: {
  verificationId: string;
  action: 'created' | 'approved' | 'rejected';
  userId?: string;
}) {
  const masterDb = db.getDb();
  const companies = await masterDb('companies').where({ is_active: true }).select('id');
  try {
    const namespace = getIO().of('/employee-verifications');
    for (const company of companies) {
      namespace.to(`company:${company.id}`).emit('employee-verification:updated', {
        companyId: company.id as string,
        verificationId: payload.verificationId,
        verificationType: 'registration',
        action: payload.action,
        userId: payload.userId,
      });
    }
  } catch {
    // socket can be unavailable during tests/bootstrapping
  }
}

function emitRegistrationApprovalProgress(payload: {
  companyId: string;
  verificationId: string;
  reviewerId: string;
  step:
    | 'start'
    | 'validate'
    | 'identity'
    | 'pin'
    | 'employees'
    | 'merge'
    | 'user'
    | 'email'
    | 'done';
  message: string;
}): void {
  try {
    getIO().of('/employee-verifications')
      .to(`company:${payload.companyId}`)
      .emit('employee-verification:approval-progress', {
        companyId: payload.companyId,
        verificationId: payload.verificationId,
        verificationType: 'registration',
        reviewerId: payload.reviewerId,
        step: payload.step,
        message: payload.message,
        createdAt: new Date().toISOString(),
      });
  } catch {
    // socket can be unavailable during tests/bootstrapping
  }
}

async function getMaxEmployeeNumberFromOdoo(
  companyCode: string,
  odooBranchIds: number[],
): Promise<number> {
  const employees = (await callOdooKw(
    'hr.employee',
    'search_read',
    [],
    {
      domain: [['barcode', '=ilike', `${companyCode}%`]],
      fields: ['barcode'],
      limit: 10000,
      context: { active_test: false },
    },
  )) as Array<{ barcode?: string | null }>;

  let maxEmployeeNumber = 0;
  for (const row of employees) {
    const barcode = (row.barcode ?? '').trim().toUpperCase();
    if (!barcode.startsWith(companyCode)) continue;

    const numericPart = barcode.slice(companyCode.length);
    if (!/^\d+$/.test(numericPart)) continue;

    for (const branchId of odooBranchIds) {
      const prefix = String(branchId - 1);
      if (!numericPart.startsWith(prefix)) continue;
      const employeePart = numericPart.slice(prefix.length);
      if (!employeePart || !/^\d+$/.test(employeePart)) continue;
      maxEmployeeNumber = Math.max(maxEmployeeNumber, Number(employeePart));
    }
  }

  return maxEmployeeNumber;
}

async function resolveOrCreateEmployeeIdentity(
  email: string,
): Promise<{ employeeNumber: number; websiteKey: string; identityId: string | null; wasExisting: boolean }> {
  return db.getDb().transaction(async (trx) => {
    // Check if a user with this email already has an employee number + website key allocated
    const existingUser = await trx('users')
      .whereRaw('LOWER(email) = ?', [email])
      .whereNotNull('employee_number')
      .whereNotNull('user_key')
      .forUpdate()
      .first('id', 'employee_number', 'user_key');

    if (existingUser) {
      return {
        employeeNumber: existingUser.employee_number as number,
        websiteKey: existingUser.user_key as string,
        identityId: existingUser.id as string,
        wasExisting: true,
      };
    }

    // New identity — compute next employee number from users table
    const usersMax = await trx('users')
      .max<{ max: string | number | null }>('employee_number as max')
      .first();
    const nextEmployeeNumber = Number(usersMax?.max ?? 0) + 1;
    const websiteKey = randomUUID();

    // identityId is null for new users — the user row doesn't exist yet at this point.
    // The correct employee_number will be set when the user record is created later.
    return {
      employeeNumber: nextEmployeeNumber,
      websiteKey,
      identityId: null,
      wasExisting: false,
    };
  });
}

async function listEmployeesByWebsiteUserKeyAcrossCompanies(userKey: string): Promise<OdooEmployeeByWebsiteKeyRow[]> {
  return (await callOdooKw(
    'hr.employee',
    'search_read',
    [],
    {
      domain: [['x_website_key', '=', userKey]],
      fields: ['id', 'company_id', 'work_email', 'barcode', 'active'],
      limit: 10000,
      context: { active_test: false },
    },
  )) as OdooEmployeeByWebsiteKeyRow[];
}

async function syncExistingOdooEmployeeEmailsByUserKey(input: {
  employees: OdooEmployeeByWebsiteKeyRow[];
  normalizedEmail: string;
}): Promise<number> {
  let updatedCount = 0;
  for (const employee of input.employees) {
    const currentEmail = normalizeEmail(String(employee.work_email ?? ''));
    if (currentEmail === input.normalizedEmail) continue;
    await callOdooKw('hr.employee', 'write', [[employee.id], { work_email: input.normalizedEmail }]);
    updatedCount += 1;
  }
  return updatedCount;
}

async function getFirstEmployeeAvatarBase64ByWebsiteKey(userKey: string): Promise<string | null> {
  const rows = (await callOdooKw(
    'hr.employee',
    'search_read',
    [],
    {
      domain: [['x_website_key', '=', userKey]],
      fields: ['id', 'image_1920'],
      order: 'id asc',
      limit: 1,
      context: { active_test: false },
    },
  )) as Array<{ id?: number; image_1920?: string | false | null }>;

  if (!rows.length) return null;
  const imageBase64 = String(rows[0].image_1920 ?? '').trim();
  return imageBase64 || null;
}

async function importFirstOdooEmployeeAvatarToWebsite(input: {
  websiteKey: string;
  userId: string;
  avatarStorageRoot?: string | null;
}): Promise<string | null> {
  const storageRoot = String(input.avatarStorageRoot ?? '').trim();
  if (!storageRoot) return null;

  const employeeAvatarBase64 = await getFirstEmployeeAvatarBase64ByWebsiteKey(input.websiteKey);
  if (!employeeAvatarBase64) return null;

  const cleanedBase64 = employeeAvatarBase64.includes(',')
    ? String(employeeAvatarBase64.split(',').pop() ?? '').trim()
    : employeeAvatarBase64;
  if (!cleanedBase64) return null;

  const avatarBuffer = Buffer.from(cleanedBase64, 'base64');
  if (!avatarBuffer.length) return null;

  const { mime, ext } = inferImageMimeAndExt(avatarBuffer);
  const folderPath = buildTenantStoragePrefix(storageRoot, 'Profile Pictures', input.userId);
  await deleteFolder(folderPath);

  const avatarUrl = await uploadFile(
    avatarBuffer,
    `odoo-avatar.${ext}`,
    mime,
    folderPath,
  );
  return avatarUrl ?? null;
}

async function assertWebsiteEmployeeNumberAvailability(input: {
  employeeNumber: number;
  websiteKey: string;
  identityId: string | null;
}): Promise<void> {
  const existingUser = await db.getDb()('users')
    .where({ employee_number: input.employeeNumber })
    .first('id', 'user_key');
  if (!existingUser) return;

  const existingId = String(existingUser.id ?? '');
  const existingKey = String(existingUser.user_key ?? '').trim();
  const sameById = input.identityId ? existingId === input.identityId : false;
  const sameByKey = existingKey.length > 0 && existingKey === input.websiteKey;
  if (sameById || sameByKey) return;

  throw new AppError(400, `Employee number ${input.employeeNumber} is already taken by another website user.`);
}

async function resolveAssignmentsOrThrow(input: {
  companyAssignments: CompanyAssignmentInput[];
  residentBranch: ResidentBranchInput;
}): Promise<{
  assignments: ResolvedCompanyAssignment[];
  resident: {
    companyId: string;
    companyName: string;
    branchId: string;
    branchName: string;
  };
}> {
  const dedupedAssignments = input.companyAssignments.map((item) => ({
    companyId: item.companyId,
    branchIds: Array.from(new Set(item.branchIds)),
  }));

  const uniqueCompanyIds = new Set<string>();
  for (const assignment of dedupedAssignments) {
    if (uniqueCompanyIds.has(assignment.companyId)) {
      throw new AppError(400, `Duplicate company assignment: ${assignment.companyId}`);
    }
    uniqueCompanyIds.add(assignment.companyId);
    if (assignment.branchIds.length === 0) {
      throw new AppError(400, 'At least one branch is required for every selected company');
    }
  }

  const assignments: ResolvedCompanyAssignment[] = [];

  for (const assignment of dedupedAssignments) {
    const company = await db.getDb()('companies')
      .where({ id: assignment.companyId, is_active: true })
      .first('id', 'name', 'slug', 'company_code');

    if (!company) {
      throw new AppError(400, `Selected company is invalid or inactive: ${assignment.companyId}`);
    }

    const companyCode = String(company.company_code ?? '').trim().toUpperCase();
    if (!companyCode) {
      throw new AppError(400, `Company "${company.name}" is missing a company code`);
    }

    const branchRows = await db.getDb()('branches')
      .whereIn('id', assignment.branchIds)
      .where({ is_active: true })
      .select('id', 'name', 'odoo_branch_id');

    if (branchRows.length !== assignment.branchIds.length) {
      throw new AppError(400, `One or more selected branches are invalid for company "${company.name}"`);
    }

    const branches = branchRows.map((row: any) => {
      const odooBranchId = Number(row.odoo_branch_id);
      if (!row.odoo_branch_id || Number.isNaN(odooBranchId)) {
        throw new AppError(400, `Branch "${row.name}" in "${company.name}" is missing a valid Odoo branch ID`);
      }
      return {
        id: row.id as string,
        name: row.name as string,
        odooBranchId,
      };
    });

    assignments.push({
      companyId: company.id as string,
      companyName: company.name as string,
      companySlug: company.slug as string,
      companyCode,
      branches,
    });
  }

  const residentCompany = assignments.find((item) => item.companyId === input.residentBranch.companyId);
  if (!residentCompany) {
    throw new AppError(400, 'Resident company must be included in selected company assignments');
  }
  const residentBranch = residentCompany.branches.find((branch) => branch.id === input.residentBranch.branchId);
  if (!residentBranch) {
    throw new AppError(400, 'Resident branch must be included in selected branches of resident company');
  }

  return {
    assignments,
    resident: {
      companyId: residentCompany.companyId,
      companyName: residentCompany.companyName,
      branchId: residentBranch.id,
      branchName: residentBranch.name,
    },
  };
}

export async function createRegistrationRequest(input: {
  id?: string;
  firstName: string;
  middleName: string;
  lastName: string;
  suffix?: string;
  birthday: string;
  gender: string;
  maritalStatus: string;
  address: string;
  mobileNumber: string;
  sssNumber?: string;
  tinNumber?: string;
  pagibigNumber?: string;
  philhealthNumber?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  emergencyRelationship?: string;
  email: string;
  password: string;
  profilePictureUrl?: string;
  validIdUrl?: string;
  profilePictureFile?: RegistrationUploadInput;
  validIdFile?: RegistrationUploadInput;
}): Promise<void> {
  const masterDb = db.getDb();
  const email = normalizeEmail(input.email);
  const requestId = input.id ?? randomUUID();

  const existingUser = await masterDb('users')
    .whereRaw('LOWER(email) = ?', [email])
    .where({ is_active: true })
    .first('id');
  if (existingUser) {
    throw new AppError(409, 'An active user with this email already exists');
  }

  const pending = await masterDb('registration_requests')
    .whereRaw('LOWER(email) = ?', [email])
    .where({ status: REGISTRATION_STATUSES.PENDING })
    .first('id');
  if (pending) {
    throw new AppError(409, 'A pending registration request already exists for this email');
  }

  const uploadRegistrationImage = async (
    file: RegistrationUploadInput | undefined,
    folderName: string,
  ): Promise<string | undefined> => {
    if (!file) return undefined;
    const folderPath = buildTenantStoragePrefix(
      'public-registration',
      requestId,
      folderName,
    );
    const url = await uploadFile(file.buffer, file.originalname, file.mimetype, folderPath);
    if (!url) {
      throw new AppError(500, `Failed to upload ${folderName.toLowerCase()}`);
    }
    return url;
  };

  const profilePictureUrl = cleanOptionalString(input.profilePictureUrl)
    ?? (await uploadRegistrationImage(input.profilePictureFile, 'Profile Picture'));
  const validIdUrl = cleanOptionalString(input.validIdUrl)
    ?? (await uploadRegistrationImage(input.validIdFile, 'Valid ID'));

  if (!profilePictureUrl) {
    throw new AppError(400, 'Profile picture is required');
  }
  if (!validIdUrl) {
    throw new AppError(400, 'Valid ID image is required');
  }

  const [created] = await masterDb('registration_requests').insert({
    id: requestId,
    first_name: cleanString(input.firstName),
    middle_name: cleanString(input.middleName),
    last_name: cleanString(input.lastName),
    suffix: cleanOptionalString(input.suffix) ?? null,
    birthday: cleanString(input.birthday),
    gender: cleanString(input.gender),
    marital_status: cleanString(input.maritalStatus),
    address: cleanString(input.address),
    mobile_number: cleanString(input.mobileNumber),
    sss_number: cleanOptionalString(input.sssNumber) ?? null,
    tin_number: cleanOptionalString(input.tinNumber) ?? null,
    pagibig_number: cleanOptionalString(input.pagibigNumber) ?? null,
    philhealth_number: cleanOptionalString(input.philhealthNumber) ?? null,
    emergency_contact: cleanOptionalString(input.emergencyContact) ?? null,
    emergency_phone: cleanOptionalString(input.emergencyPhone) ?? null,
    emergency_relationship: cleanOptionalString(input.emergencyRelationship) ?? null,
    profile_picture_url: profilePictureUrl,
    valid_id_url: validIdUrl,
    email,
    encrypted_password: encryptText(input.password),
    status: REGISTRATION_STATUSES.PENDING,
    requested_at: new Date(),
    updated_at: new Date(),
  }).returning('id');

  await emitRegistrationVerificationUpdateGlobal({
    verificationId: created.id as string,
    action: 'created',
  });
}

export async function listRegistrationRequests(): Promise<any[]> {
  const masterDb = db.getDb();
  const rows = await masterDb('registration_requests')
    .leftJoin('users as reviewers', 'registration_requests.reviewed_by', 'reviewers.id')
    .select(
      'registration_requests.*',
      masterDb.raw("CONCAT(reviewers.first_name, ' ', reviewers.last_name) as reviewed_by_name"),
    )
    .orderBy('registration_requests.requested_at', 'desc');
  return rows.map(sanitizeRegistrationRequest);
}

export async function listRegistrationAssignmentOptions(): Promise<{
  roles: any[];
  companies: Array<{
    id: string;
    name: string;
    slug: string;
    branches: Array<{ id: string; name: string; odoo_branch_id: string }>;
  }>;
}> {
  const masterDb = db.getDb();
  const roles = await masterDb('roles')
    .select('id', 'name', 'color', 'priority')
    .orderBy('priority', 'desc')
    .orderBy('name', 'asc');

  const companies = await masterDb('companies')
    .where({ is_active: true })
    .select('id', 'name', 'slug')
    .orderBy('name', 'asc');

  const companyOptions: Array<{
    id: string;
    name: string;
    slug: string;
    branches: Array<{ id: string; name: string; odoo_branch_id: string }>;
  }> = [];

  for (const company of companies) {
    const branches = await db.getDb()('branches')
      .where({ company_id: company.id, is_active: true })
      .select('id', 'name', 'odoo_branch_id')
      .orderBy('name', 'asc');

    companyOptions.push({
      id: company.id as string,
      name: company.name as string,
      slug: company.slug as string,
      branches: branches.map((branch: any) => ({
        id: branch.id as string,
        name: branch.name as string,
        odoo_branch_id: String(branch.odoo_branch_id ?? ''),
      })),
    });
  }

  return { roles, companies: companyOptions };
}

export async function approveRegistrationRequest(input: {
  reviewerId: string;
  reviewerCompanyId: string;
  requestId: string;
  roleIds: string[];
  companyAssignments: CompanyAssignmentInput[];
  residentBranch: ResidentBranchInput;
  employeeNumber?: number;
  userKey?: string;
  avatarUrl?: string;
  profile?: RegistrationApprovalProfileInput;
  avatarStorageRoot?: string | null;
}): Promise<{ requestId: string; userId: string }> {
  const masterDb = db.getDb();

  emitRegistrationApprovalProgress({
    companyId: input.reviewerCompanyId,
    verificationId: input.requestId,
    reviewerId: input.reviewerId,
    step: 'start',
    message: 'Starting approval process...',
  });

  const request = await masterDb('registration_requests')
    .where({ id: input.requestId })
    .first();
  if (!request) {
    throw new AppError(404, 'Registration request not found');
  }
  if (request.status !== REGISTRATION_STATUSES.PENDING) {
    throw new AppError(400, 'Registration request is already resolved');
  }
  const approvedProfile = resolveRegistrationProfile(request, input.profile);

  emitRegistrationApprovalProgress({
    companyId: input.reviewerCompanyId,
    verificationId: input.requestId,
    reviewerId: input.reviewerId,
    step: 'validate',
    message: 'Validating roles and company/branch assignments...',
  });

  const existingRoles = await masterDb('roles').whereIn('id', input.roleIds).select('id');
  if (existingRoles.length !== input.roleIds.length) {
    throw new AppError(400, 'One or more selected roles are invalid');
  }

  const { assignments, resident } = await resolveAssignmentsOrThrow({
    companyAssignments: input.companyAssignments,
    residentBranch: input.residentBranch,
  });
  const residentAssignment = assignments.find((item) => item.companyId === resident.companyId)!;

  const normalizedEmail = approvedProfile.email;
  const registrationDiscordUserId = typeof request.discord_user_id === 'string' && request.discord_user_id.trim()
    ? request.discord_user_id.trim()
    : null;
  const requestedAvatarUrl = typeof input.avatarUrl === 'string' && input.avatarUrl.trim().length > 0
    ? input.avatarUrl.trim()
    : approvedProfile.profilePictureUrl ?? undefined;
  const requestedUserKey = normalizeOptionalUserKey(input.userKey);
  const identity = await resolveOrCreateEmployeeIdentity(normalizedEmail);
  const websiteKey = requestedUserKey ?? identity.websiteKey;
  let skipOdooEmployeeUpsert = false;
  let resolvedInputEmployeeNumber = input.employeeNumber;
  if (requestedUserKey) {
    const existingEmployeesByUserKey = await listEmployeesByWebsiteUserKeyAcrossCompanies(requestedUserKey);
    if (existingEmployeesByUserKey.length === 0) {
      throw new AppError(400, `No employee found for user key ${requestedUserKey}.`);
    }

    const syncedEmployeeEmailsCount = await syncExistingOdooEmployeeEmailsByUserKey({
      employees: existingEmployeesByUserKey,
      normalizedEmail,
    });

    emitRegistrationApprovalProgress({
      companyId: input.reviewerCompanyId,
      verificationId: input.requestId,
      reviewerId: input.reviewerId,
      step: 'identity',
      message: syncedEmployeeEmailsCount > 0
        ? `Found ${existingEmployeesByUserKey.length} Odoo employee(s) for provided user key and synced ${syncedEmployeeEmailsCount} email(s).`
        : `Found ${existingEmployeesByUserKey.length} Odoo employee(s) for provided user key.`,
    });

    const userByProvidedKey = await masterDb('users')
      .where({ user_key: requestedUserKey })
      .first('id', 'employee_number');
    const existingIdentityEmployeeNumber = Number(userByProvidedKey?.employee_number ?? 0) > 0
      ? Number(userByProvidedKey?.employee_number)
      : null;

    const resolvedFromProvidedKey = resolveProvidedUserKeyEmployeeNumberOrThrow({
      providedEmployeeNumber: input.employeeNumber,
      existingIdentityEmployeeNumber,
    });
    if (resolvedFromProvidedKey != null) {
      resolvedInputEmployeeNumber = resolvedFromProvidedKey;
    }

    if (userByProvidedKey?.id) {
      if (existingIdentityEmployeeNumber != null) {
        identity.employeeNumber = existingIdentityEmployeeNumber;
      }
      identity.identityId = userByProvidedKey.id as string;
      identity.wasExisting = true;
    }

    skipOdooEmployeeUpsert = true;
  }
  let employeeNumber = identity.employeeNumber;

  emitRegistrationApprovalProgress({
    companyId: input.reviewerCompanyId,
    verificationId: input.requestId,
    reviewerId: input.reviewerId,
    step: 'identity',
    message: `Resolved employee identity (#${employeeNumber}).`,
  });

  const decryptedPassword = decryptText(String(request.encrypted_password));

  const maxByCompanyCode: Record<string, number> = {};
  for (const assignment of assignments) {
    const key = assignment.companyCode;
    if (maxByCompanyCode[key] !== undefined) continue;
    maxByCompanyCode[key] = await getMaxEmployeeNumberFromOdoo(
      assignment.companyCode,
      assignment.branches.map((branch) => branch.odooBranchId),
    );
  }
  const maxOdooEmployeeNumber = Math.max(0, ...Object.values(maxByCompanyCode));

  const identitySnapshot = await getEmployeeIdentitySnapshot({
    websiteUserKey: websiteKey,
    email: normalizedEmail,
  });

  if (identitySnapshot.employeeCount === 0 && employeeNumber <= maxOdooEmployeeNumber) {
    employeeNumber = maxOdooEmployeeNumber + 1;
  }

  const existingPin = identitySnapshot.existingPin;
  const sharedPin = existingPin || randomPin();

  emitRegistrationApprovalProgress({
    companyId: input.reviewerCompanyId,
    verificationId: input.requestId,
    reviewerId: input.reviewerId,
    step: 'pin',
    message: existingPin
      ? 'Reused existing employee PIN for all assigned branches.'
      : 'Generated a new PIN and will apply it to all assigned branches.',
  });

  const isEmployeeNumberAvailable = async (candidate: number): Promise<boolean> => {
    for (const assignment of assignments) {
      for (const branch of assignment.branches) {
        const branchCode = formatBranchEmployeeCode(branch.odooBranchId, candidate);
        const barcode = `${assignment.companyCode}${branchCode}`;
        const matches = (await callOdooKw(
          'hr.employee',
          'search_read',
          [],
          {
            domain: [['barcode', '=', barcode]],
            fields: ['id', 'x_website_key'],
            limit: 10,
          },
        )) as Array<{ id: number; x_website_key?: string | null }>;

        const takenByOtherIdentity = matches.some((employee) => employee.x_website_key !== websiteKey);
        if (takenByOtherIdentity) {
          return false;
        }
      }
    }

    const defaultCompanyBranchCode = formatBranchEmployeeCode(DEFAULT_REGISTRATION_COMPANY_ID, candidate);
    const defaultCompanyBarcode = `${residentAssignment.companyCode}${defaultCompanyBranchCode}`;
    const defaultCompanyMatches = (await callOdooKw(
      'hr.employee',
      'search_read',
      [],
      {
        domain: [['barcode', '=', defaultCompanyBarcode]],
        fields: ['id', 'x_website_key'],
        limit: 10,
      },
    )) as Array<{ id: number; x_website_key?: string | null }>;
    if (defaultCompanyMatches.some((employee) => employee.x_website_key !== websiteKey)) {
      return false;
    }

    return true;
  };

  let guard = 0;
  while (!(await isEmployeeNumberAvailable(employeeNumber))) {
    guard += 1;
    if (guard > 5000) {
      throw new AppError(500, 'Unable to allocate a unique employee number');
    }
    employeeNumber += 1;
  }

  if (resolvedInputEmployeeNumber != null) {
    if (!(await isEmployeeNumberAvailable(resolvedInputEmployeeNumber))) {
      throw new AppError(400, `Employee number ${resolvedInputEmployeeNumber} is already taken by another employee.`);
    }
    await assertWebsiteEmployeeNumberAvailability({
      employeeNumber: resolvedInputEmployeeNumber,
      websiteKey,
      identityId: identity.identityId,
    });
    employeeNumber = resolvedInputEmployeeNumber;
  }

  // If the user already exists and the employee number shifted (Odoo collision),
  // update it on the users row now so the final user upsert uses the correct value.
  if (identity.identityId && employeeNumber !== identity.employeeNumber) {
    await masterDb('users')
      .where({ id: identity.identityId })
      .update({ employee_number: employeeNumber, updated_at: new Date() });
  }

  const fullName = `${approvedProfile.firstName} ${approvedProfile.lastName}`.trim();
  const residentBranch = residentAssignment.branches.find((item) => item.id === resident.branchId)!;

  if (skipOdooEmployeeUpsert) {
    emitRegistrationApprovalProgress({
      companyId: input.reviewerCompanyId,
      verificationId: input.requestId,
      reviewerId: input.reviewerId,
      step: 'employees',
      message: 'Using existing Odoo employees from the provided user key; skipped employee upsert.',
    });
  } else {
    const totalBranches = assignments.reduce((acc, assignment) => acc + assignment.branches.length, 0);

    emitRegistrationApprovalProgress({
      companyId: input.reviewerCompanyId,
      verificationId: input.requestId,
      reviewerId: input.reviewerId,
      step: 'employees',
      message: `Creating/updating Odoo employees in ${totalBranches} selected branch(es)...`,
    });

    let processedBranches = 0;
    for (const assignment of assignments) {
      for (const branch of assignment.branches) {
        const branchCode = formatBranchEmployeeCode(branch.odooBranchId, employeeNumber);
        const barcode = `${assignment.companyCode}${branchCode}`;
        const isResident = assignment.companyId === residentAssignment.companyId
          && branch.id === resident.branchId;
        await createOrUpdateEmployeeForRegistration({
          companyId: branch.odooBranchId,
          name: formatEmployeeDisplayName(
            branch.odooBranchId,
            employeeNumber,
            approvedProfile.firstName,
            approvedProfile.lastName,
          ),
          workEmail: normalizedEmail,
          pin: sharedPin,
          barcode,
          websiteKey,
          isResident,
        });
        processedBranches += 1;
        emitRegistrationApprovalProgress({
          companyId: input.reviewerCompanyId,
          verificationId: input.requestId,
          reviewerId: input.reviewerId,
          step: 'employees',
          message: `Processed branch ${processedBranches}/${totalBranches} (${assignment.companyName} - Odoo #${branch.odooBranchId}).`,
        });
      }
    }

    emitRegistrationApprovalProgress({
      companyId: input.reviewerCompanyId,
      verificationId: input.requestId,
      reviewerId: input.reviewerId,
      step: 'employees',
      message: `Ensuring default Odoo employee in company #${DEFAULT_REGISTRATION_COMPANY_ID}...`,
    });
    const defaultCompanyBranchCode = formatBranchEmployeeCode(DEFAULT_REGISTRATION_COMPANY_ID, employeeNumber);
    const defaultCompanyBarcode = `${residentAssignment.companyCode}${defaultCompanyBranchCode}`;
    await createOrUpdateEmployeeForRegistration({
      companyId: DEFAULT_REGISTRATION_COMPANY_ID,
      name: formatEmployeeDisplayName(
        DEFAULT_REGISTRATION_COMPANY_ID,
        employeeNumber,
        approvedProfile.firstName,
        approvedProfile.lastName,
      ),
      workEmail: normalizedEmail,
      pin: sharedPin,
      barcode: defaultCompanyBarcode,
      websiteKey,
      isResident: DEFAULT_REGISTRATION_COMPANY_ID === residentBranch.odooBranchId,
    });
  }

  emitRegistrationApprovalProgress({
    companyId: input.reviewerCompanyId,
    verificationId: input.requestId,
    reviewerId: input.reviewerId,
    step: 'merge',
    message: 'Merging partner contacts and applying global contact settings...',
  });
  try {
    await unifyPartnerContactsByEmail({
      email: normalizedEmail,
      mainCompanyId: residentBranch.odooBranchId,
      websiteKey,
      employeeNumber,
      firstName: approvedProfile.firstName,
      lastName: approvedProfile.lastName,
      discordId: registrationDiscordUserId,
    });
  } catch (error) {
    logger.warn(
      {
        email: normalizedEmail,
        websiteKey,
        mainCompanyId: residentBranch.odooBranchId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to unify Odoo partner contacts by email during registration approval; continuing',
    );
    emitRegistrationApprovalProgress({
      companyId: input.reviewerCompanyId,
      verificationId: input.requestId,
      reviewerId: input.reviewerId,
      step: 'merge',
      message: 'Partner contact merge was skipped due to Odoo-side rule constraints; continuing approval.',
    });
  }

  emitRegistrationApprovalProgress({
    companyId: input.reviewerCompanyId,
    verificationId: input.requestId,
    reviewerId: input.reviewerId,
    step: 'user',
    message: 'Creating/updating global user and assignments...',
  });

  const passwordHash = await hashPassword(decryptedPassword);

  // Calculate average EPI of active users — new registrations start at the company average
  const avgResult = await masterDb('users')
    .where({ is_active: true, employment_status: 'active' })
    .avg('epi_score as avg')
    .first();
  const avgEpi = Math.round(Number(avgResult?.avg ?? 100) * 100) / 100;

  const result = await masterDb.transaction(async (trx) => {
    const existingByEmail = (await trx('users')
      .whereRaw('LOWER(email) = ?', [normalizedEmail])
      .first('id', 'email', 'user_key', 'employee_number', 'discord_user_id')) as ApprovalUserRow | null;
    const existingByUserKey = (await trx('users')
      .where({ user_key: websiteKey })
      .first('id', 'email', 'user_key', 'employee_number', 'discord_user_id')) as ApprovalUserRow | null;
    const canonicalDecision = selectApprovalCanonicalUsers({
      existingByEmail,
      existingByUserKey,
    });
    if (registrationDiscordUserId) {
      const existingDiscordUser = await trx('users')
        .where({ discord_user_id: registrationDiscordUserId })
        .first('id');
      if (
        existingDiscordUser
        && (!canonicalDecision.canonicalUserId || existingDiscordUser.id !== canonicalDecision.canonicalUserId)
      ) {
        throw new AppError(409, 'Discord ID is already linked to another user');
      }
    }

    if (canonicalDecision.canonicalUserId && canonicalDecision.duplicateUserId) {
      await mergeRegistrationDuplicateUser({
        trx,
        canonicalUserId: canonicalDecision.canonicalUserId,
        duplicateUserId: canonicalDecision.duplicateUserId,
        canonicalEmail: normalizedEmail,
      });
    }

    let userId: string;
    if (canonicalDecision.canonicalUserId) {
      const updatePayload: Record<string, unknown> = {
        first_name: approvedProfile.firstName,
        last_name: approvedProfile.lastName,
        email: normalizedEmail,
        mobile_number: approvedProfile.mobileNumber,
        password_hash: passwordHash,
        employee_number: employeeNumber,
        user_key: websiteKey,
        is_active: true,
        employment_status: 'active',
        updated: true,
        updated_at: new Date(),
      };
      if (requestedAvatarUrl) {
        updatePayload.avatar_url = requestedAvatarUrl;
      }
      if (registrationDiscordUserId) {
        updatePayload.discord_user_id = registrationDiscordUserId;
      }
      const [updated] = await trx('users')
        .where({ id: canonicalDecision.canonicalUserId })
        .update(updatePayload)
        .returning('id');
      userId = updated.id as string;
    } else {
      const createPayload: Record<string, unknown> = {
        first_name: approvedProfile.firstName,
        last_name: approvedProfile.lastName,
        email: normalizedEmail,
        mobile_number: approvedProfile.mobileNumber,
        password_hash: passwordHash,
        employee_number: employeeNumber,
        user_key: websiteKey,
        epi_score: avgEpi,
        is_active: true,
        employment_status: 'active',
        updated: true,
      };
      if (requestedAvatarUrl) {
        createPayload.avatar_url = requestedAvatarUrl;
      }
      if (registrationDiscordUserId) {
        createPayload.discord_user_id = registrationDiscordUserId;
      }
      const [created] = await trx('users')
        .insert(createPayload)
        .returning('id');
      userId = created.id as string;
    }

    await trx('user_sensitive_info')
      .insert({
        user_id: userId,
        legal_name: buildLegalNameFromRegistration(approvedProfile),
        birthday: approvedProfile.birthday || null,
        gender: approvedProfile.gender || null,
        address: approvedProfile.address,
        marital_status: approvedProfile.maritalStatus,
        sss_number: approvedProfile.sssNumber ?? null,
        tin_number: approvedProfile.tinNumber ?? null,
        pagibig_number: approvedProfile.pagibigNumber ?? null,
        philhealth_number: approvedProfile.philhealthNumber ?? null,
        valid_id_url: approvedProfile.validIdUrl,
        valid_id_updated_at: approvedProfile.validIdUrl ? new Date() : null,
        emergency_contact: approvedProfile.emergencyContact ?? null,
        emergency_phone: approvedProfile.emergencyPhone ?? null,
        emergency_relationship: approvedProfile.emergencyRelationship ?? null,
        updated_at: new Date(),
      })
      .onConflict('user_id')
      .merge({
        legal_name: buildLegalNameFromRegistration(approvedProfile),
        birthday: approvedProfile.birthday || null,
        gender: approvedProfile.gender || null,
        address: approvedProfile.address,
        marital_status: approvedProfile.maritalStatus,
        sss_number: approvedProfile.sssNumber ?? null,
        tin_number: approvedProfile.tinNumber ?? null,
        pagibig_number: approvedProfile.pagibigNumber ?? null,
        philhealth_number: approvedProfile.philhealthNumber ?? null,
        valid_id_url: approvedProfile.validIdUrl,
        valid_id_updated_at: approvedProfile.validIdUrl ? new Date() : null,
        emergency_contact: approvedProfile.emergencyContact ?? null,
        emergency_phone: approvedProfile.emergencyPhone ?? null,
        emergency_relationship: approvedProfile.emergencyRelationship ?? null,
        updated_at: new Date(),
      });

    await trx('user_roles').where({ user_id: userId }).delete();
    if (input.roleIds.length > 0) {
      await trx('user_roles').insert(
        input.roleIds.map((roleId) => ({
          user_id: userId,
          role_id: roleId,
          assigned_by: input.reviewerId,
        })),
      );
    }

    await trx('user_company_access').where({ user_id: userId }).delete();
    await trx('user_company_access').insert(
      assignments.map((assignment) => ({
        user_id: userId,
        company_id: assignment.companyId,
        is_active: true,
        updated_at: new Date(),
      })),
    );

    await trx('user_company_branches').where({ user_id: userId }).delete();
    const branchRows: Array<{
      user_id: string;
      company_id: string;
      branch_id: string;
      assignment_type: 'resident' | 'borrow';
    }> = [];
    for (const assignment of assignments) {
      for (const branch of assignment.branches) {
        const isResident = assignment.companyId === resident.companyId && branch.id === resident.branchId;
        branchRows.push({
          user_id: userId,
          company_id: assignment.companyId,
          branch_id: branch.id,
          assignment_type: isResident ? 'resident' : 'borrow',
        });
      }
    }
    if (branchRows.length > 0) {
      await trx('user_company_branches').insert(branchRows);
    }

    const [updatedRequest] = await trx('registration_requests')
      .where({ id: input.requestId, status: REGISTRATION_STATUSES.PENDING })
      .update({
        status: REGISTRATION_STATUSES.APPROVED,
        reviewed_by: input.reviewerId,
        reviewed_at: new Date(),
        approved_role_ids: JSON.stringify(input.roleIds),
        approved_profile: JSON.stringify(approvedProfile),
        approved_user_id: userId,
        resident_company_id: resident.companyId,
        resident_branch_id: resident.branchId,
        resident_branch_name: resident.branchName,
        updated_at: new Date(),
      })
      .returning('*');
    if (!updatedRequest) {
      throw new AppError(409, 'Registration request was already updated by another process');
    }

    await trx('registration_request_company_assignments')
      .where({ registration_request_id: input.requestId })
      .delete();

    for (const assignment of assignments) {
      const [snapshotCompany] = await trx('registration_request_company_assignments')
        .insert({
          registration_request_id: input.requestId,
          company_id: assignment.companyId,
          company_name: assignment.companyName,
        })
        .returning('id');

      if (assignment.branches.length > 0) {
        await trx('registration_request_assignment_branches').insert(
          assignment.branches.map((branch) => ({
            registration_request_company_assignment_id: snapshotCompany.id,
            branch_id: branch.id,
            branch_name: branch.name,
            branch_odoo_id: String(branch.odooBranchId),
          })),
        );
      }
    }

    return {
      requestId: updatedRequest.id as string,
      userId,
      firstCompanySlug: assignments[0]?.companySlug ?? null,
    };
  });

  emitRegistrationApprovalProgress({
    companyId: input.reviewerCompanyId,
    verificationId: input.requestId,
    reviewerId: input.reviewerId,
    step: 'email',
    message: 'Sending registration approved email...',
  });
  await sendRegistrationApprovedEmail({
    to: normalizedEmail,
    fullName,
    email: normalizedEmail,
    password: decryptedPassword,
    companySlug: result.firstCompanySlug ?? undefined,
  });

  try {
    await syncUserProfileToOdoo(websiteKey, {
      email: normalizedEmail,
      mobileNumber: approvedProfile.mobileNumber,
      legalName: buildLegalNameFromRegistration(approvedProfile),
      birthday: approvedProfile.birthday || null,
      gender: approvedProfile.gender || null,
      maritalStatus: approvedProfile.maritalStatus,
      address: approvedProfile.address,
      emergencyContact: approvedProfile.emergencyContact ?? '',
      emergencyPhone: approvedProfile.emergencyPhone ?? '',
      firstName: approvedProfile.firstName,
      lastName: approvedProfile.lastName,
      employeeNumber,
      mainCompanyId: residentBranch.odooBranchId,
    });
  } catch (error) {
    logger.warn(
      {
        requestId: input.requestId,
        userId: result.userId,
        websiteKey,
        email: normalizedEmail,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to sync approved registration profile details to Odoo; continuing approval',
    );
  }

  if (requestedAvatarUrl) {
    try {
      await syncAvatarToOdoo({
        websiteUserKey: websiteKey,
        email: normalizedEmail,
        avatarUrl: requestedAvatarUrl,
      });
    } catch (error) {
      logger.warn(
        {
          requestId: input.requestId,
          userId: result.userId,
          websiteKey,
          email: normalizedEmail,
          avatarUrl: requestedAvatarUrl,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to sync uploaded registration avatar to Odoo; continuing approval',
      );
    }
  } else if (requestedUserKey) {
    try {
      const importedAvatarUrl = await importFirstOdooEmployeeAvatarToWebsite({
        websiteKey: requestedUserKey,
        userId: result.userId,
        avatarStorageRoot: input.avatarStorageRoot,
      });

      if (importedAvatarUrl) {
        await masterDb('users')
          .where({ id: result.userId })
          .update({
            avatar_url: importedAvatarUrl,
            updated_at: new Date(),
          });
      }
    } catch (error) {
      logger.warn(
        {
          requestId: input.requestId,
          userId: result.userId,
          websiteKey: requestedUserKey,
          email: normalizedEmail,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to import Odoo employee avatar for user-key registration; continuing approval',
      );
    }
  }

  emitRegistrationApprovalProgress({
    companyId: input.reviewerCompanyId,
    verificationId: input.requestId,
    reviewerId: input.reviewerId,
    step: 'done',
    message: 'Approval completed successfully.',
  });

  await emitRegistrationVerificationUpdateGlobal({
    verificationId: result.requestId,
    action: 'approved',
    userId: result.userId,
  });

  return {
    requestId: result.requestId,
    userId: result.userId,
  };
}

export async function rejectRegistrationRequest(input: {
  reviewerId: string;
  requestId: string;
  reason: string;
}): Promise<void> {
  const masterDb = db.getDb();
  const [updated] = await masterDb('registration_requests')
    .where({ id: input.requestId, status: REGISTRATION_STATUSES.PENDING })
    .update({
      status: REGISTRATION_STATUSES.REJECTED,
      rejection_reason: input.reason.trim(),
      reviewed_by: input.reviewerId,
      reviewed_at: new Date(),
      updated_at: new Date(),
    })
    .returning('id');

  if (!updated) {
    throw new AppError(404, 'Pending registration request not found');
  }

  await emitRegistrationVerificationUpdateGlobal({
    verificationId: input.requestId,
    action: 'rejected',
  });
}
