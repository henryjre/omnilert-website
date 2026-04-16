import { api } from '@/shared/services/api.client';
import type { TokenPayCardSummary, TokenPayIssuanceRequest, GroupedUsersResponse } from '@omnilert/shared';

export async function fetchAllWallets(): Promise<TokenPayCardSummary[]> {
  const res = await api.get('/token-pay');
  return res.data.data as TokenPayCardSummary[];
}

export async function fetchWalletDetail(userId: string, page = 1, limit = 10): Promise<{
  wallet: { balance: number; cardId: number; totalEarned: number; totalSpent: number };
  transactions: { items: any[]; pagination: { page: number; limit: number; total: number; totalPages: number } };
}> {
  const res = await api.get(`/token-pay/${userId}`, { params: { page, limit } });
  return res.data.data;
}

export async function suspendAccount(userId: string): Promise<void> {
  await api.post(`/token-pay/${userId}/suspend`);
}

export async function unsuspendAccount(userId: string): Promise<void> {
  await api.post(`/token-pay/${userId}/unsuspend`);
}

export async function fetchIssuanceRequests(params: { status?: string; page?: number; limit?: number }): Promise<{
  items: TokenPayIssuanceRequest[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}> {
  const res = await api.get('/token-pay/issuances', { params });
  return res.data.data;
}

export async function createIssuanceRequest(body: {
  targetUserId: string;
  type: 'credit' | 'debit';
  amount: number;
  reason: string;
}): Promise<{ id: string }> {
  const res = await api.post('/token-pay/issuances', body);
  return res.data.data;
}

export async function approveIssuance(id: string): Promise<void> {
  await api.post(`/token-pay/issuances/${id}/approve`);
}

export async function rejectIssuance(id: string, reason: string): Promise<void> {
  await api.post(`/token-pay/issuances/${id}/reject`, { reason });
}

export async function fetchGroupedUsers(): Promise<GroupedUsersResponse> {
  const res = await api.get('/token-pay/grouped-users');
  return res.data.data as GroupedUsersResponse;
}
