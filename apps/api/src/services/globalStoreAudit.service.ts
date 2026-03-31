import type {
  CssCriteriaScores,
  ListStoreAuditsResponse,
  StoreAudit,
  StoreAuditMessage,
  StoreAuditStatus,
  StoreAuditType,
} from '@omnilert/shared';
import { db } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { hydrateUsersByIds } from './globalUser.service.js';
import { getCompanyStorageRoot } from './storage.service.js';

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

function normalizeAuditRow(row: any): StoreAudit {
  return {
    ...row,
    css_order_lines: parseJsonField(row.css_order_lines, null),
    css_payments: parseJsonField(row.css_payments, null),
    css_criteria_scores: parseJsonField(row.css_criteria_scores, null),
  };
}

async function enrichAuditRows(rows: any[]): Promise<StoreAudit[]> {
  if (rows.length === 0) return [];

  const branchIds = [...new Set(rows.map((r) => r.branch_id).filter(Boolean))] as string[];
  const auditorIds = [...new Set(rows.map((r) => r.auditor_user_id).filter(Boolean))] as string[];
  const auditedUserIds = [...new Set(rows.map((r) => r.audited_user_id).filter(Boolean))] as string[];

  const [branches, auditors, auditedUsers] = await Promise.all([
    branchIds.length > 0
      ? db.getDb()('branches').whereIn('id', branchIds).select('id', 'name')
      : Promise.resolve([]),
    auditorIds.length > 0
      ? hydrateUsersByIds(auditorIds, ['id', 'first_name', 'last_name'])
      : Promise.resolve({} as Record<string, any>),
    auditedUserIds.length > 0
      ? hydrateUsersByIds(auditedUserIds, ['id', 'avatar_url'])
      : Promise.resolve({} as Record<string, any>),
  ]);

  const branchMap = new Map(branches.map((b: any) => [b.id as string, b.name as string]));

  return rows.map((row) => {
    const normalized = normalizeAuditRow(row);
    const auditor = auditorIds.length > 0 && normalized.auditor_user_id
      ? auditors[normalized.auditor_user_id]
      : null;
    const companyId = typeof (row as { company_id?: unknown }).company_id === 'string'
      ? (row as { company_id: string }).company_id
      : null;
    const companyName = typeof (row as { company_name?: unknown }).company_name === 'string'
      ? (row as { company_name: string }).company_name
      : null;
    const companySlug = typeof (row as { company_slug?: unknown }).company_slug === 'string'
      ? (row as { company_slug: string }).company_slug
      : null;
    return {
      ...normalized,
      branch_name: branchMap.get(normalized.branch_id) ?? null,
      auditor_name: auditor
        ? `${auditor.first_name ?? ''} ${auditor.last_name ?? ''}`.trim() || null
        : null,
      audited_user_avatar_url:
        normalized.audited_user_id && auditedUsers[normalized.audited_user_id]
          ? (auditedUsers[normalized.audited_user_id]?.avatar_url as string | null | undefined) ?? null
          : null,
      company:
        companyId && companyName && companySlug
          ? { id: companyId, name: companyName, slug: companySlug }
          : null,
    };
  });
}

type GlobalStoreAuditServiceDeps = {
  listStoreAuditRows: (input: {
    type?: StoreAuditType | 'all';
    status?: StoreAuditStatus;
    page?: number;
    pageSize?: number;
  }) => Promise<{ rows: any[]; total: number }>;
  getProcessingAuditIdByUser: (userId: string) => Promise<string | null>;
  getAuditById: (auditId: string) => Promise<any | null>;
  resolveAuditCompanyContext: (auditId: string) => Promise<{ companyId: string; companySlug: string; companyStorageRoot: string } | null>;
  listStoreAuditMessages: (input: { auditId: string }) => Promise<StoreAuditMessage[]>;
  sendStoreAuditMessage: (input: {
    companyId: string;
    companyStorageRoot: string;
    auditId: string;
    userId: string;
    content: string;
    files: Array<{ buffer: Buffer; originalname: string; mimetype: string; size: number }>;
  }) => Promise<StoreAuditMessage>;
  editStoreAuditMessage: (input: {
    companyId: string;
    auditId: string;
    messageId: string;
    userId: string;
    content: string;
  }) => Promise<StoreAuditMessage>;
  deleteStoreAuditMessage: (input: {
    companyId: string;
    auditId: string;
    messageId: string;
    userId: string;
  }) => Promise<void>;
  processStoreAudit: (input: {
    auditId: string;
    userId: string;
    companyId: string;
  }) => Promise<StoreAudit>;
  rejectStoreAudit: (input: {
    auditId: string;
    userId: string;
    companyId: string;
    reason: string;
  }) => Promise<StoreAudit>;
  completeStoreAudit: (input: {
    auditId: string;
    userId: string;
    companyId: string;
    payload:
      | { criteria_scores: CssCriteriaScores }
      | {
        productivity_rate: boolean | null;
        uniform_compliance: boolean | null;
        hygiene_compliance: boolean | null;
        sop_compliance: boolean | null;
        customer_interaction: number;
        cashiering: number;
        suggestive_selling_and_upselling: number;
        service_efficiency: number;
      };
  }) => Promise<StoreAudit>;
  getAuditorStats: (input: { userId: string }) => Promise<{
    current: { totalEarnings: number; auditsCompleted: number; averageReward: number };
    previous: { totalEarnings: number; auditsCompleted: number };
  }>;
};

