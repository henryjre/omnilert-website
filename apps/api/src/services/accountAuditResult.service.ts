import type {
  AccountAuditResultAttachment,
  AccountAuditResultDetail,
  AccountAuditResultListItem,
  AccountAuditResultSummary,
  ListAccountAuditResultsResponse,
  StoreAuditType,
} from '@omnilert/shared';
import { db } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { listEmployeeIdsByWebsiteUserKey } from './odoo.service.js';

type AuditRowSource = {
  company_id: string;
  company_name: string;
  company_slug: string;
  id: string;
  type: StoreAuditType;
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  branch_id: string;
  branch_name: string | null;
  completed_at: string | Date | null;
  created_at: string | Date;
  audited_user_id: string | null;
  audited_user_key: string | null;
  scc_odoo_employee_id: number | null;
  scc_employee_name: string | null;
  scc_productivity_rate: boolean | null;
  scc_uniform_compliance: boolean | null;
  scc_hygiene_compliance: boolean | null;
  scc_sop_compliance: boolean | null;
  scc_customer_interaction: number | null;
  scc_cashiering: number | null;
  scc_suggestive_selling_and_upselling: number | null;
  scc_service_efficiency: number | null;
  scc_ai_report: string | null;
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
  userId: string;
  userKey: string | null;
  employeeIds: number[];
};

type AccountAuditResultServiceDeps = {
  resolveViewerIdentity: (input: { userId: string }) => Promise<ViewerIdentity>;
  listCompletedAuditRows: (input: {
    type?: StoreAuditType;
  }) => Promise<AuditRowSource[]>;
  getAuditRowById: (input: {
    auditId: string;
  }) => Promise<AuditRowSource | null>;
  listAuditMessages: (input: {
    auditId: string;
  }) => Promise<AuditMessageSource[]>;
};

function formatAuditTypeLabel(type: StoreAuditType): AccountAuditResultListItem['type_label'] {
  return 'Service Crew CCTV Audit';
}

function toIsoString(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  return null;
}

function buildSummary(row: AuditRowSource): AccountAuditResultSummary {
  return {
    result_line: 'Status: Completed. Includes compliance checks and customer service ratings.',
    overall_value: null,
    overall_max: null,
    overall_unit: 'text',
  };
}

