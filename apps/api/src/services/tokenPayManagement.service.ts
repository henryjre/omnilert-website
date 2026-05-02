import type { TokenPayCardSummary, TokenPayIssuanceRequest, GroupedUsersResponse } from '@omnilert/shared';
import { canReviewSubmittedRequest } from '@omnilert/shared';
import { db } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import * as odoo from './odoo.service.js';
import { createAndDispatchNotification } from './notification.service.js';

// ---------------------------------------------------------------------------
// Private row types
// ---------------------------------------------------------------------------

interface PendingTxRow {
  id: string;
  company_id: string;
  user_id: string;
  type: 'credit' | 'debit';
  title: string;
  category: string;
  amount: string;
  reason: string | null;
  status: 'pending' | 'completed' | 'rejected' | 'failed' | 'cancelled';
  rejection_reason: string | null;
  issued_by: string | null;
  issued_by_user_id: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  resolved_at: Date | null;
  odoo_history_id: number | null;
  created_at: Date;
  updated_at: Date;
}

// ---------------------------------------------------------------------------
// 1. getAllWallets
// ---------------------------------------------------------------------------

export async function getAllWallets(): Promise<TokenPayCardSummary[]> {
  const knex = db.getDb();

  const users = await knex('users')
    .whereNotNull('user_key')
    .select<
      Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        avatar_url: string | null;
        user_key: string;
      }>
    >('id', 'first_name', 'last_name', 'avatar_url', 'user_key');

  const [allCards, totalsMap] = await Promise.all([
    odoo.getAllTokenPayCards(),
    odoo.getAllTokenPayTotals(),
  ]);
  const cardByUserKey = new Map<string, (typeof allCards)[number]>();
  for (const card of allCards) {
    cardByUserKey.set(card.code, card);
  }

  const summaries: TokenPayCardSummary[] = users.map((user) => {
    const card = cardByUserKey.get(user.user_key);
    if (card) {
      const totals = totalsMap.get(user.user_key) ?? { totalEarned: 0, totalSpent: 0, totalDeducted: 0 };
      return {
        userId: user.id,
        firstName: user.first_name ?? '',
        lastName: user.last_name ?? '',
        avatarUrl: user.avatar_url ?? null,
        userKey: user.user_key,
        cardId: card.id,
        balance: card.points,
        totalEarned: totals.totalEarned,
        totalSpent: totals.totalSpent,
        totalDeducted: totals.totalDeducted,
        isSuspended: !card.active,
      };
    }
    return {
      userId: user.id,
      firstName: user.first_name ?? '',
      lastName: user.last_name ?? '',
      avatarUrl: user.avatar_url ?? null,
      userKey: user.user_key,
      cardId: 0,
      balance: 0,
      totalEarned: 0,
      totalSpent: 0,
      totalDeducted: 0,
      isSuspended: false,
    };
  });

  summaries.sort((a, b) => {
    const first = a.firstName.localeCompare(b.firstName);
    if (first !== 0) return first;
    return a.lastName.localeCompare(b.lastName);
  });

  return summaries;
}

// ---------------------------------------------------------------------------
// 2. suspendAccount
// ---------------------------------------------------------------------------

export async function suspendAccount(userKey: string): Promise<void> {
  // Use getAllTokenPayCards (bypasses active_test filter) to find the card by code
  const allCards = await odoo.getAllTokenPayCards();
  const card = allCards.find((c) => c.code === userKey);
  if (!card) {
    throw new AppError(404, 'Token pay card not found for this user');
  }
  await odoo.suspendTokenPayCard(card.id);
}

// ---------------------------------------------------------------------------
// 3. unsuspendAccount
// ---------------------------------------------------------------------------

export async function unsuspendAccount(userKey: string): Promise<void> {
  // Find the card (including suspended/archived) via getAllTokenPayCards
  const allCards = await odoo.getAllTokenPayCards();
  const card = allCards.find((c) => c.code === userKey);
  if (!card) {
    throw new AppError(404, 'Token pay card not found for this user');
  }

  // Resolve Odoo partner (include inactive records)
  const partners = (await odoo.callOdooKw('res.partner', 'search_read', [], {
    domain: [['x_website_key', '=', userKey], ['active', 'in', [true, false]]],
    fields: ['id'],
    limit: 1,
  })) as Array<{ id: number }>;

  if (partners.length === 0) {
    throw new AppError(404, 'Odoo partner not found for this user');
  }

  await odoo.unsuspendTokenPayCard(card.id, partners[0].id);
}

