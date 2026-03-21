import type { Knex } from 'knex';
import type {
  CssCriteriaScores,
  ListStoreAuditsResponse,
  StoreAudit,
  StoreAuditMessage,
  StoreAuditStatus,
  StoreAuditType,
} from '@omnilert/shared';
import { AppError } from '../middleware/errorHandler.js';
import {
  getGlobalProcessingAuditIdByUser,
  getGlobalStoreAuditProjectionByAuditId,
  listGlobalStoreAuditProjectionRows,
  mapProjectionRowToStoreAudit,
  reserveGlobalProcessingAudit,
  resolveGlobalStoreAuditContext,
  syncGlobalStoreAuditProjectionByAuditId,
  type GlobalStoreAuditProjectionRow,
  type ResolvedGlobalStoreAuditContext,
} from './globalStoreAuditIndex.service.js';
import {
  completeStoreAudit,
  deleteStoreAuditMessage,
  editStoreAuditMessage,
  listStoreAuditMessages,
  processStoreAudit,
  sendStoreAuditMessage,
} from './storeAudit.service.js';

type GlobalStoreAuditServiceDeps = {
  listProjectionRows: (input: {
    type?: StoreAuditType | 'all';
    status?: StoreAuditStatus;
    page?: number;
    pageSize?: number;
  }) => Promise<{ rows: GlobalStoreAuditProjectionRow[]; total: number }>;
  getProcessingAuditIdByUser: (userId: string) => Promise<string | null>;
  getProjectionByAuditId: (auditId: string) => Promise<GlobalStoreAuditProjectionRow | null>;
  resolveAuditContext: (auditId: string) => Promise<ResolvedGlobalStoreAuditContext | null>;
  reserveProcessingAudit: (input: {
    companyId: string;
    auditId: string;
    userId: string;
  }) => Promise<'ok' | 'user_has_active' | 'already_claimed' | 'not_found'>;
  syncProjectionByAuditId: (input: {
    companyId: string;
    auditId: string;
  }) => Promise<GlobalStoreAuditProjectionRow | null>;
  listStoreAuditMessages: (input: {
    tenantDb: Knex;
    auditId: string;
  }) => Promise<StoreAuditMessage[]>;
  sendStoreAuditMessage: (input: {
    tenantDb: Knex;
    companyId: string;
    companyStorageRoot: string;
    auditId: string;
    userId: string;
    content: string;
    files: Array<{ buffer: Buffer; originalname: string; mimetype: string; size: number }>;
  }) => Promise<StoreAuditMessage>;
  editStoreAuditMessage: (input: {
    tenantDb: Knex;
    companyId: string;
    auditId: string;
    messageId: string;
    userId: string;
    content: string;
  }) => Promise<StoreAuditMessage>;
  deleteStoreAuditMessage: (input: {
    tenantDb: Knex;
    companyId: string;
    auditId: string;
    messageId: string;
    userId: string;
  }) => Promise<void>;
  processStoreAuditTenant: (input: {
    tenantDb: Knex;
    auditId: string;
    userId: string;
    companyId: string;
  }) => Promise<StoreAudit>;
  completeStoreAuditTenant: (input: {
    tenantDb: Knex;
    auditId: string;
    userId: string;
    companyId: string;
    payload:
      | { criteria_scores: CssCriteriaScores }
      | { productivity_rate: boolean; uniform: boolean; hygiene: boolean; sop: boolean };
  }) => Promise<StoreAudit>;
};

async function requireAuditContext(
  resolver: GlobalStoreAuditServiceDeps['resolveAuditContext'],
  auditId: string,
): Promise<ResolvedGlobalStoreAuditContext> {
  const context = await resolver(auditId);
  if (!context) {
    throw new AppError(404, 'Store audit not found');
  }
  return context;
}

function toStoreAudit(row: Record<string, unknown>): StoreAudit {
  return mapProjectionRowToStoreAudit(row);
}

