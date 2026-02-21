import type { Knex } from 'knex';
import { AppError } from '../middleware/errorHandler.js';

function displayStatusFromSubmission(status: string | null): 'complete' | 'rejected' | 'verification' | 'pending' {
  if (!status) return 'pending';
  if (status === 'approved') return 'complete';
  if (status === 'rejected') return 'rejected';
  if (status === 'pending') return 'verification';
  return 'pending';
}

export async function listServiceCrewRequirements(tenantDb: Knex) {
  const employees = await tenantDb('users')
    .join('user_roles', 'users.id', 'user_roles.user_id')
    .join('roles', 'user_roles.role_id', 'roles.id')
    .where('roles.name', 'Service Crew')
    .where('users.is_active', true)
    .distinct('users.id', 'users.first_name', 'users.last_name', 'users.email', 'users.avatar_url');

  const requirementTypes = await tenantDb('employment_requirement_types')
    .where({ is_active: true })
    .select('code')
    .orderBy('sort_order', 'asc');
  const requirementCount = requirementTypes.length;

  if (employees.length === 0) {
    return [];
  }

  const userIds = employees.map((employee: any) => employee.id);
  const latestRowsResult = await tenantDb.raw(
    `
      SELECT DISTINCT ON (user_id, requirement_code)
        user_id,
        requirement_code,
        status
      FROM employment_requirement_submissions
      WHERE user_id = ANY(?)
      ORDER BY user_id, requirement_code, created_at DESC
    `,
    [userIds],
  );
  const latestRows = latestRowsResult.rows as Array<{
    user_id: string;
    requirement_code: string;
    status: string;
  }>;

  const perUser = new Map<string, Array<{ requirement_code: string; status: string }>>();
  for (const row of latestRows) {
    if (!perUser.has(row.user_id)) {
      perUser.set(row.user_id, []);
    }
    perUser.get(row.user_id)!.push({
      requirement_code: row.requirement_code,
      status: row.status,
    });
  }

  return employees.map((employee: any) => {
    const rows = perUser.get(employee.id) ?? [];
    const summary = {
      total: requirementCount,
      complete: rows.filter((item) => item.status === 'approved').length,
      rejected: rows.filter((item) => item.status === 'rejected').length,
      verification: rows.filter((item) => item.status === 'pending').length,
      pending: Math.max(requirementCount - rows.length, 0),
    };

    return {
      id: employee.id,
      first_name: employee.first_name,
      last_name: employee.last_name,
      email: employee.email,
      avatar_url: employee.avatar_url ?? null,
      summary,
    };
  });
}

export async function getServiceCrewRequirementDetail(tenantDb: Knex, userId: string) {
  const employee = await tenantDb('users')
    .join('user_roles', 'users.id', 'user_roles.user_id')
    .join('roles', 'user_roles.role_id', 'roles.id')
    .where('users.id', userId)
    .where('roles.name', 'Service Crew')
    .where('users.is_active', true)
    .select(
      'users.id',
      'users.first_name',
      'users.last_name',
      'users.email',
      'users.avatar_url',
      'users.valid_id_url',
    )
    .first();

  if (!employee) {
    throw new AppError(404, 'Service Crew employee not found');
  }

  const requirementTypes = await tenantDb('employment_requirement_types')
    .where({ is_active: true })
    .select('code', 'label', 'sort_order')
    .orderBy('sort_order', 'asc');

  const latestRowsResult = await tenantDb.raw(
    `
      SELECT DISTINCT ON (requirement_code)
        id,
        requirement_code,
        document_url,
        status,
        reviewed_by,
        reviewed_at,
        rejection_reason,
        created_at,
        updated_at
      FROM employment_requirement_submissions
      WHERE user_id = ?
      ORDER BY requirement_code, created_at DESC
    `,
    [userId],
  );

  const latestRows = latestRowsResult.rows as Array<{
    id: string;
    requirement_code: string;
    document_url: string;
    status: string;
    reviewed_by: string | null;
    reviewed_at: string | null;
    rejection_reason: string | null;
    created_at: string;
    updated_at: string;
  }>;
  const latestByCode = new Map(latestRows.map((row) => [row.requirement_code, row]));

  const requirements = requirementTypes.map((type: any) => {
    const latest = latestByCode.get(type.code) ?? null;
    const documentUrl = latest?.document_url ?? null;
    const fallbackDocumentUrl = type.code === 'government_issued_id'
      ? (documentUrl ?? employee.valid_id_url ?? null)
      : documentUrl;

    return {
      code: type.code,
      label: type.label,
      sort_order: type.sort_order,
      latest_submission: latest,
      display_status: displayStatusFromSubmission(latest?.status ?? null),
      document_url: fallbackDocumentUrl,
    };
  });

  return {
    employee,
    requirements,
  };
}
