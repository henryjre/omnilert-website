import type { Knex } from 'knex';
import type { CssCriteriaScores, StoreAudit, StoreAuditStatus, StoreAuditType } from '@omnilert/shared';
import { db } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { hydrateUsersByIds } from './globalUser.service.js';
import { getCompanyStorageRoot } from './storage.service.js';
import { logger } from '../utils/logger.js';

export type GlobalStoreAuditProjectionRow = {
  company_id: string;
  company_name: string;
  company_slug: string;
  company_db_name: string;
  audit_id: string;
  type: StoreAuditType;
  status: StoreAuditStatus;
  branch_id: string;
  branch_name: string | null;
  auditor_user_id: string | null;
  auditor_name: string | null;
  monetary_reward: string;
  completed_at: string | Date | null;
  processing_started_at: string | Date | null;
  vn_requested: boolean;
  linked_vn_id: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  css_odoo_order_id: number | null;
  css_pos_reference: string | null;
  css_session_name: string | null;
  css_company_name: string | null;
  css_cashier_name: string | null;
  css_cashier_user_key: string | null;
  css_date_order: string | Date | null;
  css_amount_total: string | null;
  css_order_lines: unknown;
  css_payments: unknown;
  css_star_rating: number | null;
  css_criteria_scores: CssCriteriaScores | string | null;
  css_audit_log: string | null;
  css_ai_report: string | null;
  comp_odoo_employee_id: number | null;
  comp_employee_name: string | null;
  comp_employee_avatar: string | null;
  comp_check_in_time: string | Date | null;
  comp_extra_fields: Record<string, unknown> | string | null;
  comp_productivity_rate: boolean | null;
  comp_uniform: boolean | null;
  comp_hygiene: boolean | null;
  comp_sop: boolean | null;
  comp_ai_report: string | null;
};

type ActiveCompanyRow = {
  id: string;
  name: string;
  slug: string;
  dbName: string;
};

type TenantAuditSnapshotRow = {
  id: string;
  type: StoreAuditType;
  status: StoreAuditStatus;
  branch_id: string;
  branch_name?: string | null;
  auditor_user_id: string | null;
  monetary_reward: string;
  completed_at: string | Date | null;
  processing_started_at: string | Date | null;
  vn_requested: boolean;
  created_at: string | Date;
  updated_at: string | Date;
  css_odoo_order_id: number | null;
  css_pos_reference: string | null;
  css_session_name: string | null;
  css_company_name: string | null;
  css_cashier_name: string | null;
  css_cashier_user_key: string | null;
  css_date_order: string | Date | null;
  css_amount_total: string | null;
  css_order_lines: unknown;
  css_payments: unknown;
  css_star_rating: number | null;
  css_criteria_scores: CssCriteriaScores | string | null;
  css_audit_log: string | null;
  css_ai_report: string | null;
  comp_odoo_employee_id: number | null;
  comp_employee_name: string | null;
  comp_employee_avatar: string | null;
  comp_check_in_time: string | Date | null;
  comp_extra_fields: Record<string, unknown> | string | null;
  comp_productivity_rate: boolean | null;
  comp_uniform: boolean | null;
  comp_hygiene: boolean | null;
  comp_sop: boolean | null;
  comp_ai_report: string | null;
  linked_vn_id?: string | null;
  auditor_name?: string | null;
};

export type ResolvedGlobalStoreAuditContext = {
  projection: GlobalStoreAuditProjectionRow;
  company: {
    id: string;
    name: string;
    slug: string;
    dbName: string;
  };
  companyStorageRoot: string;
  tenantDb: Knex;
};

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function toIsoString(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  return null;
}

