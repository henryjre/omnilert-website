import { randomUUID } from 'node:crypto';
import type {
  CreateDiscordSystemAdjustmentInput,
  DiscordSystemAdjustmentBulkData,
  DiscordSystemAdjustmentBulkItem,
  DiscordSystemAdjustmentDirectionInput,
  DiscordSystemAdjustmentData,
} from '@omnilert/shared';
import { db } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAndDispatchNotification } from './notification.service.js';
import {
  createAutoApprovedEpiAdjustment,
  notifyAutoApprovedEpiAdjustmentTargets,
} from './autoApprovedEpiAdjustment.service.js';
import * as odoo from './odoo.service.js';

const SYSTEM_ACTOR_NAME = 'Omnilert System';
const SYSTEM_ADJUSTMENT_REASON = 'Discord system adjustment';

interface TargetUser {
  id: string;
  user_key: string | null;
}

interface TargetScope {
  companyId: string;
  branchId: string;
}

type DiscordSystemAdjustmentResult = DiscordSystemAdjustmentData;
type DiscordSystemAdjustmentResponse = DiscordSystemAdjustmentData | DiscordSystemAdjustmentBulkData;

async function resolveTargetUser(discordId: string): Promise<TargetUser> {
  const user = await db
    .getDb()('users')
    .where({
      discord_user_id: discordId,
      is_active: true,
    })
    .first<TargetUser>('id', 'user_key');

  if (!user) {
    throw new AppError(404, 'User not found for Discord ID');
  }

  return {
    id: String(user.id),
    user_key: user.user_key ? String(user.user_key) : null,
  };
}

async function resolveResidentScope(userId: string): Promise<TargetScope> {
  const rows = await db
    .getDb()('user_company_branches as ucb')
    .join('user_company_access as uca', function joinActiveCompanyAccess() {
      this.on('uca.user_id', '=', 'ucb.user_id')
        .andOn('uca.company_id', '=', 'ucb.company_id')
        .andOn('uca.is_active', '=', db.getDb().raw('true'));
    })
    .join('branches as branch', function joinActiveBranch() {
      this.on('branch.id', '=', 'ucb.branch_id')
        .andOn('branch.company_id', '=', 'ucb.company_id')
        .andOn('branch.is_active', '=', db.getDb().raw('true'));
    })
    .where({
      'ucb.user_id': userId,
      'ucb.assignment_type': 'resident',
    })
    .select<Array<{ company_id: string; branch_id: string }>>(
      'ucb.company_id',
      'ucb.branch_id',
    );

  const uniqueScopes = new Map<string, TargetScope>();
  for (const row of rows) {
    const scope = {
      companyId: String(row.company_id),
      branchId: String(row.branch_id),
    };
    uniqueScopes.set(`${scope.companyId}:${scope.branchId}`, scope);
  }

  if (uniqueScopes.size !== 1) {
    throw new AppError(409, 'Could not infer a single resident company and branch for this user');
  }

  return Array.from(uniqueScopes.values())[0]!;
}

async function resolveActiveCompanyScope(userId: string): Promise<string> {
  const residentRows = await db
    .getDb()('user_company_branches as ucb')
    .join('companies as company', 'company.id', 'ucb.company_id')
    .join('user_company_access as uca', function joinActiveCompanyAccess() {
      this.on('uca.user_id', '=', 'ucb.user_id')
        .andOn('uca.company_id', '=', 'ucb.company_id')
        .andOn('uca.is_active', '=', db.getDb().raw('true'));
    })
    .where({
      'ucb.user_id': userId,
      'ucb.assignment_type': 'resident',
    })
    .orderBy('company.name', 'asc')
    .orderBy('ucb.company_id', 'asc')
    .select<Array<{ company_id: string }>>('ucb.company_id');

  const residentCompanyIds = Array.from(new Set(
    residentRows.map((row) => String(row.company_id)),
  ));
  if (residentCompanyIds.length > 0) {
    return residentCompanyIds[0]!;
  }

  const activeRows = await db
    .getDb()('user_company_access as uca')
    .join('companies as company', 'company.id', 'uca.company_id')
    .where({
      'uca.user_id': userId,
      'uca.is_active': true,
    })
    .orderBy('company.name', 'asc')
    .orderBy('uca.company_id', 'asc')
    .select<Array<{ company_id: string }>>('uca.company_id');

  const activeCompanyIds = Array.from(new Set(
    activeRows.map((row) => String(row.company_id)),
  ));
  if (activeCompanyIds.length === 0) {
    throw new AppError(409, 'Could not infer an active company for this user');
  }

  return activeCompanyIds[0]!;
}

