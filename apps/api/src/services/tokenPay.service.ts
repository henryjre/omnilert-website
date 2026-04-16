import type { TokenPayWallet, TokenTransaction } from '@omnilert/shared';
import { db } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import * as odoo from './odoo.service.js';
import type { OdooLoyaltyHistory } from './odoo.service.js';

// ---------------------------------------------------------------------------
// Private types
// ---------------------------------------------------------------------------

interface PendingTransactionRow {
  id: string;
  type: 'credit' | 'debit';
  title: string;
  category: 'reward' | 'purchase' | 'transfer' | 'adjustment';
  amount: string; // knex returns DECIMAL as string
  reference: string | null;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  issued_by: string | null;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// Category mapping
// ---------------------------------------------------------------------------

const ORDER_TYPE_TO_CATEGORY: Record<string, TokenTransaction['category']> = {
  'Daily Sales Quota Reward': 'reward',
  'POS Token Pay Order': 'purchase',
};

function mapOdooCategory(orderType: string): TokenTransaction['category'] {
  return ORDER_TYPE_TO_CATEGORY[orderType] ?? 'adjustment';
}

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

function normalizeOdooHistory(record: OdooLoyaltyHistory): TokenTransaction {
  // When both issued and used are 0 (voided entry), treat as a zero-value debit
  const isCredit = record.issued > 0;
  return {
    id: `odoo-${record.id}`,
    source: 'odoo',
    type: isCredit ? 'credit' : 'debit',
    title: record.x_order_type,
    category: mapOdooCategory(record.x_order_type),
    amount: Math.abs(isCredit ? record.issued : record.used),
    date: new Date(record.create_date.replace(' ', 'T') + 'Z').toISOString(),
    reference: record.x_order_reference || null,
    status: 'completed',
    issuedBy: record.x_issuer || null,
  };
}

function normalizePending(row: PendingTransactionRow): TokenTransaction {
  return {
    id: row.id,
    source: 'local',
    type: row.type,
    title: row.title,
    category: row.category,
    amount: parseFloat(row.amount),
    date: row.created_at.toISOString(),
    reference: row.reference,
    status: row.status,
    issuedBy: row.issued_by,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the user's Odoo website key, or null if the user has no Odoo link.
 * Throws 404 only if the user record itself does not exist.
 */
async function getUserKey(userId: string): Promise<string | null> {
  const knex = db.getDb();
  const user = await knex('users').select('user_key').where('id', userId).first();
  if (!user) {
    throw new AppError(404, 'User not found');
  }
  return user.user_key ?? null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function resolveOrCreateCard(userKey: string): Promise<odoo.OdooLoyaltyCard | null> {
  let card = await odoo.getTokenPayCard(userKey);
  if (card) return card;

  const partners = (await odoo.callOdooKw('res.partner', 'search_read', [], {
    domain: [['x_website_key', '=', userKey], ['active', '=', true]],
    fields: ['id'],
    limit: 1,
  })) as Array<{ id: number }>;
  if (partners.length === 0) return null;

  return odoo.createTokenPayCard(partners[0].id, userKey);
}

export async function getWallet(userId: string): Promise<TokenPayWallet> {
  const userKey = await getUserKey(userId);
  if (!userKey) {
    return { balance: 0, cardId: 0, totalEarned: 0, totalSpent: 0 };
  }
  const card = await resolveOrCreateCard(userKey);
  if (!card) {
    return { balance: 0, cardId: 0, totalEarned: 0, totalSpent: 0 };
  }
  const totals = await odoo.getTokenPayTotals(card.id);
  return { balance: card.points, cardId: card.id, ...totals };
}

export async function getTransactions(
  userId: string,
  companyId: string,
  page: number,
  limit: number,
): Promise<{
  items: TokenTransaction[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  const userKey = await getUserKey(userId);
  if (!userKey) {
    return {
      items: [],
      pagination: { page, limit, total: 0, totalPages: 0 },
    };
  }

  const card = await odoo.getTokenPayCard(userKey);
  if (!card) {
    return {
      items: [],
      pagination: { page, limit, total: 0, totalPages: 0 },
    };
  }

  const knex = db.getDb();

  // Count only status='pending' local transactions — completed/failed/cancelled local rows
  // have already been reflected in Odoo and would duplicate history entries.
  const [pendingCountResult, odooCount] = await Promise.all([
    knex('pending_transactions')
      .where({ user_id: userId, company_id: companyId, status: 'pending' })
      .count<{ count: string }>('* as count')
      .first(),
    odoo.getTokenPayHistoryCount(card.id),
  ]);

  const pendingCount = Number(pendingCountResult?.count ?? 0);
  const totalCount = pendingCount + odooCount;

  const globalOffset = (page - 1) * limit;

  let pendingRows: PendingTransactionRow[] = [];
  let odooHistory: OdooLoyaltyHistory[] = [];

  if (globalOffset < pendingCount) {
    // Fetch pending rows first (only status='pending' for consistency with count)
    pendingRows = await knex('pending_transactions')
      .select<PendingTransactionRow[]>([
        'id',
        'type',
        'title',
        'category',
        'amount',
        'reference',
        'status',
        'issued_by',
        'created_at',
      ])
      .where({ user_id: userId, company_id: companyId, status: 'pending' })
      .orderBy('created_at', 'desc')
      .offset(globalOffset)
      .limit(limit);

    const remaining = limit - pendingRows.length;
    if (remaining > 0) {
      odooHistory = await odoo.getTokenPayHistory(card.id, 0, remaining);
    }
  } else {
    // Only Odoo rows needed
    const odooOffset = globalOffset - pendingCount;
    odooHistory = await odoo.getTokenPayHistory(card.id, odooOffset, limit);
  }

  const items: TokenTransaction[] = [
    ...pendingRows.map(normalizePending),
    ...odooHistory.map(normalizeOdooHistory),
  ];

  return {
    items,
    pagination: {
      page,
      limit,
      total: totalCount,
      totalPages: Math.ceil(totalCount / Math.max(1, limit)),
    },
  };
}