// ---------------------------------------------------------------------------
// 4. createIssuanceRequest
// ---------------------------------------------------------------------------

export async function createIssuanceRequest(params: {
  companyId: string;
  targetUserId: string;
  issuedByUserId: string;
  issuedByName: string;
  type: 'credit' | 'debit';
  amount: number;
  reason: string;
}): Promise<{ id: string }> {
  const knex = db.getDb();
  const [row] = await knex('pending_transactions')
    .insert({
      company_id: params.companyId,
      user_id: params.targetUserId,
      type: params.type,
      title: 'Manual Adjustment',
      category: 'adjustment',
      amount: params.amount,
      reason: params.reason,
      status: 'pending',
      issued_by: params.issuedByName,
      issued_by_user_id: params.issuedByUserId,
    })
    .returning('id');
  return { id: String(row.id) };
}

// ---------------------------------------------------------------------------
// 5. listIssuanceRequests
// ---------------------------------------------------------------------------

export async function listIssuanceRequests(
  companyId: string,
  status: string | undefined,
  page: number,
  limit: number,
): Promise<{
  items: TokenPayIssuanceRequest[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  const knex = db.getDb();

  const baseQuery = () => {
    let q = knex('pending_transactions as pt')
      .where('pt.company_id', companyId)
      .andWhere('pt.category', 'adjustment');
    if (status) {
      q = q.andWhere('pt.status', status);
    }
    return q;
  };

  const countResult = await baseQuery()
    .count<{ count: string }>('* as count')
    .first();
  const total = Number(countResult?.count ?? 0);

  const rows = await baseQuery()
    .leftJoin('users as target', 'pt.user_id', 'target.id')
    .leftJoin('users as issuer', 'pt.issued_by_user_id', 'issuer.id')
    .leftJoin('users as reviewer', 'pt.reviewed_by', 'reviewer.id')
    .select(
      'pt.id',
      'pt.company_id',
      'pt.user_id',
      knex.raw(`COALESCE(target.first_name, '') || ' ' || COALESCE(target.last_name, '') as user_name`),
      'target.avatar_url as user_avatar_url',
      'pt.type',
      'pt.amount',
      'pt.reason',
      'pt.status',
      'pt.rejection_reason',
      'pt.issued_by_user_id',
      'pt.issued_by',
      'pt.reviewed_by as reviewed_by_user_id',
      knex.raw(
        `COALESCE(reviewer.first_name, '') || ' ' || COALESCE(reviewer.last_name, '') as reviewed_by_name`,
      ),
      'pt.reviewed_at',
      'pt.created_at',
    )
    .orderBy('pt.created_at', 'desc')
    .offset((page - 1) * limit)
    .limit(limit);

  const items: TokenPayIssuanceRequest[] = (rows as any[]).map((row) => ({
    id: String(row.id),
    companyId: String(row.company_id),
    userId: String(row.user_id),
    userName: String(row.user_name ?? '').trim(),
    userAvatarUrl: (row.user_avatar_url as string | null) ?? null,
    type: row.type as 'credit' | 'debit',
    amount: parseFloat(String(row.amount)),
    reason: (row.reason as string | null) ?? '',
    status: row.status as 'pending' | 'completed' | 'rejected',
    rejectionReason: (row.rejection_reason as string | null) ?? null,
    issuedByUserId: row.issued_by_user_id ? String(row.issued_by_user_id) : null,
    issuedByName: String(row.issued_by ?? ''),
    reviewedByUserId: row.reviewed_by_user_id ? String(row.reviewed_by_user_id) : null,
    reviewedByName: row.reviewed_by_user_id
      ? String(row.reviewed_by_name ?? '').trim() || null
      : row.status === 'completed' && row.issued_by === 'Omnilert System'
        ? 'Omnilert System'
        : null,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at as Date).toISOString() : null,
    createdAt: new Date(row.created_at as Date).toISOString(),
  }));

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / Math.max(1, limit)),
    },
  };
}

// ---------------------------------------------------------------------------
// 6. approveIssuanceRequest
// ---------------------------------------------------------------------------