async function resolveOrCreateTokenPayCard(userKey: string) {
  let card = await odoo.getTokenPayCard(userKey);
  if (card) return card;

  const partners = (await odoo.callOdooKw('res.partner', 'search_read', [], {
    domain: [['x_website_key', '=', userKey], ['active', '=', true]],
    fields: ['id'],
    limit: 1,
  })) as Array<{ id: number }>;

  if (partners.length === 0) {
    throw new AppError(400, 'Odoo partner not found for target user');
  }

  card = await odoo.createTokenPayCard(partners[0].id, userKey);
  return card;
}

async function createTokenPayDeduction(input: {
  companyId: string;
  userId: string;
  userKey: string | null;
  direction: DiscordSystemAdjustmentDirectionInput;
  amount: number;
  reason: string;
}): Promise<DiscordSystemAdjustmentResult> {
  if (!input.userKey) {
    throw new AppError(400, 'Target user has no Odoo account');
  }

  const knex = db.getDb();
  const recordId = randomUUID();
  const now = new Date();

  await knex('pending_transactions').insert({
    id: recordId,
    company_id: input.companyId,
    user_id: input.userId,
    type: input.direction === 'addition' ? 'credit' : 'debit',
    title: 'Manual Adjustment',
    category: 'adjustment',
    amount: input.amount,
    reason: input.reason,
    status: 'pending',
    issued_by: SYSTEM_ACTOR_NAME,
    issued_by_user_id: null,
    created_at: now,
    updated_at: now,
  });

  const card = await resolveOrCreateTokenPayCard(input.userKey);
  const historyId = await odoo.createTokenPayHistoryEntry(card.id, {
    issued: input.direction === 'addition' ? input.amount : 0,
    used: input.direction === 'deduction' ? input.amount : 0,
    description: input.reason,
    issuerName: SYSTEM_ACTOR_NAME,
    orderReference: recordId,
    orderType: 'Manual Adjustment',
  });
  const nextPoints = input.direction === 'addition'
    ? card.points + input.amount
    : card.points - input.amount;
  await odoo.updateTokenPayCardPoints(card.id, nextPoints);

  await knex('pending_transactions').where({ id: recordId }).update({
    status: 'completed',
    resolved_at: now,
    reviewed_by: null,
    reviewed_at: now,
    odoo_history_id: historyId,
    updated_at: now,
  });

  await createAndDispatchNotification({
    userId: input.userId,
    companyId: input.companyId,
    title: input.direction === 'addition' ? 'Token Pay Added' : 'Token Pay Deducted',
    message: `${input.amount} token(s) have been ${input.direction === 'addition' ? 'added to' : 'deducted from'} your Token Pay balance.`,
    type: input.direction === 'addition' ? 'success' : 'danger',
    linkUrl: '/token-pay',
  }).catch(() => undefined);

  return {
    adjustment_type: 'token_pay',
    adjustment_direction: input.direction,
    user_id: input.userId,
    record_id: recordId,
    status: 'completed',
  };
}

async function createPayrollDeduction(input: {
  companyId: string;
  branchId: string;
  userId: string;
  direction: DiscordSystemAdjustmentDirectionInput;
  amount: number;
  reason: string;
}): Promise<DiscordSystemAdjustmentResult> {
  const knex = db.getDb();
  const now = new Date();

  const { requestId, targetId } = await knex.transaction(async (trx) => {
    const [request] = await trx('payroll_adjustment_requests')
      .insert({
        company_id: input.companyId,
        branch_id: input.branchId,
        type: input.direction === 'addition' ? 'issuance' : 'deduction',
        reason: input.reason,
        total_amount: input.amount,
        payroll_periods: 1,
        status: 'employee_approval',
        created_by_user_id: null,
        approved_by_user_id: null,
        confirmed_at: now,
        approved_at: now,
        created_at: now,
        updated_at: now,
      })
      .returning<{ id: string }[]>('id');

    const [target] = await trx('payroll_adjustment_request_targets')
      .insert({
        request_id: request.id,
        user_id: input.userId,
        allocated_total_amount: input.amount,
        allocated_monthly_amount: input.amount,
        status: 'pending',
        created_at: now,
        updated_at: now,
      })
      .returning<{ id: string }[]>('id');

    return {
      requestId: String(request.id),
      targetId: String(target.id),
    };
  });

  await createAndDispatchNotification({
    userId: input.userId,
    companyId: input.companyId,
    title: 'Payroll Adjustment Authorization Required',
    message: 'A payroll adjustment is awaiting your authorization.',
    type: input.direction === 'addition' ? 'success' : 'danger',
    linkUrl: `/account/payslip?tab=adjustments&adjustmentId=${targetId}`,
  }).catch(() => undefined);

  return {
    adjustment_type: 'payroll',
    adjustment_direction: input.direction,
    user_id: input.userId,
    record_id: requestId,
    status: 'employee_approval',
  };
}

