import type { CaseAttachment, CaseMessage, CaseReport } from '@omnilert/shared';
import { api } from '@/shared/services/api.client';

export type CaseReportFilters = {
  status?: 'open' | 'closed';
  search?: string;
  date_from?: string;
  date_to?: string;
  sort_order?: 'asc' | 'desc';
  vn_only?: boolean;
};

export type CaseReportDetail = CaseReport & {
  attachments: CaseAttachment[];
};

export type MentionableUser = {
  id: string;
  name: string;
  avatar_url: string | null;
};

export type MentionableRole = {
  id: string;
  name: string;
  color: string | null;
};

export async function listCaseReports(filters: CaseReportFilters) {
  const response = await api.get('/case-reports', { params: filters });
  return response.data.data as { items: CaseReport[]; total: number };
}

export async function getCaseReport(caseId: string) {
  const response = await api.get(`/case-reports/${caseId}`);
  return response.data.data as CaseReportDetail;
}

export async function createCaseReport(payload: { title: string; description: string }) {
  const response = await api.post('/case-reports', payload);
  return response.data.data as CaseReport;
}

export async function updateCorrectiveAction(caseId: string, correctiveAction: string) {
  const response = await api.patch(`/case-reports/${caseId}/corrective-action`, { correctiveAction });
  return response.data.data as CaseReportDetail;
}

export async function updateResolution(caseId: string, resolution: string) {
  const response = await api.patch(`/case-reports/${caseId}/resolution`, { resolution });
  return response.data.data as CaseReportDetail;
}

export async function closeCase(caseId: string) {
  const response = await api.post(`/case-reports/${caseId}/close`);
  return response.data.data as CaseReportDetail;
}

export async function requestViolationNotice(caseId: string) {
  const response = await api.post(`/case-reports/${caseId}/request-vn`);
  return response.data.data as CaseReportDetail;
}

export async function uploadCaseAttachment(caseId: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  const response = await api.post(`/case-reports/${caseId}/attachments`, form);
  return response.data.data as CaseAttachment;
}

export async function listCaseMessages(caseId: string) {
  const response = await api.get(`/case-reports/${caseId}/messages`);
  return response.data.data as CaseMessage[];
}

export async function sendCaseMessage(input: {
  caseId: string;
  content: string;
  parentMessageId?: string | null;
  mentionedUserIds?: string[];
  mentionedRoleIds?: string[];
  files?: File[];
}) {
  const hasFiles = (input.files?.length ?? 0) > 0;
  if (!hasFiles) {
    const response = await api.post(`/case-reports/${input.caseId}/messages`, {
      content: input.content,
      parentMessageId: input.parentMessageId ?? undefined,
      mentionedUserIds: input.mentionedUserIds ?? [],
      mentionedRoleIds: input.mentionedRoleIds ?? [],
    });
    return response.data.data as CaseMessage;
  }

  const form = new FormData();
  form.append('content', input.content);
  if (input.parentMessageId) form.append('parentMessageId', input.parentMessageId);
  form.append('mentionedUserIds', JSON.stringify(input.mentionedUserIds ?? []));
  form.append('mentionedRoleIds', JSON.stringify(input.mentionedRoleIds ?? []));
  for (const file of input.files ?? []) {
    form.append('files', file);
  }
  const response = await api.post(`/case-reports/${input.caseId}/messages`, form);
  return response.data.data as CaseMessage;
}

export async function toggleCaseReaction(caseId: string, messageId: string, emoji: string) {
  const response = await api.post(`/case-reports/${caseId}/messages/${messageId}/reactions`, { emoji });
  return response.data.data as { messageId: string; reactions: CaseMessage['reactions'] };
}

export async function leaveCaseDiscussion(caseId: string) {
  const response = await api.post(`/case-reports/${caseId}/leave`);
  return response.data.data as { is_joined: boolean };
}

export async function toggleCaseMute(caseId: string) {
  const response = await api.post(`/case-reports/${caseId}/mute`);
  return response.data.data as { is_muted: boolean };
}

export async function getMentionables() {
  const response = await api.get('/case-reports/mentionables');
  return response.data.data as { users: MentionableUser[]; roles: MentionableRole[] };
}

export async function markCaseRead(caseId: string) {
  const response = await api.post(`/case-reports/${caseId}/read`);
  return response.data.data as { last_read_at: string };
}