function normalizeProjectionRow(row: Record<string, unknown>): GlobalStoreAuditProjectionRow {
  return {
    company_id: String(row.company_id ?? ''),
    company_name: String(row.company_name ?? ''),
    company_slug: String(row.company_slug ?? ''),
    company_db_name: String(row.company_db_name ?? ''),
    audit_id: String(row.audit_id ?? row.id ?? ''),
    type: String(row.type ?? 'customer_service') as StoreAuditType,
    status: String(row.status ?? 'pending') as StoreAuditStatus,
    branch_id: String(row.branch_id ?? ''),
    branch_name: row.branch_name ? String(row.branch_name) : null,
    auditor_user_id: row.auditor_user_id ? String(row.auditor_user_id) : null,
    auditor_name: row.auditor_name ? String(row.auditor_name) : null,
    monetary_reward: String(row.monetary_reward ?? '0'),
    completed_at: (row.completed_at as string | Date | null | undefined) ?? null,
    processing_started_at: (row.processing_started_at as string | Date | null | undefined) ?? null,
    vn_requested: Boolean(row.vn_requested),
    linked_vn_id: row.linked_vn_id ? String(row.linked_vn_id) : null,
    created_at: (row.created_at as string | Date | undefined) ?? new Date().toISOString(),
    updated_at: (row.updated_at as string | Date | undefined) ?? new Date().toISOString(),
    css_odoo_order_id: row.css_odoo_order_id == null ? null : Number(row.css_odoo_order_id),
    css_pos_reference: row.css_pos_reference ? String(row.css_pos_reference) : null,
    css_session_name: row.css_session_name ? String(row.css_session_name) : null,
    css_company_name: row.css_company_name ? String(row.css_company_name) : null,
    css_cashier_name: row.css_cashier_name ? String(row.css_cashier_name) : null,
    css_cashier_user_key: row.css_cashier_user_key ? String(row.css_cashier_user_key) : null,
    css_date_order: (row.css_date_order as string | Date | null | undefined) ?? null,
    css_amount_total: row.css_amount_total ? String(row.css_amount_total) : null,
    css_order_lines: parseJsonField(row.css_order_lines, null),
    css_payments: parseJsonField(row.css_payments, null),
    css_star_rating: row.css_star_rating == null ? null : Number(row.css_star_rating),
    css_criteria_scores: parseJsonField(row.css_criteria_scores, null),
    css_audit_log: row.css_audit_log ? String(row.css_audit_log) : null,
    css_ai_report: row.css_ai_report ? String(row.css_ai_report) : null,
    comp_odoo_employee_id: row.comp_odoo_employee_id == null ? null : Number(row.comp_odoo_employee_id),
    comp_employee_name: row.comp_employee_name ? String(row.comp_employee_name) : null,
    comp_employee_avatar: row.comp_employee_avatar ? String(row.comp_employee_avatar) : null,
    comp_check_in_time: (row.comp_check_in_time as string | Date | null | undefined) ?? null,
    comp_extra_fields: parseJsonField(row.comp_extra_fields, null),
    comp_productivity_rate: row.comp_productivity_rate == null ? null : Boolean(row.comp_productivity_rate),
    comp_uniform: row.comp_uniform == null ? null : Boolean(row.comp_uniform),
    comp_hygiene: row.comp_hygiene == null ? null : Boolean(row.comp_hygiene),
    comp_sop: row.comp_sop == null ? null : Boolean(row.comp_sop),
    comp_ai_report: row.comp_ai_report ? String(row.comp_ai_report) : null,
  };
}

export function mapProjectionRowToStoreAudit(row: Record<string, unknown>): StoreAudit {
  const normalized = normalizeProjectionRow(row);
  return {
    id: normalized.audit_id,
    type: normalized.type,
    status: normalized.status,
    company: {
      id: normalized.company_id,
      name: normalized.company_name,
      slug: normalized.company_slug,
    },
    branch_id: normalized.branch_id,
    branch_name: normalized.branch_name,
    auditor_user_id: normalized.auditor_user_id,
    auditor_name: normalized.auditor_name,
    monetary_reward: normalized.monetary_reward,
    completed_at: toIsoString(normalized.completed_at),
    processing_started_at: toIsoString(normalized.processing_started_at),
    vn_requested: normalized.vn_requested,
    linked_vn_id: normalized.linked_vn_id,
    created_at: String(toIsoString(normalized.created_at) ?? ''),
    updated_at: String(toIsoString(normalized.updated_at) ?? ''),
    css_odoo_order_id: normalized.css_odoo_order_id,
    css_pos_reference: normalized.css_pos_reference,
    css_session_name: normalized.css_session_name,
    css_company_name: normalized.css_company_name,
    css_cashier_name: normalized.css_cashier_name,
    css_cashier_user_key: normalized.css_cashier_user_key,
    css_date_order: toIsoString(normalized.css_date_order),
    css_amount_total: normalized.css_amount_total,
    css_order_lines: parseJsonField(normalized.css_order_lines, null),
    css_payments: parseJsonField(normalized.css_payments, null),
    css_star_rating: normalized.css_star_rating,
    css_criteria_scores: parseJsonField(normalized.css_criteria_scores, null),
    css_audit_log: normalized.css_audit_log,
    css_ai_report: normalized.css_ai_report,
    comp_odoo_employee_id: normalized.comp_odoo_employee_id,
    comp_employee_name: normalized.comp_employee_name,
    comp_employee_avatar: normalized.comp_employee_avatar,
    comp_check_in_time: toIsoString(normalized.comp_check_in_time),
    comp_extra_fields: parseJsonField(normalized.comp_extra_fields, null),
    comp_productivity_rate: normalized.comp_productivity_rate,
    comp_uniform: normalized.comp_uniform,
    comp_hygiene: normalized.comp_hygiene,
    comp_sop: normalized.comp_sop,
    comp_ai_report: normalized.comp_ai_report,
  };
}

