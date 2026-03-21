import type {
  AccountAuditResultAttachment,
  AccountAuditResultDetail,
  AccountAuditResultListItem,
  AccountAuditResultSummary,
  CssCriteriaScores,
  ListAccountAuditResultsResponse,
  StoreAuditType,
} from '@omnilert/shared';
import type { Knex } from 'knex';
import { db } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { listEmployeeIdsByWebsiteUserKey } from './odoo.service.js';

type AuditRowSource = {
  id: string;
  type: StoreAuditType;
  status: 'pending' | 'processing' | 'completed';
  branch_id: string;
  branch_name: string | null;
  completed_at: string | Date | null;
  created_at: string | Date;
  css_cashier_user_key: string | null;
  css_date_order: string | Date | null;
  css_star_rating: number | null;
  css_criteria_scores: CssCriteriaScores | string | null;
  css_ai_report: string | null;
  css_audit_log: string | null;
  comp_odoo_employee_id: number | null;
  comp_check_in_time: string | Date | null;
  comp_productivity_rate: boolean | null;
  comp_uniform: boolean | null;
  comp_hygiene: boolean | null;
  comp_sop: boolean | null;
  comp_ai_report: string | null;
};

type AuditMessageAttachmentSource = {
  id: string;
  file_url: string;
  file_name: string;
  file_size: number;
  content_type: string;
  created_at: string;
};

type AuditMessageSource = {
  id: string;
  content: string;
  is_deleted: boolean;
  created_at: string;
  attachments: AuditMessageAttachmentSource[];
};

type ViewerIdentity = {
  userKey: string | null;
  employeeIds: number[];
};

type AccountAuditResultServiceDeps = {
  resolveViewerIdentity: (input: { userId: string }) => Promise<ViewerIdentity>;
  listCompletedAuditRows: (input: {
    tenantDb: Knex;
    type?: StoreAuditType;
  }) => Promise<AuditRowSource[]>;
  getAuditRowById: (input: {
    tenantDb: Knex;
    auditId: string;
  }) => Promise<AuditRowSource | null>;
  listAuditMessages: (input: {
    tenantDb: Knex;
    auditId: string;
  }) => Promise<AuditMessageSource[]>;
};

function formatAuditTypeLabel(type: StoreAuditType): AccountAuditResultListItem['type_label'] {
  return type === 'customer_service' ? 'Customer Service Audit' : 'Compliance Audit';
}

function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return value.toFixed(2).replace(/\.?0+$/, '');
}

function countPassedComplianceChecks(row: AuditRowSource): number {
  return [
    row.comp_productivity_rate,
    row.comp_uniform,
    row.comp_hygiene,
    row.comp_sop,
  ].filter((value) => value === true).length;
}

function toIsoString(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  return null;
}

function parseCriteriaScores(value: AuditRowSource['css_criteria_scores']): CssCriteriaScores | null {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as CssCriteriaScores;
    } catch {
      return null;
    }
  }
  return value;
}

function buildSummary(row: AuditRowSource): AccountAuditResultSummary {
  if (row.type === 'customer_service') {
    const overallValue = Number(row.css_star_rating ?? 0);
    return {
      result_line: `Overall score: ${formatCompactNumber(overallValue)} / 5`,
      overall_value: overallValue,
      overall_max: 5,
      overall_unit: 'rating',
    };
  }

  const passedChecks = countPassedComplianceChecks(row);
  return {
    result_line: `Passed checks: ${passedChecks} / 4`,
    overall_value: passedChecks,
    overall_max: 4,
    overall_unit: 'checks',
  };
}

function buildListItem(row: AuditRowSource): AccountAuditResultListItem {
  return {
    id: row.id,
    type: row.type,
    type_label: formatAuditTypeLabel(row.type),
    branch: {
      id: row.branch_id,
      name: row.branch_name ?? 'Unknown Branch',
    },
    completed_at: String(toIsoString(row.completed_at) ?? toIsoString(row.created_at) ?? ''),
    observed_at:
      row.type === 'customer_service'
        ? toIsoString(row.css_date_order)
        : toIsoString(row.comp_check_in_time),
    summary: buildSummary(row),
  };
}

function sanitizeAttachments(attachments: AuditMessageAttachmentSource[]): AccountAuditResultAttachment[] {
  return attachments.map((attachment) => ({
    id: attachment.id,
    file_url: attachment.file_url,
    file_name: attachment.file_name,
    file_size: attachment.file_size,
    content_type: attachment.content_type,
    created_at: attachment.created_at,
  }));
}

