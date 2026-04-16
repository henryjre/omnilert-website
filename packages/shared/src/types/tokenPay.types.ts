export interface TokenPayWallet {
  balance: number;
  cardId: number;
  totalEarned: number;
  totalSpent: number;
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