function buildListItem(row: AuditRowSource): AccountAuditResultListItem {
  return {
    id: row.id,
    type: 'service_crew_cctv',
    type_label: formatAuditTypeLabel(row.type),
    company: {
      id: row.company_id,
      name: row.company_name,
      slug: row.company_slug,
    },
    branch: {
      id: row.branch_id,
      name: row.branch_name ?? 'Unknown Branch',
    },
    completed_at: String(toIsoString(row.completed_at) ?? toIsoString(row.created_at) ?? ''),
    observed_at: toIsoString(row.created_at),
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

  return [];
}

function buildDetail(row: AuditRowSource, messages: AuditMessageSource[]): AccountAuditResultDetail {
  return {
    ...buildListItem(row),
    ai_report: row.scc_ai_report,
    audit_trail: buildAuditTrail(row, messages),
    scc_result: {
      compliance_criteria: {
        productivity_rate: row.scc_productivity_rate,
        uniform_compliance: row.scc_uniform_compliance,
        hygiene_compliance: row.scc_hygiene_compliance,
        sop_compliance: row.scc_sop_compliance,
      },
      customer_service_criteria: {
        customer_interaction: row.scc_customer_interaction,
        cashiering: row.scc_cashiering,
        suggestive_selling_and_upselling: row.scc_suggestive_selling_and_upselling,
        service_efficiency: row.scc_service_efficiency,
      },
    },
  };
}

function isOwnedByViewer(row: AuditRowSource, viewerIdentity: ViewerIdentity): boolean {
  if (row.type !== 'service_crew_cctv') {
    return false;
  }

  if (row.audited_user_id && row.audited_user_id === viewerIdentity.userId) {
    return true;
  }

  const normalizedUserKey = String(viewerIdentity.userKey ?? '').trim();
  const rowAuditedUserKey = String(row.audited_user_key ?? '').trim();
  if (normalizedUserKey && rowAuditedUserKey && normalizedUserKey === rowAuditedUserKey) {
    return true;
  }

  return row.scc_odoo_employee_id !== null
    && viewerIdentity.employeeIds.includes(Number(row.scc_odoo_employee_id));
}

function sortCompletedRowsDesc(left: AuditRowSource, right: AuditRowSource): number {
  const leftTime = new Date(String(toIsoString(left.completed_at) ?? left.created_at)).getTime();
  const rightTime = new Date(String(toIsoString(right.completed_at) ?? right.created_at)).getTime();

  return rightTime - leftTime;
}

async function defaultResolveViewerIdentity(input: { userId: string }): Promise<ViewerIdentity> {
  const user = await db.getDb()('users')
    .where({ id: input.userId })
    .first('user_key');

  const userKey = String(user?.user_key ?? '').trim() || null;
  if (!userKey) {
    return { userId: input.userId, userKey: null, employeeIds: [] };
  }

  return {
    userId: input.userId,
    userKey,
    employeeIds: await listEmployeeIdsByWebsiteUserKey(userKey),
  };
}

async function defaultListCompletedAuditRows(input: {
  type?: StoreAuditType;
}): Promise<AuditRowSource[]> {
  const query = db.getDb()('store_audits as audits')
    .join('companies as companies', 'audits.company_id', 'companies.id')
    .join('branches as branches', 'audits.branch_id', 'branches.id')
    .where('audits.status', 'completed')
    .where('audits.type', 'service_crew_cctv')
    .select(
      'audits.company_id',
      'companies.name as company_name',
      'companies.slug as company_slug',
      'audits.id',
      'audits.type',
      'audits.status',
      'audits.branch_id',
      'branches.name as branch_name',
      'audits.completed_at',
      'audits.created_at',
      'audits.audited_user_id',
      'audits.audited_user_key',
      'audits.scc_odoo_employee_id',
      'audits.scc_employee_name',
      'audits.scc_productivity_rate',
      'audits.scc_uniform_compliance',
      'audits.scc_hygiene_compliance',
      'audits.scc_sop_compliance',
      'audits.scc_customer_interaction',
      'audits.scc_cashiering',
      'audits.scc_suggestive_selling_and_upselling',
      'audits.scc_service_efficiency',
      'audits.scc_ai_report',
    );

  return query as unknown as Promise<AuditRowSource[]>;
}

async function defaultGetAuditRowById(input: {
  auditId: string;
}): Promise<AuditRowSource | null> {
  const row = await db.getDb()('store_audits as audits')
    .join('companies as companies', 'audits.company_id', 'companies.id')
    .join('branches as branches', 'audits.branch_id', 'branches.id')
    .where('audits.id', input.auditId)
    .first(
      'audits.company_id',
      'companies.name as company_name',
      'companies.slug as company_slug',
      'audits.id',
      'audits.type',
      'audits.status',
      'audits.branch_id',
      'branches.name as branch_name',
      'audits.completed_at',
      'audits.created_at',
      'audits.audited_user_id',
      'audits.audited_user_key',
      'audits.scc_odoo_employee_id',
      'audits.scc_employee_name',
      'audits.scc_productivity_rate',
      'audits.scc_uniform_compliance',
      'audits.scc_hygiene_compliance',
      'audits.scc_sop_compliance',
      'audits.scc_customer_interaction',
      'audits.scc_cashiering',
      'audits.scc_suggestive_selling_and_upselling',
      'audits.scc_service_efficiency',
      'audits.scc_ai_report',
    );

  return (row as AuditRowSource | undefined) ?? null;
}

async function defaultListAuditMessages(input: {
  auditId: string;
}): Promise<AuditMessageSource[]> {
  const auditExists = await db.getDb()('store_audits').where({ id: input.auditId }).first('id');
  if (!auditExists) {
    return [];
  }

  const messageRows = await db.getDb()('store_audit_messages')
    .where({ store_audit_id: input.auditId })
    .orderBy('created_at', 'asc')
    .select('id', 'content', 'is_deleted', 'created_at');

  if (messageRows.length === 0) {
    return [];
  }

  const messageIds = messageRows.map((row) => String(row.id));
  const attachmentRows = await db.getDb()('store_audit_attachments')
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
      userId: string;
      type?: StoreAuditType | 'all';
      branchIds?: string[];
      page?: number;
      pageSize?: number;
    }): Promise<ListAccountAuditResultsResponse> {
      const page = Math.max(1, Number(input.page ?? 1));
      const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 10)));
      if (input.type && input.type !== 'all' && input.type !== 'service_crew_cctv') {
        return {
          items: [],
          page,
          pageSize,
          total: 0,
        };
      }
      const viewerIdentity = await deps.resolveViewerIdentity({ userId: input.userId });
      const rows = await deps.listCompletedAuditRows({
        type: 'service_crew_cctv',
      });

      const branchIdSet = input.branchIds && input.branchIds.length > 0
        ? new Set(input.branchIds)
        : null;

      const ownedRows = rows
        .filter((row) => row.status === 'completed')
        .filter((row) => isOwnedByViewer(row, viewerIdentity))
        .filter((row) => branchIdSet === null || branchIdSet.has(row.branch_id))
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
      userId: string;
      auditId: string;
    }): Promise<AccountAuditResultDetail> {
      const viewerIdentity = await deps.resolveViewerIdentity({ userId: input.userId });
      const row = await deps.getAuditRowById({
        
        auditId: input.auditId,
      });

      if (
        !row
        || row.type !== 'service_crew_cctv'
        || row.status !== 'completed'
        || !isOwnedByViewer(row, viewerIdentity)
      ) {
        throw new AppError(404, 'Audit result not found');
      }

      const messages = await deps.listAuditMessages({
        
        auditId: input.auditId,
      });

      return buildDetail(row, messages);
    },
  };
}

const accountAuditResultService = createAccountAuditResultService();

export const listAccountAuditResults = accountAuditResultService.listAccountAuditResults;
export const getAccountAuditResultById = accountAuditResultService.getAccountAuditResultById;