export function createGlobalStoreAuditService(
  overrides: Partial<GlobalStoreAuditServiceDeps> = {},
) {
  const deps: GlobalStoreAuditServiceDeps = {
    listProjectionRows: overrides.listProjectionRows ?? listGlobalStoreAuditProjectionRows,
    getProcessingAuditIdByUser: overrides.getProcessingAuditIdByUser ?? getGlobalProcessingAuditIdByUser,
    getProjectionByAuditId: overrides.getProjectionByAuditId ?? getGlobalStoreAuditProjectionByAuditId,
    resolveAuditContext: overrides.resolveAuditContext ?? resolveGlobalStoreAuditContext,
    reserveProcessingAudit: overrides.reserveProcessingAudit ?? reserveGlobalProcessingAudit,
    syncProjectionByAuditId: overrides.syncProjectionByAuditId ?? syncGlobalStoreAuditProjectionByAuditId,
    listStoreAuditMessages: overrides.listStoreAuditMessages ?? listStoreAuditMessages,
    sendStoreAuditMessage: overrides.sendStoreAuditMessage ?? sendStoreAuditMessage,
    editStoreAuditMessage: overrides.editStoreAuditMessage ?? editStoreAuditMessage,
    deleteStoreAuditMessage: overrides.deleteStoreAuditMessage ?? deleteStoreAuditMessage,
    processStoreAuditTenant: overrides.processStoreAuditTenant ?? processStoreAudit,
    completeStoreAuditTenant: overrides.completeStoreAuditTenant ?? completeStoreAudit,
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
        deps.listProjectionRows({ ...input, page, pageSize }),
        deps.getProcessingAuditIdByUser(input.userId),
      ]);

      return {
        items: rows.map((row) => toStoreAudit(row as unknown as Record<string, unknown>)),
        page,
        pageSize,
        total,
        processingAuditId,
      };
    },

    async getStoreAuditById(input: { auditId: string }): Promise<StoreAudit> {
      const row = await deps.getProjectionByAuditId(input.auditId);
      if (!row) {
        throw new AppError(404, 'Store audit not found');
      }
      return toStoreAudit(row as unknown as Record<string, unknown>);
    },

    async listMessages(input: { auditId: string }): Promise<StoreAuditMessage[]> {
      const context = await requireAuditContext(deps.resolveAuditContext, input.auditId);
      return deps.listStoreAuditMessages({
        tenantDb: context.tenantDb,
        auditId: input.auditId,
      });
    },

    async sendMessage(input: {
      auditId: string;
      userId: string;
      content: string;
      files: Array<{ buffer: Buffer; originalname: string; mimetype: string; size: number }>;
    }): Promise<StoreAuditMessage> {
      const context = await requireAuditContext(deps.resolveAuditContext, input.auditId);
      return deps.sendStoreAuditMessage({
        tenantDb: context.tenantDb,
        companyId: context.company.id,
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
      const context = await requireAuditContext(deps.resolveAuditContext, input.auditId);
      return deps.editStoreAuditMessage({
        tenantDb: context.tenantDb,
        companyId: context.company.id,
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
      const context = await requireAuditContext(deps.resolveAuditContext, input.auditId);
      await deps.deleteStoreAuditMessage({
        tenantDb: context.tenantDb,
        companyId: context.company.id,
        auditId: input.auditId,
        messageId: input.messageId,
        userId: input.userId,
      });
    },

    async processAudit(input: {
      auditId: string;
      userId: string;
    }): Promise<StoreAudit> {
      const context = await requireAuditContext(deps.resolveAuditContext, input.auditId);
      const reservation = await deps.reserveProcessingAudit({
        companyId: context.company.id,
        auditId: input.auditId,
        userId: input.userId,
      });

      if (reservation === 'user_has_active') {
        throw new AppError(409, 'You already have an active audit in progress');
      }
      if (reservation === 'already_claimed') {
        throw new AppError(409, 'Audit was already claimed');
      }
      if (reservation === 'not_found') {
        throw new AppError(404, 'Store audit not found');
      }

      try {
        await deps.processStoreAuditTenant({
          tenantDb: context.tenantDb,
          auditId: input.auditId,
          userId: input.userId,
          companyId: context.company.id,
        });
      } catch (error) {
        await deps.syncProjectionByAuditId({
          companyId: context.company.id,
          auditId: input.auditId,
        });
        throw error;
      }

      const synced = await deps.syncProjectionByAuditId({
        companyId: context.company.id,
        auditId: input.auditId,
      });

      return synced
        ? toStoreAudit(synced as unknown as Record<string, unknown>)
        : toStoreAudit(context.projection as unknown as Record<string, unknown>);
    },

    async completeAudit(input: {
      auditId: string;
      userId: string;
      payload:
        | { criteria_scores: CssCriteriaScores }
        | { productivity_rate: boolean; uniform: boolean; hygiene: boolean; sop: boolean };
    }): Promise<StoreAudit> {
      const context = await requireAuditContext(deps.resolveAuditContext, input.auditId);
      await deps.completeStoreAuditTenant({
        tenantDb: context.tenantDb,
        auditId: input.auditId,
        userId: input.userId,
        companyId: context.company.id,
        payload: input.payload,
      });

      const synced = await deps.syncProjectionByAuditId({
        companyId: context.company.id,
        auditId: input.auditId,
      });

      return synced
        ? toStoreAudit(synced as unknown as Record<string, unknown>)
        : toStoreAudit(context.projection as unknown as Record<string, unknown>);
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
