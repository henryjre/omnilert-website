import { api } from '@/shared/services/api.client';
import type {
  GroupedUsersResponse,
  RewardRequestDetail,
  RewardRequestListResponse,
} from '@omnilert/shared';

function companyHeaders(companyId?: string | null) {
  return companyId
    ? {
        'X-Company-Id': companyId,
      }
    : undefined;
}

export async function fetchRewardRequests(params: {
  companyId?: string | null;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<RewardRequestListResponse> {
  const { companyId, ...queryParams } = params;
  const res = await api.get<{ success: boolean; data: RewardRequestListResponse }>('/rewards', {
    params: queryParams,
    headers: companyHeaders(companyId),
  });
  return res.data.data;
}

export async function fetchRewardRequestDetail(
  id: string,
  companyId?: string | null,
): Promise<RewardRequestDetail> {
  const res = await api.get<{ success: boolean; data: RewardRequestDetail }>(`/rewards/${id}`, {
    headers: companyHeaders(companyId),
  });
  return res.data.data;
}

export async function createRewardRequest(params: {
  companyId?: string | null;
  body: {
    targetUserIds: string[];
    epiDelta: number;
    reason: string;
  };
}): Promise<{ id: string }> {
  const res = await api.post<{ success: boolean; data: { id: string } }>(
    '/rewards',
    params.body,
    {
      headers: companyHeaders(params.companyId),
    },
  );
  return res.data.data;
}

export async function approveRewardRequest(
  id: string,
  companyId?: string | null,
): Promise<RewardRequestDetail> {
  const res = await api.post<{ success: boolean; data: RewardRequestDetail }>(
    `/rewards/${id}/approve`,
    {},
    {
      headers: companyHeaders(companyId),
    },
  );
  return res.data.data;
}

export async function rejectRewardRequest(
  id: string,
  rejectionReason: string,
  companyId?: string | null,
): Promise<RewardRequestDetail> {
  const res = await api.post<{ success: boolean; data: RewardRequestDetail }>(
    `/rewards/${id}/reject`,
    {
      rejectionReason,
    },
    {
      headers: companyHeaders(companyId),
    },
  );
  return res.data.data;
}

export async function fetchRewardGroupedUsers(companyId?: string | null): Promise<GroupedUsersResponse> {
  const res = await api.get<{ success: boolean; data: GroupedUsersResponse }>(
    '/rewards/grouped-users',
    {
      headers: companyHeaders(companyId),
    },
  );
  return res.data.data;
}