export async function approveIssuanceRequest(
  requestId: string,
  approverId: string,
): Promise<void> {
  const knex = db.getDb();

  const row = await knex('pending_transactions')
    .where('id', requestId)
    .first<PendingTxRow>();
  if (!row) {
    throw new AppError(404, 'Issuance request not found');
  }

  if (!canReviewSubmittedRequest({ actingUserId: approverId, requestUserId: row.issued_by_user_id })) {
    throw new AppError(403, 'You cannot approve your own request');
  }

  if (row.status !== 'pending') {
    throw new AppError(400, 'Request is already resolved');
  }

  // Get target user's user_key
  const targetUser = await knex('users')
    .where('id', row.user_id)
    .select('user_key')
    .first<{ user_key: string | null }>();
  if (!targetUser?.user_key) {
    throw new AppError(400, 'Target user has no Odoo account');
  }

  const userKey = targetUser.user_key;

  // Resolve or create loyalty card
  let card = await odoo.getTokenPayCard(userKey);
  if (!card) {
    const partners = (await odoo.callOdooKw('res.partner', 'search_read', [], {
      domain: [['x_website_key', '=', userKey], ['active', '=', true]],
      fields: ['id'],
      limit: 1,
    })) as Array<{ id: number }>;
    if (partners.length === 0) {
      throw new AppError(400, 'Odoo partner not found for target user');
    }
    card = await odoo.createTokenPayCard(partners[0].id, userKey);
  }

  const amount = parseFloat(String(row.amount));
  const newPoints = row.type === 'credit'
    ? card.points + amount
    : card.points - amount;

  const historyId = await odoo.createTokenPayHistoryEntry(card.id, {
    issued: row.type === 'credit' ? amount : 0,
    used: row.type === 'debit' ? amount : 0,
    description: row.reason ?? 'Manual Adjustment',
    issuerName: row.issued_by ?? '',
    orderReference: requestId,
    orderType: 'Manual Adjustment',
  });
  await odoo.updateTokenPayCardPoints(card.id, newPoints);

  const now = new Date();
  await knex('pending_transactions').where('id', requestId).update({
    status: 'completed',
    resolved_at: now,
    reviewed_by: approverId,
    reviewed_at: now,
    odoo_history_id: historyId,
    updated_at: now,
  });

  // Notify target user
  try {
    await createAndDispatchNotification({
      userId: row.user_id,
      companyId: row.company_id,
      title: 'Token Pay Adjustment Approved',
      message: `Your Token Pay ${row.type === 'credit' ? 'credit' : 'debit'} request for ${amount} token(s) has been approved.`,
      type: 'success',
      linkUrl: '/token-pay',
    });
  } catch {
    // Non-critical — log but don't fail
  }
}

// ---------------------------------------------------------------------------
// 7. rejectIssuanceRequest
// ---------------------------------------------------------------------------

export async function rejectIssuanceRequest(
  requestId: string,
  approverId: string,
  reason: string,
): Promise<void> {
  const knex = db.getDb();

  const row = await knex('pending_transactions')
    .where('id', requestId)
    .first<PendingTxRow>();
  if (!row) {
    throw new AppError(404, 'Issuance request not found');
  }

  if (!canReviewSubmittedRequest({ actingUserId: approverId, requestUserId: row.issued_by_user_id })) {
    throw new AppError(403, 'You cannot reject your own request');
  }

  if (row.status !== 'pending') {
    throw new AppError(400, 'Request is already resolved');
  }

  const now = new Date();
  await knex('pending_transactions').where('id', requestId).update({
    status: 'rejected',
    rejection_reason: reason,
    reviewed_by: approverId,
    reviewed_at: now,
    resolved_at: now,
    updated_at: now,
  });

  // Notify the issuing user (if applicable)
  if (row.issued_by_user_id) {
    try {
      await createAndDispatchNotification({
        userId: row.issued_by_user_id,
        companyId: row.company_id,
        title: 'Token Pay Adjustment Rejected',
        message: `Your Token Pay adjustment request has been rejected. Reason: ${reason}`,
        type: 'warning',
        linkUrl: '/token-pay',
      });
    } catch {
      // Non-critical
    }
  }
}

// ---------------------------------------------------------------------------
// 8. getGroupedUsers
// ---------------------------------------------------------------------------

export async function getGroupedUsers(companyId: string): Promise<GroupedUsersResponse> {
  const { getGroupedUsersForVN } = await import('./violationNotice.service.js');
  const [grouped, wallets] = await Promise.all([
    getGroupedUsersForVN({ companyId }),
    getAllWallets(),
  ]);
  const suspended_user_ids = wallets
    .filter((w) => w.isSuspended)
    .map((w) => w.userId);
  return { ...grouped, suspended_user_ids };
}
