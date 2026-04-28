import type { CaseAttachment, CaseMessage, CaseReport, CaseTask, CaseTaskMessage } from '@omnilert/shared';
import { api } from '@/shared/services/api.client';
import type { SelectorCompanySnapshot } from '@/shared/components/branchSelectorState';

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

export interface MyTask extends CaseTask {
  case_number: number;
  case_title: string;
}

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

export async function listCreateCaseReportBranches() {
  const response = await api.get('/case-reports/create-branches');
  return response.data.data as SelectorCompanySnapshot[];
}

export async function createCaseReport(payload: {
  title: string;
  description: string;
  companyId?: string | null;
  branchId?: string | null;
}) {
  const response = await api.post(
    '/case-reports',
    {
      title: payload.title,
      description: payload.description,
      branchId: payload.branchId ?? null,
    },
    payload.companyId
      ? {
          headers: { 'X-Company-Id': payload.companyId },
        }
      : undefined,
  );
  return response.data.data as CaseReport;
}

export async function closeCase(caseId: string) {
  const response = await api.post(`/case-reports/${caseId}/close`);
  return response.data.data as CaseReportDetail;
}

export async function requestViolationNotice(
  caseId: string,
  payload: { description: string; targetUserIds: string[] }
): Promise<CaseReportDetail> {
  const response = await api.post(`/case-reports/${caseId}/request-vn`, payload);
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

export async function deleteCaseAttachment(caseId: string, attachmentId: string): Promise<void> {
  await api.delete(`/case-reports/${caseId}/attachments/${attachmentId}`);
}

export async function editCaseMessage(caseId: string, messageId: string, content: string): Promise<CaseMessage> {
  const response = await api.patch(`/case-reports/${caseId}/messages/${messageId}`, { content });
  return response.data.data as CaseMessage;
}

export async function deleteCaseMessage(caseId: string, messageId: string): Promise<void> {
  await api.delete(`/case-reports/${caseId}/messages/${messageId}`);
}

// ── Task API ──────────────────────────────────────────────────────────────────

export async function listCaseTasks(caseId: string): Promise<CaseTask[]> {
  const response = await api.get(`/case-reports/${caseId}/tasks`);
  return response.data.data as CaseTask[];
}

export async function createCaseTask(
  caseId: string,
  payload: { description: string; assigneeUserIds: string[]; sourceMessageId?: string | null },
): Promise<CaseTask> {
  const response = await api.post(`/case-reports/${caseId}/tasks`, payload);
  return response.data.data as CaseTask;
}

export async function getCaseTask(caseId: string, taskId: string): Promise<CaseTask> {
  const response = await api.get(`/case-reports/${caseId}/tasks/${taskId}`);
  return response.data.data as CaseTask;
}

export async function listCaseTaskMessages(caseId: string, taskId: string): Promise<CaseTaskMessage[]> {
  const response = await api.get(`/case-reports/${caseId}/tasks/${taskId}/messages`);
  return response.data.data as CaseTaskMessage[];
}

export async function sendCaseTaskMessage(
  caseId: string,
  taskId: string,
  input: {
    content: string;
    files?: File[];
    parentMessageId?: string | null;
    mentionedUserIds?: string[];
    mentionedRoleIds?: string[];
  },
): Promise<CaseTaskMessage> {
  const hasFiles = (input.files?.length ?? 0) > 0;
  if (!hasFiles) {
    const response = await api.post(`/case-reports/${caseId}/tasks/${taskId}/messages`, {
      content: input.content,
      parentMessageId: input.parentMessageId ?? undefined,
      mentionedUserIds: input.mentionedUserIds ?? [],
      mentionedRoleIds: input.mentionedRoleIds ?? [],
    });
    return response.data.data as CaseTaskMessage;
  }

  const form = new FormData();
  if (input.content) form.append('content', input.content);
  if (input.parentMessageId) form.append('parentMessageId', input.parentMessageId);
  form.append('mentionedUserIds', JSON.stringify(input.mentionedUserIds ?? []));
  form.append('mentionedRoleIds', JSON.stringify(input.mentionedRoleIds ?? []));
  for (const file of input.files ?? []) {
    form.append('files', file);
  }
  const response = await api.post(`/case-reports/${caseId}/tasks/${taskId}/messages`, form);
  return response.data.data as CaseTaskMessage;
}

export async function toggleTaskReaction(
  caseId: string,
  taskId: string,
  messageId: string,
  emoji: string,
): Promise<{ messageId: string; reactions: CaseTaskMessage['reactions'] }> {
  const response = await api.post(
    `/case-reports/${caseId}/tasks/${taskId}/messages/${messageId}/reactions`,
    { emoji },
  );
  return response.data.data;
}

export async function completeCaseTask(
  caseId: string,
  taskId: string,
  userId?: string,
): Promise<CaseTask> {
  const response = await api.post(`/case-reports/${caseId}/tasks/${taskId}/complete`, { userId });
  return response.data.data as CaseTask;
}

export async function getMyTasks(companyId?: string): Promise<MyTask[]> {
  const response = await api.get(
    '/account/tasks/me',
    companyId ? { headers: { 'X-Company-Id': companyId } } : undefined,
  );
  return response.data.data as MyTask[];
}