async function listActiveCompanies(): Promise<ActiveCompanyRow[]> {
  const rows = await db.getMasterDb()('companies')
    .where({ is_active: true })
    .select('id', 'name', 'slug', 'db_name')
    .orderBy('created_at', 'asc');

  return rows.map((row: any) => ({
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    dbName: String(row.db_name),
  }));
}

async function listTenantAuditSnapshots(tenantDb: Knex, auditId?: string): Promise<TenantAuditSnapshotRow[]> {
  const query = tenantDb('store_audits as audits')
    .leftJoin('branches', 'audits.branch_id', 'branches.id')
    .select(
      'audits.id',
      'audits.type',
      'audits.status',
      'audits.branch_id',
      'branches.name as branch_name',
      'audits.auditor_user_id',
      'audits.monetary_reward',
      'audits.completed_at',
      'audits.processing_started_at',
      'audits.vn_requested',
      'audits.created_at',
      'audits.updated_at',
      'audits.css_odoo_order_id',
      'audits.css_pos_reference',
      'audits.css_session_name',
      'audits.css_company_name',
      'audits.css_cashier_name',
      'audits.css_cashier_user_key',
      'audits.css_date_order',
      'audits.css_amount_total',
      'audits.css_order_lines',
      'audits.css_payments',
      'audits.css_star_rating',
      'audits.css_criteria_scores',
      'audits.css_audit_log',
      'audits.css_ai_report',
      'audits.comp_odoo_employee_id',
      'audits.comp_employee_name',
      'audits.comp_employee_avatar',
      'audits.comp_check_in_time',
      'audits.comp_extra_fields',
      'audits.comp_productivity_rate',
      'audits.comp_uniform',
      'audits.comp_hygiene',
      'audits.comp_sop',
      'audits.comp_ai_report',
    );

  if (auditId) {
    query.where('audits.id', auditId);
  }

  const rows = await query;
  if (rows.length === 0) return [];

  const auditIds = rows.map((row: any) => String(row.id));
  const auditorIds = Array.from(new Set(
    rows.map((row: any) => row.auditor_user_id).filter(Boolean).map((id: any) => String(id)),
  ));

  const [vnRows, auditorMap] = await Promise.all([
    tenantDb('violation_notices')
      .whereIn('source_store_audit_id', auditIds)
      .select('id', 'source_store_audit_id'),
    hydrateUsersByIds(auditorIds, ['id', 'first_name', 'last_name']),
  ]);

  const vnByAudit = new Map<string, string>();
  for (const row of vnRows as any[]) {
    const sourceAuditId = String(row.source_store_audit_id ?? '').trim();
    const vnId = String(row.id ?? '').trim();
    if (sourceAuditId && vnId && !vnByAudit.has(sourceAuditId)) {
      vnByAudit.set(sourceAuditId, vnId);
    }
  }

  return rows.map((row: any) => {
    const auditor = row.auditor_user_id ? auditorMap[String(row.auditor_user_id)] : undefined;
    const auditorName = auditor
      ? `${String(auditor.first_name ?? '').trim()} ${String(auditor.last_name ?? '').trim()}`.trim()
      : null;
    return {
      ...row,
      branch_name: row.branch_name ? String(row.branch_name) : null,
      auditor_name: auditorName || null,
      linked_vn_id: vnByAudit.get(String(row.id)) ?? null,
    } as TenantAuditSnapshotRow;
  });
}