async function createEpiDeduction(input: {
  companyId: string;
  userId: string;
  direction: DiscordSystemAdjustmentDirectionInput;
  amount: number;
  reason: string;
}): Promise<DiscordSystemAdjustmentResult> {
  const now = new Date();
  const adjustment = await db.getDb().transaction((trx) =>
    createAutoApprovedEpiAdjustment(trx, {
      companyId: input.companyId,
      createdByUserId: null,
      targetUserIds: [input.userId],
      epiDelta: input.direction === 'addition' ? input.amount : -input.amount,
      reason: input.reason,
      approvedAt: now,
    }),
  );

  if (!adjustment) {
    throw new AppError(400, 'Failed to create EPI adjustment');
  }

  await notifyAutoApprovedEpiAdjustmentTargets(adjustment).catch(() => undefined);

  return {
    adjustment_type: 'epi_adjustment',
    adjustment_direction: input.direction,
    user_id: input.userId,
    record_id: adjustment.requestId,
    status: 'approved',
  };
}

async function createSingleDiscordSystemAdjustment(input: {
  discordId: string;
  adjustmentType: CreateDiscordSystemAdjustmentInput['adjustment_type'];
  adjustmentDirection: CreateDiscordSystemAdjustmentInput['adjustment_direction'];
  amount: number;
  reason: string;
}): Promise<DiscordSystemAdjustmentResult> {
  const targetUser = await resolveTargetUser(input.discordId);
  const reason = input.reason.trim() || SYSTEM_ADJUSTMENT_REASON;

  if (input.adjustmentType === 'token_pay') {
    const companyId = await resolveActiveCompanyScope(targetUser.id);
    return createTokenPayDeduction({
      companyId,
      userId: targetUser.id,
      userKey: targetUser.user_key,
      direction: input.adjustmentDirection,
      amount: input.amount,
      reason,
    });
  }

  if (input.adjustmentType === 'payroll') {
    const scope = await resolveResidentScope(targetUser.id);
    return createPayrollDeduction({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: targetUser.id,
      direction: input.adjustmentDirection,
      amount: input.amount,
      reason,
    });
  }

  const companyId = await resolveActiveCompanyScope(targetUser.id);
  return createEpiDeduction({
    companyId,
    userId: targetUser.id,
    direction: input.adjustmentDirection,
    amount: input.amount,
    reason,
  });
}

function normalizeDiscordIds(value: string | string[]): string[] {
  const ids = Array.isArray(value) ? value : [value];
  return Array.from(new Set(ids));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to create adjustment';
}

export async function createDiscordSystemAdjustment(
  input: CreateDiscordSystemAdjustmentInput,
): Promise<DiscordSystemAdjustmentResponse> {
  const discordIds = normalizeDiscordIds(input.discord_id);
  const reason = input.reason.trim() || SYSTEM_ADJUSTMENT_REASON;

  if (!Array.isArray(input.discord_id)) {
    return createSingleDiscordSystemAdjustment({
      discordId: discordIds[0]!,
      adjustmentType: input.adjustment_type,
      adjustmentDirection: input.adjustment_direction,
      amount: input.amount,
      reason,
    });
  }

  const items: DiscordSystemAdjustmentBulkItem[] = [];
  for (const discordId of discordIds) {
    try {
      const data = await createSingleDiscordSystemAdjustment({
        discordId,
        adjustmentType: input.adjustment_type,
        adjustmentDirection: input.adjustment_direction,
        amount: input.amount,
        reason,
      });
      items.push({
        discord_id: discordId,
        success: true,
        data,
        error: null,
      });
    } catch (error) {
      items.push({
        discord_id: discordId,
        success: false,
        data: null,
        error: errorMessage(error),
      });
    }
  }

  return { items };
}