async function defaultListStoreAuditRows(input: {
  type?: StoreAuditType | 'all';
  status?: StoreAuditStatus;
  page?: number;
  pageSize?: number;
}): Promise<{ rows: any[]; total: number }> {
  const page = Math.max(1, Number(input.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 20)));

  const query = db.getDb()('store_audits')
    .leftJoin('companies', 'store_audits.company_id', 'companies.id');

  if (input.type && input.type !== 'all') {
    query.where('store_audits.type', input.type);
  }
  if (input.status) {
    query.where('store_audits.status', input.status);
  }

  const countRow = await query.clone().count<{ count: string }>({ count: '*' }).first();
  const total = Number(countRow?.count ?? 0);

  const sortOrder = (() => {
    if (input.status === 'completed') {
      return [
        { column: 'store_audits.completed_at', order: 'desc' as const, nulls: 'last' as const },
        { column: 'store_audits.created_at', order: 'desc' as const },
      ];
    }
    if (input.status === 'rejected') {
      return [
        { column: 'store_audits.rejected_at', order: 'desc' as const, nulls: 'last' as const },
        { column: 'store_audits.created_at', order: 'desc' as const },
      ];
    }
    if (input.status === 'processing') {
      return [
        { column: 'store_audits.updated_at', order: 'desc' as const },
        { column: 'store_audits.created_at', order: 'desc' as const },
      ];
    }
    return [{ column: 'store_audits.created_at', order: 'desc' as const }];
  })();

  const rows = await query
    .clone()
    .select(
      'store_audits.*',
      'companies.id as company_id',
      'companies.slug as company_slug',
      'companies.name as company_name',
    )
    .orderBy(sortOrder as Array<{ column: string; order: 'asc' | 'desc'; nulls?: 'first' | 'last' }>)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return { rows, total };
}

async function defaultGetProcessingAuditIdByUser(userId: string): Promise<string | null> {
  const row = await db.getDb()('store_audits')
    .where({ status: 'processing', auditor_user_id: userId })
    .first('id');
  return (row?.id as string | undefined) ?? null;
}

async function defaultGetAuditById(auditId: string): Promise<any | null> {
  const row = await db.getDb()('store_audits')
    .leftJoin('companies', 'store_audits.company_id', 'companies.id')
    .where('store_audits.id', auditId)
    .select(
      'store_audits.*',
      'companies.id as company_id',
      'companies.slug as company_slug',
      'companies.name as company_name',
    )
    .first();
  return row ?? null;
}

async function defaultResolveAuditCompanyContext(auditId: string): Promise<{ companyId: string; companySlug: string; companyStorageRoot: string } | null> {
  const audit = await db.getDb()('store_audits')
    .where('store_audits.id', auditId)
    .first('company_id');
  if (!audit) return null;

  const company = await db.getDb()('companies')
    .where({ id: audit.company_id })
    .first('id', 'slug');
  if (!company) return null;

  return {
    companyId: company.id as string,
    companySlug: company.slug as string,
    companyStorageRoot: getCompanyStorageRoot(company.slug as string),
  };
}

async function defaultListStoreAuditMessages(input: { auditId: string }): Promise<StoreAuditMessage[]> {
  const mod = await import('./storeAudit.service.js');
  return mod.listStoreAuditMessages(input);
}

