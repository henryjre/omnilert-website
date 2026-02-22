import type { Knex } from 'knex';
import { AppError } from '../middleware/errorHandler.js';

type DepartmentMember = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url: string | null;
};

type DepartmentRow = {
  id: string;
  name: string;
  head_user_id: string | null;
  created_at: Date;
  updated_at: Date;
  head_first_name: string | null;
  head_last_name: string | null;
  head_email: string | null;
  head_avatar_url: string | null;
};

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

async function loadDepartmentsBase(tenantDb: Knex, ids?: string[]): Promise<DepartmentRow[]> {
  const query = tenantDb('departments as departments')
    .leftJoin('users as head', 'departments.head_user_id', 'head.id')
    .select(
      'departments.id',
      'departments.name',
      'departments.head_user_id',
      'departments.created_at',
      'departments.updated_at',
      'head.first_name as head_first_name',
      'head.last_name as head_last_name',
      'head.email as head_email',
      'head.avatar_url as head_avatar_url',
    )
    .orderBy('departments.name', 'asc');

  if (ids && ids.length > 0) {
    query.whereIn('departments.id', ids);
  }

  return query as Promise<DepartmentRow[]>;
}

async function loadDepartmentMembers(tenantDb: Knex, departmentIds: string[]): Promise<Map<string, DepartmentMember[]>> {
  const map = new Map<string, DepartmentMember[]>();
  if (departmentIds.length === 0) return map;

  const members = await tenantDb('users')
    .whereIn('department_id', departmentIds)
    .andWhere('is_active', true)
    .select('id', 'first_name', 'last_name', 'email', 'avatar_url', 'department_id')
    .orderBy('first_name', 'asc')
    .orderBy('last_name', 'asc');

  for (const row of members) {
    const departmentId = row.department_id as string | null;
    if (!departmentId) continue;
    const existing = map.get(departmentId) ?? [];
    existing.push({
      id: row.id as string,
      first_name: row.first_name as string,
      last_name: row.last_name as string,
      email: row.email as string,
      avatar_url: (row.avatar_url as string | null) ?? null,
    });
    map.set(departmentId, existing);
  }

  return map;
}

function toDepartmentView(
  row: DepartmentRow,
  members: DepartmentMember[],
) {
  const head = row.head_user_id
    ? {
      id: row.head_user_id,
      first_name: row.head_first_name,
      last_name: row.head_last_name,
      email: row.head_email,
      avatar_url: row.head_avatar_url,
    }
    : null;

  return {
    id: row.id,
    name: row.name,
    head_user_id: row.head_user_id,
    head,
    member_count: members.length,
    members,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listDepartments(tenantDb: Knex) {
  const rows = await loadDepartmentsBase(tenantDb);
  const membersByDepartment = await loadDepartmentMembers(
    tenantDb,
    rows.map((row) => row.id),
  );

  return rows.map((row) => toDepartmentView(row, membersByDepartment.get(row.id) ?? []));
}

export async function listDepartmentMemberOptions(tenantDb: Knex) {
  return tenantDb('users')
    .where({ is_active: true })
    .select('id', 'first_name', 'last_name', 'email', 'avatar_url')
    .orderBy('first_name', 'asc')
    .orderBy('last_name', 'asc');
}

async function loadDepartmentById(tenantDb: Knex, departmentId: string) {
  const rows = await loadDepartmentsBase(tenantDb, [departmentId]);
  if (rows.length === 0) {
    throw new AppError(404, 'Department not found');
  }
  const membersByDepartment = await loadDepartmentMembers(tenantDb, [departmentId]);
  return toDepartmentView(rows[0], membersByDepartment.get(departmentId) ?? []);
}

export async function createDepartment(input: {
  tenantDb: Knex;
  name: string;
  headUserId: string | null;
  memberUserIds: string[];
}) {
  return upsertDepartmentInternal({
    ...input,
    departmentId: null,
  });
}

export async function updateDepartment(input: {
  tenantDb: Knex;
  departmentId: string;
  name: string;
  headUserId: string | null;
  memberUserIds: string[];
}) {
  return upsertDepartmentInternal(input);
}

async function upsertDepartmentInternal(input: {
  tenantDb: Knex;
  departmentId: string | null;
  name: string;
  headUserId: string | null;
  memberUserIds: string[];
}) {
  const normalizedName = input.name.trim();
  if (!normalizedName) {
    throw new AppError(400, 'Department name is required');
  }

  const memberUserIds = uniqueIds(input.memberUserIds);
  if (input.headUserId && !memberUserIds.includes(input.headUserId)) {
    throw new AppError(400, 'Department head must be included in department members');
  }

  if (memberUserIds.length > 0) {
    const validMembers = await input.tenantDb('users')
      .whereIn('id', memberUserIds)
      .andWhere('is_active', true)
      .select('id');
    if (validMembers.length !== memberUserIds.length) {
      throw new AppError(400, 'Department members must be active users');
    }
  }

  const duplicate = await input.tenantDb('departments')
    .whereRaw('LOWER(name) = LOWER(?)', [normalizedName])
    .modify((query) => {
      if (input.departmentId) {
        query.whereNot({ id: input.departmentId });
      }
    })
    .first('id');

  if (duplicate) {
    throw new AppError(409, 'Department name already exists');
  }

  const departmentId = await input.tenantDb.transaction(async (trx) => {
    if (input.departmentId) {
      const [updated] = await trx('departments')
        .where({ id: input.departmentId })
        .update({
          name: normalizedName,
          head_user_id: input.headUserId,
          updated_at: new Date(),
        })
        .returning('id');
      if (!updated) {
        throw new AppError(404, 'Department not found');
      }
    } else {
      const [created] = await trx('departments')
        .insert({
          name: normalizedName,
          head_user_id: input.headUserId,
          updated_at: new Date(),
        })
        .returning('id');
      input.departmentId = created.id as string;
    }

    const targetDepartmentId = input.departmentId as string;
    const existingMembers = await trx('users')
      .where({ department_id: targetDepartmentId })
      .select('id');
    const existingIds = existingMembers.map((row: { id: string }) => row.id);
    const toRemove = existingIds.filter((id) => !memberUserIds.includes(id));

    if (toRemove.length > 0) {
      await trx('users')
        .whereIn('id', toRemove)
        .update({
          department_id: null,
          updated_at: new Date(),
        });
    }

    if (memberUserIds.length > 0) {
      await trx('users')
        .whereIn('id', memberUserIds)
        .update({
          department_id: targetDepartmentId,
          updated_at: new Date(),
        });
    }

    return targetDepartmentId;
  });

  return loadDepartmentById(input.tenantDb, departmentId);
}