function buildProjectionRow(company: ActiveCompanyRow, row: TenantAuditSnapshotRow): Record<string, unknown> {
  return {
    company_id: company.id,
    company_name: company.name,
    company_slug: company.slug,
    company_db_name: company.dbName,
    audit_id: row.id,
    type: row.type,
    status: row.status,
    branch_id: row.branch_id,
    branch_name: row.branch_name ?? null,
    auditor_user_id: row.auditor_user_id,
    auditor_name: row.auditor_name ?? null,
    monetary_reward: row.monetary_reward,
    completed_at: row.completed_at,
    processing_started_at: row.processing_started_at,
    vn_requested: row.vn_requested,
    linked_vn_id: row.linked_vn_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    css_odoo_order_id: row.css_odoo_order_id,
    css_pos_reference: row.css_pos_reference,
    css_session_name: row.css_session_name,
    css_company_name: row.css_company_name,
    css_cashier_name: row.css_cashier_name,
    css_cashier_user_key: row.css_cashier_user_key,
    css_date_order: row.css_date_order,
    css_amount_total: row.css_amount_total,
    css_order_lines: row.css_order_lines,
    css_payments: row.css_payments,
    css_star_rating: row.css_star_rating,
    css_criteria_scores: row.css_criteria_scores,
    css_audit_log: row.css_audit_log,
    css_ai_report: row.css_ai_report,
    comp_odoo_employee_id: row.comp_odoo_employee_id,
    comp_employee_name: row.comp_employee_name,
    comp_employee_avatar: row.comp_employee_avatar,
    comp_check_in_time: row.comp_check_in_time,
    comp_extra_fields: row.comp_extra_fields,
    comp_productivity_rate: row.comp_productivity_rate,
    comp_uniform: row.comp_uniform,
    comp_hygiene: row.comp_hygiene,
    comp_sop: row.comp_sop,
    comp_ai_report: row.comp_ai_report,
    projection_synced_at: new Date(),
  };
}

async function upsertProjectionRows(masterDb: Knex, rows: Array<Record<string, unknown>>): Promise<void> {
  if (rows.length === 0) return;

  await masterDb('global_store_audits')
    .insert(rows)
    .onConflict(['company_id', 'audit_id'])
    .merge();
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === '23505');
}