async function defaultSendStoreAuditMessage(input: {
  companyId: string;
  companyStorageRoot: string;
  auditId: string;
  userId: string;
  content: string;
  files: Array<{ buffer: Buffer; originalname: string; mimetype: string; size: number }>;
}): Promise<StoreAuditMessage> {
  const mod = await import('./storeAudit.service.js');
  return mod.sendStoreAuditMessage(input);
}

async function defaultEditStoreAuditMessage(input: {
  companyId: string;
  auditId: string;
  messageId: string;
  userId: string;
  content: string;
}): Promise<StoreAuditMessage> {
  const mod = await import('./storeAudit.service.js');
  return mod.editStoreAuditMessage(input);
}

async function defaultDeleteStoreAuditMessage(input: {
  companyId: string;
  auditId: string;
  messageId: string;
  userId: string;
}): Promise<void> {
  const mod = await import('./storeAudit.service.js');
  return mod.deleteStoreAuditMessage(input);
}

async function defaultProcessStoreAudit(input: {
  auditId: string;
  userId: string;
  companyId: string;
}): Promise<StoreAudit> {
  const mod = await import('./storeAudit.service.js');
  return mod.processStoreAudit(input);
}

async function defaultRejectStoreAudit(input: {
  auditId: string;
  userId: string;
  companyId: string;
  reason: string;
}): Promise<StoreAudit> {
  const mod = await import('./storeAudit.service.js');
  return mod.rejectStoreAudit(input);
}

async function defaultCompleteStoreAudit(input: {
  auditId: string;
  userId: string;
  companyId: string;
  payload:
    | { criteria_scores: CssCriteriaScores }
    | {
      productivity_rate: boolean | null;
      uniform_compliance: boolean | null;
      hygiene_compliance: boolean | null;
      sop_compliance: boolean | null;
      customer_interaction: number;
      cashiering: number;
      suggestive_selling_and_upselling: number;
      service_efficiency: number;
    };
}): Promise<StoreAudit> {
  const mod = await import('./storeAudit.service.js');
  return mod.completeStoreAudit(input);
}

async function defaultGetAuditorStats(input: { userId: string }) {
  const mod = await import('./storeAudit.service.js');
  return mod.getAuditorStats(input);
}

