import { db } from '../config/database.js';

export type GlobalRole = {
  id: string;
  name: string;
  color: string | null;
  priority: number;
};

export type GlobalUser = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  password_hash: string;
  employee_number: number | null;
  avatar_url: string | null;
  is_active: boolean;
  updated: boolean;
};

export type UserWorkBranchRef = {
  company_id: string;
  company_name: string;
  branch_id: string;
  branch_name: string;
};

export type UserWorkScope = {
  company: { id: string; name: string } | null;
  resident_branch: UserWorkBranchRef | null;
  home_resident_branch: UserWorkBranchRef | null;
  borrow_branches: UserWorkBranchRef[];
};

export function filterDisabledRoles(
  roles: GlobalRole[],
  disabledRoleIds: Set<string>,
): GlobalRole[] {
  if (disabledRoleIds.size === 0) return roles;
  return roles.filter((role) => !disabledRoleIds.has(role.id));
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function getGlobalUserByEmail(email: string): Promise<GlobalUser | null> {
  const row = await db.getDb()('users')
    .whereRaw('LOWER(email) = ?', [normalizeEmail(email)])
    .first();
  return (row as GlobalUser | undefined) ?? null;
}

export async function getGlobalUserById(userId: string): Promise<GlobalUser | null> {
  const row = await db.getDb()('users').where({ id: userId }).first();
  return (row as GlobalUser | undefined) ?? null;
}

export async function loadGlobalUserRolesAndPermissions(userId: string): Promise<{
  roles: GlobalRole[];
  permissions: string[];
}> {
  const [roles, disabledRows] = await Promise.all([
    db.getDb()('user_roles')
      .join('roles', 'user_roles.role_id', 'roles.id')
      .where('user_roles.user_id', userId)
      .select('roles.id', 'roles.name', 'roles.color', 'roles.priority')
      .orderBy('roles.priority', 'desc') as Promise<GlobalRole[]>,
    db.getDb()('user_role_disables')
      .where({ user_id: userId })
      .select('role_id') as Promise<Array<{ role_id: string }>>,
  ]);

  const effectiveRoles = filterDisabledRoles(
    roles,
    new Set(disabledRows.map((row) => String(row.role_id))),
  );

  const roleIds = effectiveRoles.map((role) => role.id);
  if (roleIds.length === 0) {
    return { roles: effectiveRoles, permissions: [] };
  }

  const permissions = await db.getDb()('role_permissions')
    .join('permissions', 'role_permissions.permission_id', 'permissions.id')
    .whereIn('role_permissions.role_id', roleIds)
    .distinct('permissions.key')
    .select('permissions.key');

  return {
    roles: effectiveRoles,
    permissions: permissions.map((row: any) => row.key as string),
  };
}

export async function loadUserCompanyBranchIds(
  userId: string,
  companyId: string,
): Promise<string[]> {
  const rows = await db.getDb()('user_company_branches')
    .where({ user_id: userId, company_id: companyId })
    .select('branch_id');
  return rows.map((row: any) => row.branch_id as string);
}

export async function userHasCompanyAccess(
  userId: string,
  companyId: string,
): Promise<boolean> {
  const row = await db.getDb()('user_company_access')
    .where({ user_id: userId, company_id: companyId, is_active: true })
    .first('id');
  return Boolean(row);
}

export async function listGlobalRoles(): Promise<Array<{
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  is_system: boolean;
  priority: number;
  created_at: Date;
  updated_at: Date;
}>> {
  return db.getDb()('roles').orderBy('priority', 'desc').orderBy('name', 'asc');
}

export async function listGlobalPermissions(): Promise<any[]> {
  return db.getDb()('permissions').orderBy('category').orderBy('key');
}

export async function hydrateUsersByIds(
  userIds: string[],
  fields: Array<keyof GlobalUser> = ['id', 'first_name', 'last_name', 'email', 'avatar_url'],
): Promise<Record<string, Partial<GlobalUser>>> {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) return {};
  const rows = await db.getDb()('users').whereIn('id', uniqueIds).select(fields as string[]);
  const map: Record<string, Partial<GlobalUser>> = {};
  for (const row of rows as any[]) {
    map[row.id] = row;
  }
  return map;
}