export async function listGlobalStoreAuditProjectionRows(input: {
  type?: StoreAuditType | 'all';
  status?: StoreAuditStatus;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: GlobalStoreAuditProjectionRow[]; total: number }> {
  const page = Math.max(1, Number(input.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 20)));
  const masterDb = db.getMasterDb();
  const query = masterDb('global_store_audits');

  if (input.type && input.type !== 'all') query.where({ type: input.type });
  if (input.status) query.where({ status: input.status });

  const sortOrder = (() => {
    if (input.status === 'completed') {
      return [
        { column: 'completed_at', order: 'desc' as const, nulls: 'last' as const },
        { column: 'created_at', order: 'desc' as const },
      ];
    }
    if (input.status === 'processing') {
      return [
        { column: 'updated_at', order: 'desc' as const },
        { column: 'created_at', order: 'desc' as const },
      ];
    }
    return [{ column: 'created_at', order: 'desc' as const }];
  })();

  const [countRow, rows] = await Promise.all([
    query.clone().count<{ count: string }>({ count: '*' }).first(),
    query.clone()
      .orderBy(sortOrder as Array<{ column: string; order: 'asc' | 'desc'; nulls?: 'first' | 'last' }>)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);

  return {
    total: Number(countRow?.count ?? 0),
    rows: (rows as Array<Record<string, unknown>>).map(normalizeProjectionRow),
  };
}

export async function getGlobalStoreAuditProjectionByAuditId(auditId: string): Promise<GlobalStoreAuditProjectionRow | null> {
  const row = await db.getMasterDb()('global_store_audits').where({ audit_id: auditId }).first();
  return row ? normalizeProjectionRow(row as Record<string, unknown>) : null;
}

export async function getGlobalProcessingAuditIdByUser(userId: string): Promise<string | null> {
  const row = await db.getMasterDb()('global_store_audits')
    .where({ status: 'processing', auditor_user_id: userId })
    .first('audit_id');
  return row?.audit_id ? String(row.audit_id) : null;
}

export async function reserveGlobalProcessingAudit(input: {
  companyId: string;
  auditId: string;
  userId: string;
}): Promise<'ok' | 'user_has_active' | 'already_claimed' | 'not_found'> {
  const masterDb = db.getMasterDb();

  try {
    return await masterDb.transaction(async (trx) => {
      const active = await trx('global_store_audits')
        .where({ status: 'processing', auditor_user_id: input.userId })
        .first('audit_id');
      if (active) return 'user_has_active';

      const updated = await trx('global_store_audits')
        .where({
          company_id: input.companyId,
          audit_id: input.auditId,
          status: 'pending',
        })
        .update({
          status: 'processing',
          auditor_user_id: input.userId,
          processing_started_at: new Date(),
          updated_at: new Date(),
          projection_synced_at: new Date(),
        });

      if (updated > 0) return 'ok';

      const existing = await trx('global_store_audits')
        .where({ company_id: input.companyId, audit_id: input.auditId })
        .first('status');
      return existing ? 'already_claimed' : 'not_found';
    });
  } catch (error) {
    if (isUniqueViolation(error)) return 'user_has_active';
    throw error;
  }
}

export async function resolveGlobalStoreAuditContext(
  auditId: string,
): Promise<ResolvedGlobalStoreAuditContext | null> {
  const projection = await getGlobalStoreAuditProjectionByAuditId(auditId);
  if (!projection) return null;

  return {
    projection,
    company: {
      id: projection.company_id,
      name: projection.company_name,
      slug: projection.company_slug,
      dbName: projection.company_db_name,
    },
    companyStorageRoot: getCompanyStorageRoot(projection.company_slug),
    tenantDb: await db.getTenantDb(projection.company_db_name),
  };
}

export async function syncGlobalStoreAuditProjectionByAuditId(input: {
  companyId: string;
  auditId: string;
}): Promise<GlobalStoreAuditProjectionRow | null> {
  const company = (await listActiveCompanies()).find((row) => row.id === input.companyId);
  if (!company) return null;

  const tenantDb = await db.getTenantDb(company.dbName);
  const [snapshot] = await listTenantAuditSnapshots(tenantDb, input.auditId);
  const masterDb = db.getMasterDb();

  if (!snapshot) {
    await masterDb('global_store_audits')
      .where({ company_id: company.id, audit_id: input.auditId })
      .delete();
    return null;
  }

  await upsertProjectionRows(masterDb, [buildProjectionRow(company, snapshot)]);
  return getGlobalStoreAuditProjectionByAuditId(input.auditId);
}

export async function backfillGlobalStoreAuditProjection(input?: { onlyIfEmpty?: boolean }): Promise<void> {
  const masterDb = db.getMasterDb();
  if (input?.onlyIfEmpty) {
    const count = await masterDb('global_store_audits').count<{ count: string }>({ count: '*' }).first();
    if (Number(count?.count ?? 0) > 0) return;
  }

  const companies = await listActiveCompanies();
  for (const company of companies) {
    try {
      const tenantDb = await db.getTenantDb(company.dbName);
      const rows = await listTenantAuditSnapshots(tenantDb);
      await upsertProjectionRows(masterDb, rows.map((row) => buildProjectionRow(company, row)));
    } catch (error) {
      logger.warn(
        {
          err: error,
          companyId: company.id,
          companyDbName: company.dbName,
        },
        'Failed to backfill global store audit projection for tenant',
      );
    }
  }
}

export async function assertGlobalStoreAuditExists(auditId: string): Promise<ResolvedGlobalStoreAuditContext> {
  const context = await resolveGlobalStoreAuditContext(auditId);
  if (!context) throw new AppError(404, 'Store audit not found');
  return context;
}
