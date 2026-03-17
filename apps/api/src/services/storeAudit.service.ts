import type { Knex } from 'knex';
import type { CssCriteriaScores, StoreAudit, StoreAuditStatus, StoreAuditType } from '@omnilert/shared';
import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { getIO } from '../config/socket.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { getEmployeeWebsiteKeyByEmployeeId } from './odoo.service.js';

type StoreAuditRow = StoreAudit & {
  branch_name?: string | null;
  auditor_name?: string | null;
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

function normalizeRow(row: any): StoreAuditRow {
  return {
    ...row,
    css_order_lines: parseJsonField(row.css_order_lines, null),
    css_payments: parseJsonField(row.css_payments, null),
    css_criteria_scores: parseJsonField(row.css_criteria_scores, null),
    comp_extra_fields: parseJsonField(row.comp_extra_fields, null),
  };
}

async function enrichAuditRows(tenantDb: Knex, rows: any[]): Promise<StoreAuditRow[]> {
  if (rows.length === 0) return [];

  const branchIds = [...new Set(rows.map((row) => row.branch_id).filter(Boolean))] as string[];
  const auditorIds = [...new Set(rows.map((row) => row.auditor_user_id).filter(Boolean))] as string[];
  const auditIds = rows.map((row) => row.id) as string[];

  const [branches, auditors, linkedVns] = await Promise.all([
    branchIds.length > 0
      ? tenantDb('branches').whereIn('id', branchIds).select('id', 'name')
      : Promise.resolve([]),
    auditorIds.length > 0
      ? db.getMasterDb()('users').whereIn('id', auditorIds).select('id', 'first_name', 'last_name')
      : Promise.resolve([]),
    tenantDb('violation_notices')
      .whereIn('source_store_audit_id', auditIds)
      .whereNotNull('source_store_audit_id')
      .select('id', 'source_store_audit_id'),
  ]);

  const branchMap = new Map(branches.map((branch: any) => [branch.id as string, branch.name as string]));
  const auditorMap = new Map(
    auditors.map((auditor: any) => [auditor.id as string, `${auditor.first_name} ${auditor.last_name}`.trim()]),
  );
  const vnMap = new Map(linkedVns.map((vn: any) => [vn.source_store_audit_id as string, vn.id as string]));

  return rows.map((row) => {
    const normalized = normalizeRow(row);
    return {
      ...normalized,
      branch_name: normalized.branch_name ?? branchMap.get(normalized.branch_id) ?? null,
      auditor_name: normalized.auditor_name ?? (
        normalized.auditor_user_id ? auditorMap.get(normalized.auditor_user_id) ?? null : null
      ),
      linked_vn_id: vnMap.get(normalized.id) ?? null,
    };
  });
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  return code === '23505';
}

function emitStoreAuditEvent(
  companyId: string,
  event: 'store-audit:new' | 'store-audit:claimed' | 'store-audit:completed',
  payload: unknown,
): void {
  try {
    getIO().of('/store-audits').to(`company:${companyId}`).emit(event, payload as never);
  } catch {
    logger.warn({ companyId, event }, 'Socket.IO not available for store audit event');
  }
}

async function analyzeCssAudit(auditLog: string, criteriaScores: CssCriteriaScores): Promise<string> {
  const criteriaLabels: Record<keyof CssCriteriaScores, string> = {
    greeting: 'Greeting & First Impression',
    order_accuracy: 'Order Accuracy & Confirmation',
    suggestive_selling: 'Suggestive Selling / Revenue Initiative',
    service_efficiency: 'Service Efficiency & Flow',
    professionalism: 'Professionalism & Closing Experience',
  };

  const scoresPreamble = (Object.keys(criteriaLabels) as Array<keyof CssCriteriaScores>)
    .map((key) => `- ${criteriaLabels[key]}: ${criteriaScores[key]}/5`)
    .join('\n');

  const userContent = `Criteria Scores:\n${scoresPreamble}\n\nAudit Log:\n${auditLog}`;

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'OpenAI-Organization': env.OPENAI_ORGANIZATION_ID,
      'OpenAI-Project': env.OPENAI_PROJECT_ID,
    },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      max_output_tokens: 800,
      input: [
        {
          role: 'system',
          content:
            'You summarize cashier performance audits. Return concise actionable findings, strengths, risks, and coaching recommendations.',
        },
        {
          role: 'user',
          content: userContent,
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new AppError(502, `AI report generation failed: ${text}`);
  }

  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<{
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };

  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const textFromOutput = payload.output
    ?.flatMap((item) => item.content ?? [])
    .filter((item) => item.type === 'output_text' || item.type === 'text')
    .map((item) => String(item.text ?? '').trim())
    .filter(Boolean)
    .join('\n')
    .trim();

  if (textFromOutput) return textFromOutput;
  throw new AppError(502, 'AI report generation returned an empty response');
}

async function appendCssAuditResult(userKey: string, payload: {
  audit_id: string;
  star_rating: number;
  criteria_scores: CssCriteriaScores;
  audited_at: string;
}): Promise<void> {
  const masterDb = db.getMasterDb();
  const targetUser = await masterDb('users').where({ user_key: userKey }).first('id');
  if (!targetUser) return;

  await masterDb('users')
    .where({ id: targetUser.id })
    .update({
      css_audits: masterDb.raw(
        `COALESCE(css_audits, '[]'::jsonb) || ?::jsonb`,
        [JSON.stringify([payload])],
      ),
      updated_at: new Date(),
    });
}

async function updateComplianceAuditResult(odooEmployeeId: number, payload: {
  audit_id: string;
  answers: {
    productivity_rate: boolean;
    uniform: boolean;
    hygiene: boolean;
    sop: boolean;
  };
  audited_at: string;
}): Promise<void> {
  const websiteKey = await getEmployeeWebsiteKeyByEmployeeId(odooEmployeeId);
  if (!websiteKey) return;

  const masterDb = db.getMasterDb();
  const targetUser = await masterDb('users').where({ user_key: websiteKey }).first('id');
  if (!targetUser) return;

  await masterDb('users')
    .where({ id: targetUser.id })
    .update({
      compliance_audit: masterDb.raw('?::jsonb', [JSON.stringify(payload)]),
      updated_at: new Date(),
    });
}

export async function listStoreAudits(input: {
  tenantDb: Knex;
  userId: string;
  type?: StoreAuditType | 'all';
  status?: StoreAuditStatus;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, Number(input.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 20)));

  const query = input.tenantDb('store_audits');
  if (input.type && input.type !== 'all') {
    query.where({ type: input.type });
  }
  if (input.status) {
    query.where({ status: input.status });
  }

  const [countRow, rows, processingAudit] = await Promise.all([
    query.clone().count<{ count: string }>({ count: '*' }).first(),
    query
      .clone()
      .orderBy('created_at', 'desc')
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    input.tenantDb('store_audits')
      .where({ status: 'processing', auditor_user_id: input.userId })
      .first('id'),
  ]);

  const items = await enrichAuditRows(input.tenantDb, rows);

  return {
    items,
    page,
    pageSize,
    total: Number(countRow?.count ?? 0),
    processingAuditId: (processingAudit?.id as string | undefined) ?? null,
  };
}

