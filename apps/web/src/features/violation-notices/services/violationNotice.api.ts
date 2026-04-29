import type {
  ViolationNotice,
  ViolationNoticeDetail,
  ViolationNoticeMessage,
  GroupedUsersResponse,
} from '@omnilert/shared';
import { api } from '@/shared/services/api.client';

export interface ViolationNoticeFilters {
  status?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
  sort_order?: 'asc' | 'desc';
  category?: 'manual' | 'case_reports' | 'store_audits' | 'aic_variance';
  target_user_id?: string;
}

export async function listViolationNotices(filters?: ViolationNoticeFilters): Promise<ViolationNotice[]> {
  const response = await api.get('/violation-notices', { params: filters });
  return response.data.data as ViolationNotice[];
}

export async function getViolationNotice(vnId: string): Promise<ViolationNoticeDetail> {
  const response = await api.get(`/violation-notices/${vnId}`);
  return response.data.data as ViolationNoticeDetail;
}

export async function createViolationNotice(payload: {
  description: string;
  targetUserIds: string[];
  branchId: string | null;
}): Promise<ViolationNotice> {
  const response = await api.post('/violation-notices', payload);
  return response.data.data as ViolationNotice;
}

export async function confirmVN(vnId: string): Promise<ViolationNotice> {
  const response = await api.post(`/violation-notices/${vnId}/confirm`);
  return response.data.data as ViolationNotice;
}

export async function rejectVN(vnId: string, rejectionReason: string): Promise<ViolationNotice> {
  const response = await api.post(`/violation-notices/${vnId}/reject`, { rejectionReason });
  return response.data.data as ViolationNotice;
}

export async function issueVN(vnId: string): Promise<ViolationNotice> {
  const response = await api.post(`/violation-notices/${vnId}/issue`);
  return response.data.data as ViolationNotice;
}

export async function completeVN(vnId: string, epiDecrease: number): Promise<ViolationNotice> {
  const response = await api.post(`/violation-notices/${vnId}/complete`, { epiDecrease });
  return response.data.data as ViolationNotice;
}

export async function confirmIssuance(vnId: string): Promise<ViolationNotice> {
  const response = await api.post(`/violation-notices/${vnId}/confirm-issuance`);
  return response.data.data as ViolationNotice;
}

export async function uploadIssuanceFile(vnId: string, file: File): Promise<ViolationNotice> {
  const form = new FormData();
  form.append('file', file);
  const response = await api.post(`/violation-notices/${vnId}/issuance-upload`, form);
  return response.data.data as ViolationNotice;
}

export async function uploadDisciplinaryFile(vnId: string, file: File): Promise<ViolationNotice> {
  const form = new FormData();
  form.append('file', file);
  const response = await api.post(`/violation-notices/${vnId}/disciplinary-upload`, form);
  return response.data.data as ViolationNotice;
}

export async function listVNMessages(vnId: string): Promise<ViolationNoticeMessage[]> {
  const response = await api.get(`/violation-notices/${vnId}/messages`);
  return response.data.data as ViolationNoticeMessage[];
}

export async function sendVNMessage(
  vnId: string,
  payload: {
    content: string;
    parentMessageId?: string;
    mentionedUserIds?: string[];
    mentionedRoleIds?: string[];
    files?: File[];
  }
): Promise<ViolationNoticeMessage> {
  const hasFiles = (payload.files?.length ?? 0) > 0;
  if (!hasFiles) {
    const response = await api.post(`/violation-notices/${vnId}/messages`, {
      content: payload.content,
      parentMessageId: payload.parentMessageId ?? undefined,
      mentionedUserIds: payload.mentionedUserIds ?? [],
      mentionedRoleIds: payload.mentionedRoleIds ?? [],
    });
    return response.data.data as ViolationNoticeMessage;
  }

  const form = new FormData();
  form.append('content', payload.content);
  if (payload.parentMessageId) form.append('parentMessageId', payload.parentMessageId);
  form.append('mentionedUserIds', JSON.stringify(payload.mentionedUserIds ?? []));
  form.append('mentionedRoleIds', JSON.stringify(payload.mentionedRoleIds ?? []));
  for (const file of payload.files ?? []) {
    form.append('files', file);
  }
  const response = await api.post(`/violation-notices/${vnId}/messages`, form);
  return response.data.data as ViolationNoticeMessage;
}

export async function editVNMessage(
  vnId: string,
  messageId: string,
  content: string
): Promise<ViolationNoticeMessage> {
  const response = await api.patch(`/violation-notices/${vnId}/messages/${messageId}`, { content });
  return response.data.data as ViolationNoticeMessage;
}

export async function deleteVNMessage(vnId: string, messageId: string): Promise<void> {
  await api.delete(`/violation-notices/${vnId}/messages/${messageId}`);
}

export async function toggleVNReaction(vnId: string, messageId: string, emoji: string): Promise<void> {
  await api.post(`/violation-notices/${vnId}/messages/${messageId}/reactions`, { emoji });
}

export async function markVNRead(vnId: string): Promise<void> {
  await api.post(`/violation-notices/${vnId}/read`);
}

export async function leaveVNDiscussion(vnId: string): Promise<{ is_joined: boolean }> {
  const response = await api.post(`/violation-notices/${vnId}/leave`);
  return response.data.data as { is_joined: boolean };
}

export async function toggleVNMute(vnId: string): Promise<{ is_muted: boolean }> {
  const response = await api.post(`/violation-notices/${vnId}/mute`);
  return response.data.data as { is_muted: boolean };
}

export async function getVNMentionables(): Promise<{
  users: Array<{ id: string; name: string; avatar_url: string | null }>;
  roles: Array<{ id: string; name: string; color: string | null }>;
}> {
  const response = await api.get('/violation-notices/mentionables');
  return response.data.data as {
    users: Array<{ id: string; name: string; avatar_url: string | null }>;
    roles: Array<{ id: string; name: string; color: string | null }>;
  };
}

export async function getGroupedUsers(params?: {
  auditId?: string;
  companyId?: string;
  caseId?: string;
  aicRecordId?: string;
  allCompanies?: boolean;
}): Promise<GroupedUsersResponse> {
  const response = await api.get('/violation-notices/grouped-users', {
    params: params ?? undefined,
  });
  return response.data.data as GroupedUsersResponse;
}

export async function createVNFromCaseReport(payload: {
  caseId: string;
  description: string;
  targetUserIds: string[];
}): Promise<ViolationNotice> {
  const response = await api.post('/violation-notices/from-case-report', payload);
  return response.data.data as ViolationNotice;
}

export async function createVNFromStoreAudit(payload: {
  auditId: string;
  description: string;
  targetUserIds: string[];
}): Promise<ViolationNotice> {
  const response = await api.post('/violation-notices/from-store-audit', payload);
  return response.data.data as ViolationNotice;
}

export async function createVNFromAicRecord(payload: {
  aicRecordId: string;
  description: string;
  targetUserIds: string[];
}): Promise<ViolationNotice> {
  const response = await api.post('/violation-notices/from-aic-record', payload);
  return response.data.data as ViolationNotice;
}