function buildAuditTrail(row: AuditRowSource, messages: AuditMessageSource[]) {
  const visibleEntries = messages
    .filter((message) => !message.is_deleted)
    .map((message) => ({
      id: message.id,
      content: message.content,
      created_at: message.created_at,
      attachments: sanitizeAttachments(message.attachments),
    }))
    .filter((message) => message.content.trim() || message.attachments.length > 0);

  if (visibleEntries.length > 0) {
    return visibleEntries;
  }

  if (row.type === 'customer_service' && String(row.css_audit_log ?? '').trim()) {
    return [
      {
        id: `audit-log-${row.id}`,
        content: String(row.css_audit_log ?? '').trim(),
        created_at: String(toIsoString(row.completed_at) ?? toIsoString(row.created_at) ?? ''),
        attachments: [],
      },
    ];
  }

  return [];
}

function buildDetail(row: AuditRowSource, messages: AuditMessageSource[]): AccountAuditResultDetail {
  return {
    ...buildListItem(row),
    ai_report: row.type === 'customer_service' ? row.css_ai_report : row.comp_ai_report,
    audit_trail: buildAuditTrail(row, messages),
    css_result:
      row.type === 'customer_service'
        ? {
          criteria_scores: parseCriteriaScores(row.css_criteria_scores),
          overall_rating: row.css_star_rating,
        }
        : null,
    compliance_result:
      row.type === 'compliance'
        ? {
          checks: {
            productivity_rate: row.comp_productivity_rate,
            uniform: row.comp_uniform,
            hygiene: row.comp_hygiene,
            sop: row.comp_sop,
          },
          passed_count: countPassedComplianceChecks(row),
          total_checks: 4,
        }
        : null,
  };
}

function isOwnedByViewer(row: AuditRowSource, viewerIdentity: ViewerIdentity): boolean {
  const normalizedUserKey = String(viewerIdentity.userKey ?? '').trim();

  if (row.type === 'customer_service') {
    return Boolean(normalizedUserKey) && normalizedUserKey === String(row.css_cashier_user_key ?? '').trim();
  }

  return row.comp_odoo_employee_id !== null
    && viewerIdentity.employeeIds.includes(Number(row.comp_odoo_employee_id));
}

function sortCompletedRowsDesc(left: AuditRowSource, right: AuditRowSource): number {
  const leftTime = new Date(String(toIsoString(left.completed_at) ?? left.created_at)).getTime();
  const rightTime = new Date(String(toIsoString(right.completed_at) ?? right.created_at)).getTime();

  return rightTime - leftTime;
}

async function defaultResolveViewerIdentity(input: { userId: string }): Promise<ViewerIdentity> {
  const user = await db.getMasterDb()('users')
    .where({ id: input.userId })
    .first('user_key');

  const userKey = String(user?.user_key ?? '').trim() || null;
  if (!userKey) {
    return { userKey: null, employeeIds: [] };
  }

  return {
    userKey,
    employeeIds: await listEmployeeIdsByWebsiteUserKey(userKey),
  };
}

async function defaultListCompletedAuditRows(input: {
  tenantDb: Knex;
  type?: StoreAuditType;
}): Promise<AuditRowSource[]> {
  const query = input.tenantDb('store_audits as audits')
    .leftJoin('branches', 'audits.branch_id', 'branches.id')
    .where('audits.status', 'completed')
    .select(
      'audits.id',
      'audits.type',
      'audits.status',
      'audits.branch_id',
      'branches.name as branch_name',
      'audits.completed_at',
      'audits.created_at',
      'audits.css_cashier_user_key',
      'audits.css_date_order',
      'audits.css_star_rating',
      'audits.css_criteria_scores',
      'audits.css_ai_report',
      'audits.css_audit_log',
      'audits.comp_odoo_employee_id',
      'audits.comp_check_in_time',
      'audits.comp_productivity_rate',
      'audits.comp_uniform',
      'audits.comp_hygiene',
      'audits.comp_sop',
      'audits.comp_ai_report',
    );

  if (input.type) {
    query.andWhere('audits.type', input.type);
  }

  return query as unknown as Promise<AuditRowSource[]>;
}

async function defaultGetAuditRowById(input: {
  tenantDb: Knex;
  auditId: string;
}): Promise<AuditRowSource | null> {
  const row = await input.tenantDb('store_audits as audits')
    .leftJoin('branches', 'audits.branch_id', 'branches.id')
    .where('audits.id', input.auditId)
    .first(
      'audits.id',
      'audits.type',
      'audits.status',
      'audits.branch_id',
      'branches.name as branch_name',
      'audits.completed_at',
      'audits.created_at',
      'audits.css_cashier_user_key',
      'audits.css_date_order',
      'audits.css_star_rating',
      'audits.css_criteria_scores',
      'audits.css_ai_report',
      'audits.css_audit_log',
      'audits.comp_odoo_employee_id',
      'audits.comp_check_in_time',
      'audits.comp_productivity_rate',
      'audits.comp_uniform',
      'audits.comp_hygiene',
      'audits.comp_sop',
      'audits.comp_ai_report',
    );

  return (row as AuditRowSource | undefined) ?? null;
}