export async function loadUserWorkScope(
  userId: string,
  currentCompanyId: string,
): Promise<UserWorkScope> {
  const company = await db.getDb()('companies')
    .where({ id: currentCompanyId })
    .first('id', 'name');

  const currentCompanyBranches = await db.getDb()('user_company_branches as ucb')
    .join('companies as companies', 'ucb.company_id', 'companies.id')
    .join('branches as branches', 'ucb.branch_id', 'branches.id')
    .where('ucb.user_id', userId)
    .andWhere('ucb.company_id', currentCompanyId)
    .select(
      'ucb.company_id',
      'companies.name as company_name',
      'ucb.branch_id',
      'branches.name as branch_name',
      'ucb.assignment_type',
    );

  const homeResident = await db.getDb()('user_company_branches as ucb')
    .join('companies as companies', 'ucb.company_id', 'companies.id')
    .join('branches as branches', 'ucb.branch_id', 'branches.id')
    .where('ucb.user_id', userId)
    .andWhere('ucb.assignment_type', 'resident')
    .orderBy('ucb.created_at', 'asc')
    .first(
      'ucb.company_id',
      'companies.name as company_name',
      'ucb.branch_id',
      'branches.name as branch_name',
    );

  const residentInCurrentCompany = currentCompanyBranches.find(
    (row: any) => row.assignment_type === 'resident',
  );
  const borrowBranches = currentCompanyBranches
    .filter((row: any) => row.assignment_type === 'borrow')
    .map((row: any) => ({
      company_id: row.company_id as string,
      company_name: row.company_name as string,
      branch_id: row.branch_id as string,
      branch_name: row.branch_name as string,
    }));

  return {
    company: company
      ? {
        id: company.id as string,
        name: company.name as string,
      }
      : null,
    resident_branch: residentInCurrentCompany
      ? {
        company_id: residentInCurrentCompany.company_id as string,
        company_name: residentInCurrentCompany.company_name as string,
        branch_id: residentInCurrentCompany.branch_id as string,
        branch_name: residentInCurrentCompany.branch_name as string,
      }
      : null,
    home_resident_branch: homeResident
      ? {
        company_id: homeResident.company_id as string,
        company_name: homeResident.company_name as string,
        branch_id: homeResident.branch_id as string,
        branch_name: homeResident.branch_name as string,
      }
      : null,
    borrow_branches: borrowBranches,
  };
}
export async function resolveCompanyUsersWithPermission(
  companyId: string,
  permissionKey: string,
): Promise<Array<{ id: string; name: string; avatar_url: string | null }>> {
  const users = await db
    .getDb()('user_company_access as uca')
    .join('users as u', 'uca.user_id', 'u.id')
    .join('user_roles as ur', 'u.id', 'ur.user_id')
    .join('role_permissions as rp', 'ur.role_id', 'rp.role_id')
    .join('permissions as p', 'rp.permission_id', 'p.id')
    .where('uca.company_id', companyId)
    .andWhere('uca.is_active', true)
    .andWhere('u.is_active', true)
    .andWhere('p.key', permissionKey)
    .select('u.id', 'u.first_name', 'u.last_name', 'u.avatar_url')
    .distinct();

  // Super admins implicitly have all permissions
  const superAdmins = await db.getDb()('super_admins').select('email');
  const superAdminUsers = (await db
    .getDb()('users')
    .whereIn(
      'email',
      superAdmins.map((s) => s.email),
    )
    .andWhere('is_active', true)
    .select('id', 'first_name', 'last_name', 'avatar_url')) as any[];

  const allMap = new Map<string, { id: string; name: string; avatar_url: string | null }>();
  [...users, ...superAdminUsers].forEach((u) => {
    allMap.set(String(u.id), {
      id: String(u.id),
      name: `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || 'Unknown User',
      avatar_url: (u.avatar_url as string | null) ?? null,
    });
  });

  return Array.from(allMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function resolveRolesWithPermission(
  permissionKey: string,
): Promise<Array<{ id: string; name: string; color: string | null }>> {
  return await db
    .getDb()('roles as r')
    .join('role_permissions as rp', 'r.id', 'rp.role_id')
    .join('permissions as p', 'rp.permission_id', 'p.id')
    .where('p.key', permissionKey)
    .select('r.id', 'r.name', 'r.color')
    .orderBy('r.priority', 'desc')
    .orderBy('r.name', 'asc');
}
