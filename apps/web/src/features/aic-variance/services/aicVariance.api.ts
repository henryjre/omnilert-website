import type { AicRecord, AicProduct, AicMessage, AicTask, AicTaskMessage } from '@omnilert/shared';
import { api } from '@/shared/services/api.client';

type ApiResponse<T> = { success: boolean; data: T };

export type AicRecordDetail = AicRecord & { products: AicProduct[] };

export type AicFilters = {
  status?: 'open' | 'resolved';
  search?: string;
  date_from?: string;
  date_to?: string;
  sort_order?: 'asc' | 'desc';
};

export type MentionableUser = { id: string; name: string; avatar_url: string | null };
export type MentionableRole = { id: string; name: string; color: string | null };

export async function listAicRecords(filters: AicFilters) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.search) params.set('search', filters.search);
  if (filters.date_from) params.set('date_from', filters.date_from);
  if (filters.date_to) params.set('date_to', filters.date_to);
  if (filters.sort_order) params.set('sort_order', filters.sort_order);

  const qs = params.toString();
  const res = await api.get<ApiResponse<{ items: AicRecord[]; total: number }>>(`/aic-variance${qs ? `?${qs}` : ''}`);
  return res.data.data;
}

export async function getAicRecord(aicId: string) {
  const res = await api.get<ApiResponse<AicRecordDetail>>(`/aic-variance/${aicId}`);
  return res.data.data;
}

export async function getMentionables() {
  const res = await api.get<ApiResponse<{ users: MentionableUser[]; roles: MentionableRole[] }>>('/aic-variance/mentionables');
  return res.data.data;
}

export async function resolveAicRecord(aicId: string) {
  const res = await api.post<ApiResponse<AicRecordDetail>>(`/aic-variance/${aicId}/resolve`);
  return res.data.data;
}

export async function requestViolationNotice(aicId: string, payload: { description: string; targetUserIds: string[] }) {
  const res = await api.post<ApiResponse<AicRecordDetail>>(`/aic-variance/${aicId}/request-vn`, payload);
  return res.data.data;
}

export async function leaveAicDiscussion(aicId: string) {
  await api.post(`/aic-variance/${aicId}/leave`);
}

export async function toggleAicMute(aicId: string) {
  const res = await api.post<ApiResponse<{ is_muted: boolean }>>(`/aic-variance/${aicId}/mute`);
  return res.data.data;
}

export async function markAicRead(aicId: string) {
  await api.post(`/aic-variance/${aicId}/read`);
}

export async function listAicMessages(aicId: string) {
  const res = await api.get<ApiResponse<AicMessage[]>>(`/aic-variance/${aicId}/messages`);
  return res.data.data;
}

export async function sendAicMessage(
  aicId: string,
  payload: {
    content: string;
    parentMessageId?: string | null;
    mentionedUserIds?: string[];
    mentionedRoleIds?: string[];
    files?: File[];
  },
) {
  const formData = new FormData();
  formData.append('content', payload.content);
  if (payload.parentMessageId) formData.append('parentMessageId', payload.parentMessageId);
  if (payload.mentionedUserIds?.length) {
    payload.mentionedUserIds.forEach((id) => formData.append('mentionedUserIds[]', id));
  }
  if (payload.mentionedRoleIds?.length) {
    payload.mentionedRoleIds.forEach((id) => formData.append('mentionedRoleIds[]', id));
  }
  if (payload.files?.length) {
    payload.files.forEach((f) => formData.append('files', f));
  }
  const res = await api.postForm<ApiResponse<AicMessage[]>>(`/aic-variance/${aicId}/messages`, formData);
  return res.data.data;
}

export async function editAicMessage(aicId: string, messageId: string, content: string) {
  await api.patch(`/aic-variance/${aicId}/messages/${messageId}`, { content });
}

export async function deleteAicMessage(aicId: string, messageId: string) {
  await api.delete(`/aic-variance/${aicId}/messages/${messageId}`);
}

export async function toggleAicReaction(aicId: string, messageId: string, emoji: string) {
  await api.post(`/aic-variance/${aicId}/messages/${messageId}/reactions`, { emoji });
}

export async function listAicTasks(aicId: string) {
  const res = await api.get<ApiResponse<AicTask[]>>(`/aic-variance/${aicId}/tasks`);
  return res.data.data;
}

export async function createAicTask(
  aicId: string,
  payload: { description: string; assigneeUserIds: string[]; sourceMessageId?: string },
) {
  const res = await api.post<ApiResponse<AicTask>>(`/aic-variance/${aicId}/tasks`, payload);
  return res.data.data;
}

export async function getAicTask(aicId: string, taskId: string) {
  const res = await api.get<ApiResponse<AicTask>>(`/aic-variance/${aicId}/tasks/${taskId}`);
  return res.data.data;
}

export async function listAicTaskMessages(aicId: string, taskId: string) {
  const res = await api.get<ApiResponse<AicTaskMessage[]>>(`/aic-variance/${aicId}/tasks/${taskId}/messages`);
  return res.data.data;
}

export async function sendAicTaskMessage(
  aicId: string,
  taskId: string,
  payload: { content?: string; files?: File[]; parentMessageId?: string; mentionedUserIds?: string[]; mentionedRoleIds?: string[] },
) {
  const formData = new FormData();
  if (payload.content) formData.append('content', payload.content);
  if (payload.parentMessageId) formData.append('parentMessageId', payload.parentMessageId);
  if (payload.files?.length) payload.files.forEach((f) => formData.append('files', f));
  const res = await api.postForm<ApiResponse<AicTaskMessage>>(`/aic-variance/${aicId}/tasks/${taskId}/messages`, formData);
  return res.data.data;
}

export async function completeAicTask(aicId: string, taskId: string, userId?: string) {
  const res = await api.post<ApiResponse<AicTask>>(`/aic-variance/${aicId}/tasks/${taskId}/complete`, userId ? { userId } : {});
  return res.data.data;
}

export async function toggleAicTaskReaction(aicId: string, taskId: string, messageId: string, emoji: string) {
  await api.post(`/aic-variance/${aicId}/tasks/${taskId}/messages/${messageId}/reactions`, { emoji });
}