export async function getStoreAuditById(input: {
  tenantDb: Knex;
  id: string;
}): Promise<StoreAuditRow> {
  const row = await input.tenantDb('store_audits').where({ id: input.id }).first();
  if (!row) throw new AppError(404, 'Store audit not found');
  const [enriched] = await enrichAuditRows(input.tenantDb, [row]);
  return enriched;
}

export async function processStoreAudit(input: {
  tenantDb: Knex;
  auditId: string;
  userId: string;
  companyId: string;
}): Promise<StoreAuditRow> {
  const existing = await input.tenantDb('store_audits').where({ id: input.auditId }).first();
  if (!existing || existing.status !== 'pending') {
    throw new AppError(404, 'Store audit not found');
  }

  const activeAudit = await input.tenantDb('store_audits')
    .where({ status: 'processing', auditor_user_id: input.userId })
    .first('id');
  if (activeAudit) {
    throw new AppError(409, 'You already have an active audit in progress');
  }

  let updated: any;
  try {
    [updated] = await input.tenantDb('store_audits')
      .where({ id: input.auditId, status: 'pending' })
      .update({
        status: 'processing',
        auditor_user_id: input.userId,
        updated_at: new Date(),
      })
      .returning('*');
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(409, 'You already have an active audit in progress');
    }
    throw error;
  }

  if (!updated) {
    throw new AppError(409, 'Audit was already claimed');
  }

  const [enriched] = await enrichAuditRows(input.tenantDb, [updated]);
  emitStoreAuditEvent(input.companyId, 'store-audit:claimed', {
    id: enriched.id,
    auditor_user_id: input.userId,
    auditor_name: enriched.auditor_name ?? null,
  });
  return enriched;
}