export function createGlobalStoreAuditService(
  overrides: Partial<GlobalStoreAuditServiceDeps> = {},
) {
  const deps: GlobalStoreAuditServiceDeps = {
    listStoreAuditRows: overrides.listStoreAuditRows ?? defaultListStoreAuditRows,
    getProcessingAuditIdByUser: overrides.getProcessingAuditIdByUser ?? defaultGetProcessingAuditIdByUser,
    getAuditById: overrides.getAuditById ?? defaultGetAuditById,
    resolveAuditCompanyContext: overrides.resolveAuditCompanyContext ?? defaultResolveAuditCompanyContext,
    listStoreAuditMessages: overrides.listStoreAuditMessages ?? defaultListStoreAuditMessages,
    sendStoreAuditMessage: overrides.sendStoreAuditMessage ?? defaultSendStoreAuditMessage,
    editStoreAuditMessage: overrides.editStoreAuditMessage ?? defaultEditStoreAuditMessage,
    deleteStoreAuditMessage: overrides.deleteStoreAuditMessage ?? defaultDeleteStoreAuditMessage,
    processStoreAudit: overrides.processStoreAudit ?? defaultProcessStoreAudit,
    rejectStoreAudit: overrides.rejectStoreAudit ?? defaultRejectStoreAudit,
    completeStoreAudit: overrides.completeStoreAudit ?? defaultCompleteStoreAudit,
    getAuditorStats: overrides.getAuditorStats ?? defaultGetAuditorStats,
  };

  return {
    async listStoreAudits(input: {
      userId: string;
      type?: StoreAuditType | 'all';
      status?: StoreAuditStatus;
      page?: number;
      pageSize?: number;
    }): Promise<ListStoreAuditsResponse> {
      const page = Math.max(1, Number(input.page ?? 1));
      const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 20)));

      const [{ rows, total }, processingAuditId] = await Promise.all([
        deps.listStoreAuditRows({ ...input, page, pageSize }),
        deps.getProcessingAuditIdByUser(input.userId),
      ]);

      const enriched = await enrichAuditRows(rows);

      return {
        items: enriched,
        page,
        pageSize,
        total,
        processingAuditId,
      };
    },

    async getStoreAuditById(input: { auditId: string }): Promise<StoreAudit> {
      const row = await deps.getAuditById(input.auditId);
      if (!row) {
        throw new AppError(404, 'Store audit not found');
      }
      const [enriched] = await enrichAuditRows([row]);
      return enriched;
    },

    async listMessages(input: { auditId: string }): Promise<StoreAuditMessage[]> {
      return deps.listStoreAuditMessages({ auditId: input.auditId });
    },

    async sendMessage(input: {
      auditId: string;
      userId: string;
      content: string;
      files: Array<{ buffer: Buffer; originalname: string; mimetype: string; size: number }>;
    }): Promise<StoreAuditMessage> {
      const context = await deps.resolveAuditCompanyContext(input.auditId);
      if (!context) throw new AppError(404, 'Store audit not found');
      return deps.sendStoreAuditMessage({
        companyId: context.companyId,
        companyStorageRoot: context.companyStorageRoot,
        auditId: input.auditId,
        userId: input.userId,
        content: input.content,
        files: input.files,
      });
    },

    async editMessage(input: {
      auditId: string;
      messageId: string;
      userId: string;
      content: string;
    }): Promise<StoreAuditMessage> {
      const context = await deps.resolveAuditCompanyContext(input.auditId);
      if (!context) throw new AppError(404, 'Store audit not found');
      return deps.editStoreAuditMessage({
        companyId: context.companyId,
        auditId: input.auditId,
        messageId: input.messageId,
        userId: input.userId,
        content: input.content,
      });
    },

    async deleteMessage(input: {
      auditId: string;
      messageId: string;
      userId: string;
    }): Promise<void> {
      const context = await deps.resolveAuditCompanyContext(input.auditId);
      if (!context) throw new AppError(404, 'Store audit not found');
      await deps.deleteStoreAuditMessage({
        companyId: context.companyId,
        auditId: input.auditId,
        messageId: input.messageId,
        userId: input.userId,
      });
    },

    async processAudit(input: {
      auditId: string;
      userId: string;
    }): Promise<StoreAudit> {
      const context = await deps.resolveAuditCompanyContext(input.auditId);
      if (!context) throw new AppError(404, 'Store audit not found');
      return deps.processStoreAudit({
        auditId: input.auditId,
        userId: input.userId,
        companyId: context.companyId,
      });
    },

    async completeAudit(input: {
      auditId: string;
      userId: string;
      payload:
        | { criteria_scores: CssCriteriaScores }
        | {
          productivity_rate: boolean | null;
          uniform_compliance: boolean | null;
          hygiene_compliance: boolean | null;
          sop_compliance: boolean | null;
          customer_interaction: number;
          cashiering: number;
          suggestive_selling_and_upselling: number;
          service_efficiency: number;
        };
    }): Promise<StoreAudit> {
      const context = await deps.resolveAuditCompanyContext(input.auditId);
      if (!context) throw new AppError(404, 'Store audit not found');
      return deps.completeStoreAudit({
        auditId: input.auditId,
        userId: input.userId,
        companyId: context.companyId,
        payload: input.payload,
      });
    },

    async rejectAudit(input: {
      auditId: string;
      userId: string;
      reason: string;
    }): Promise<StoreAudit> {
      const context = await deps.resolveAuditCompanyContext(input.auditId);
      if (!context) throw new AppError(404, 'Store audit not found');
      return deps.rejectStoreAudit({
        auditId: input.auditId,
        userId: input.userId,
        companyId: context.companyId,
        reason: input.reason,
      });
    },

    async getAuditorStats(input: { userId: string }) {
      return deps.getAuditorStats(input);
    },
  };
}

const globalStoreAuditService = createGlobalStoreAuditService();

export const listStoreAudits = globalStoreAuditService.listStoreAudits;
export const getStoreAuditById = globalStoreAuditService.getStoreAuditById;
export const listStoreAuditMessages = globalStoreAuditService.listMessages;
export const sendStoreAuditMessage = globalStoreAuditService.sendMessage;
export const editStoreAuditMessage = globalStoreAuditService.editMessage;
export const deleteStoreAuditMessage = globalStoreAuditService.deleteMessage;
export const processAudit = globalStoreAuditService.processAudit;
export const completeAudit = globalStoreAuditService.completeAudit;
export const rejectAudit = globalStoreAuditService.rejectAudit;
export const getAuditorStats = globalStoreAuditService.getAuditorStats;