async function defaultListAuditMessages(input: {
  tenantDb: Knex;
  auditId: string;
}): Promise<AuditMessageSource[]> {
  const messageRows = await input.tenantDb('store_audit_messages')
    .where({ store_audit_id: input.auditId })
    .orderBy('created_at', 'asc')
    .select('id', 'content', 'is_deleted', 'created_at');

  if (messageRows.length === 0) {
    return [];
  }

  const messageIds = messageRows.map((row) => String(row.id));
  const attachmentRows = await input.tenantDb('store_audit_attachments')
    .whereIn('message_id', messageIds)
    .orderBy('created_at', 'asc')
    .select('id', 'message_id', 'file_url', 'file_name', 'file_size', 'content_type', 'created_at');

  const attachmentsByMessage = new Map<string, AuditMessageAttachmentSource[]>();
  for (const row of attachmentRows as Array<Record<string, unknown>>) {
    const messageId = String(row.message_id ?? '').trim();
    if (!messageId) continue;

    const list = attachmentsByMessage.get(messageId) ?? [];
    list.push({
      id: String(row.id),
      file_url: String(row.file_url ?? ''),
      file_name: String(row.file_name ?? ''),
      file_size: Number(row.file_size ?? 0),
      content_type: String(row.content_type ?? ''),
      created_at: String(row.created_at ?? ''),
    });
    attachmentsByMessage.set(messageId, list);
  }

  return (messageRows as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    content: String(row.content ?? ''),
    is_deleted: Boolean(row.is_deleted),
    created_at: String(row.created_at ?? ''),
    attachments: attachmentsByMessage.get(String(row.id)) ?? [],
  }));
}

export function createAccountAuditResultService(
  overrides: Partial<AccountAuditResultServiceDeps> = {},
) {
  const deps: AccountAuditResultServiceDeps = {
    resolveViewerIdentity: overrides.resolveViewerIdentity ?? defaultResolveViewerIdentity,
    listCompletedAuditRows: overrides.listCompletedAuditRows ?? defaultListCompletedAuditRows,
    getAuditRowById: overrides.getAuditRowById ?? defaultGetAuditRowById,
    listAuditMessages: overrides.listAuditMessages ?? defaultListAuditMessages,
  };

  return {
    async listAccountAuditResults(input: {
      tenantDb: Knex;
      userId: string;
      type?: StoreAuditType | 'all';
      page?: number;
      pageSize?: number;
    }): Promise<ListAccountAuditResultsResponse> {
      const page = Math.max(1, Number(input.page ?? 1));
      const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 10)));
      const viewerIdentity = await deps.resolveViewerIdentity({ userId: input.userId });
      const rows = await deps.listCompletedAuditRows({
        tenantDb: input.tenantDb,
        type: input.type && input.type !== 'all' ? input.type : undefined,
      });

      const ownedRows = rows
        .filter((row) => row.status === 'completed')
        .filter((row) => isOwnedByViewer(row, viewerIdentity))
        .sort(sortCompletedRowsDesc);

      const total = ownedRows.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const resolvedPage = Math.min(page, totalPages);
      const start = (resolvedPage - 1) * pageSize;
      const pagedItems = ownedRows.slice(start, start + pageSize).map(buildListItem);

      return {
        items: pagedItems,
        page: resolvedPage,
        pageSize,
        total,
      };
    },

    async getAccountAuditResultById(input: {
      tenantDb: Knex;
      userId: string;
      auditId: string;
    }): Promise<AccountAuditResultDetail> {
      const viewerIdentity = await deps.resolveViewerIdentity({ userId: input.userId });
      const row = await deps.getAuditRowById({
        tenantDb: input.tenantDb,
        auditId: input.auditId,
      });

      if (!row || row.status !== 'completed' || !isOwnedByViewer(row, viewerIdentity)) {
        throw new AppError(404, 'Audit result not found');
      }

      const messages = await deps.listAuditMessages({
        tenantDb: input.tenantDb,
        auditId: input.auditId,
      });

      return buildDetail(row, messages);
    },
  };
}

const accountAuditResultService = createAccountAuditResultService();

export const listAccountAuditResults = accountAuditResultService.listAccountAuditResults;
export const getAccountAuditResultById = accountAuditResultService.getAccountAuditResultById;