export async function completeStoreAudit(input: {
  tenantDb: Knex;
  auditId: string;
  userId: string;
  companyId: string;
  payload:
  | {
    criteria_scores: CssCriteriaScores;
    audit_log: string;
  }
  | {
    productivity_rate: boolean;
    uniform: boolean;
    hygiene: boolean;
    sop: boolean;
  };
}): Promise<StoreAuditRow> {
  const audit = await input.tenantDb('store_audits').where({ id: input.auditId }).first();
  if (!audit) throw new AppError(404, 'Store audit not found');
  if (audit.status !== 'processing' || audit.auditor_user_id !== input.userId) {
    throw new AppError(403, 'You can only complete your own processing audit');
  }

  const completedAt = new Date();
  let updated: any;

  if (audit.type === 'customer_service') {
    const cssPayload = input.payload as { criteria_scores: CssCriteriaScores; audit_log: string };
    const { criteria_scores } = cssPayload;
    const starRating = Math.round(
      ((criteria_scores.greeting + criteria_scores.order_accuracy + criteria_scores.suggestive_selling
        + criteria_scores.service_efficiency + criteria_scores.professionalism) / 5) * 100,
    ) / 100;
    const aiReport = await analyzeCssAudit(cssPayload.audit_log, criteria_scores);
    [updated] = await input.tenantDb('store_audits')
      .where({ id: input.auditId })
      .update({
        status: 'completed',
        css_criteria_scores: JSON.stringify(criteria_scores),
        css_star_rating: starRating,
        css_audit_log: cssPayload.audit_log,
        css_ai_report: aiReport,
        completed_at: completedAt,
        updated_at: completedAt,
      })
      .returning('*');

    if (audit.css_cashier_user_key) {
      await appendCssAuditResult(String(audit.css_cashier_user_key), {
        audit_id: input.auditId,
        star_rating: starRating,
        criteria_scores,
        audited_at: completedAt.toISOString(),
      });
    }
  } else {
    const compPayload = input.payload as {
      productivity_rate: boolean;
      uniform: boolean;
      hygiene: boolean;
      sop: boolean;
    };
    [updated] = await input.tenantDb('store_audits')
      .where({ id: input.auditId })
      .update({
        status: 'completed',
        comp_productivity_rate: compPayload.productivity_rate,
        comp_uniform: compPayload.uniform,
        comp_hygiene: compPayload.hygiene,
        comp_sop: compPayload.sop,
        completed_at: completedAt,
        updated_at: completedAt,
      })
      .returning('*');

    if (audit.comp_odoo_employee_id) {
      await updateComplianceAuditResult(Number(audit.comp_odoo_employee_id), {
        audit_id: input.auditId,
        answers: {
          productivity_rate: compPayload.productivity_rate,
          uniform: compPayload.uniform,
          hygiene: compPayload.hygiene,
          sop: compPayload.sop,
        },
        audited_at: completedAt.toISOString(),
      });
    }
  }

  const [enriched] = await enrichAuditRows(input.tenantDb, [updated]);
  emitStoreAuditEvent(input.companyId, 'store-audit:completed', { id: input.auditId });
  return enriched;
}
