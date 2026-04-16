import type { TokenPayWallet, TokenTransaction } from '@omnilert/shared';
import { api } from '@/shared/services/api.client';

export interface TokenPayTransactionsResponse {
  data: TokenTransaction[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function fetchTokenPayWallet(): Promise<TokenPayWallet> {
  const response = await api.get<{ success: boolean; data: TokenPayWallet }>('/account/token-pay/wallet');
  return response.data.data;
}

export async function fetchTokenPayTransactions(
  page: number,
  limit = 10,
): Promise<TokenPayTransactionsResponse> {
  const response = await api.get<{ success: boolean } & TokenPayTransactionsResponse>(
    '/account/token-pay/transactions',
    { params: { page, limit } },
  );
  return { data: response.data.data, pagination: response.data.pagination };
}
