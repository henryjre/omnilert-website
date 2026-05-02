export interface TokenPayWallet {
  balance: number;
  cardId: number;
  totalEarned: number;
  totalSpent: number;
  totalDeducted: number;
}

export interface TokenTransaction {
  id: string;
  source: 'odoo' | 'local';
  type: 'credit' | 'debit';
  title: string;
  category: 'reward' | 'purchase' | 'transfer' | 'adjustment';
  amount: number;
  date: string;
  reference: string | null;
  status: 'completed' | 'pending' | 'failed' | 'cancelled';
  issuedBy: string | null;
}

export interface TokenPayCardSummary {
  userId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  userKey: string;
  cardId: number;
  balance: number;
  totalEarned: number;
  totalSpent: number;
  totalDeducted: number;
  isSuspended: boolean;
}

export interface TokenPayIssuanceRequest {
  id: string;
  companyId: string;
  userId: string;
  userName: string;
  userAvatarUrl: string | null;
  type: 'credit' | 'debit';
  amount: number;
  reason: string;
  status: 'pending' | 'completed' | 'rejected';
  rejectionReason: string | null;
  issuedByUserId: string | null;
  issuedByName: string;
  reviewedByUserId: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  createdAt: string;
}
