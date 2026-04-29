import type { UnifiedMyTask } from '@omnilert/shared';
import { listMyTasks } from './caseReportTask.service.js';
import { listMyAicTasks } from './aicVarianceTask.service.js';

export async function listAllMyTasks(input: {
  userId: string;
  companyId: string;
}): Promise<UnifiedMyTask[]> {
  const [caseTasks, aicTasks] = await Promise.all([
    listMyTasks(input),
    listMyAicTasks(input),
  ]);

  const unified: UnifiedMyTask[] = [
    ...caseTasks.map((t): UnifiedMyTask => ({
      source: 'case_report',
      id: t.id,
      description: t.description,
      parent_id: t.case_id,
      parent_label: `Case #${String(t.case_number).padStart(4, '0')}`,
      parent_title: t.case_title,
      assignees: t.assignees.map((a) => ({
        id: a.id,
        task_id: a.task_id,
        user_id: a.user_id,
        user_name: a.user_name,
        user_avatar: a.user_avatar,
        completed_at: a.completed_at,
        completed_by: a.completed_by,
        completed_by_name: a.completed_by_name,
      })),
      created_by: t.created_by,
      created_by_name: t.created_by_name,
      created_at: t.created_at,
      updated_at: t.updated_at,
      last_message_at: t.last_message_at,
      last_message_content: t.last_message_content,
      last_message_user_name: t.last_message_user_name,
      last_message_user_avatar: t.last_message_user_avatar,
      message_count: t.message_count,
    })),
    ...aicTasks.map((t): UnifiedMyTask => ({
      source: 'aic_variance',
      id: t.id,
      description: t.description,
      parent_id: t.aic_record_id,
      parent_label: `AIC #${String(t.aic_number).padStart(4, '0')}`,
      parent_title: t.aic_reference,
      assignees: t.assignees.map((a) => ({
        id: a.id,
        task_id: a.task_id,
        user_id: a.user_id,
        user_name: a.user_name,
        user_avatar: a.user_avatar,
        completed_at: a.completed_at,
        completed_by: a.completed_by,
        completed_by_name: a.completed_by_name,
      })),
      created_by: t.created_by,
      created_by_name: t.created_by_name,
      created_at: t.created_at,
      updated_at: t.updated_at,
      last_message_at: t.last_message_at,
      last_message_content: t.last_message_content,
      last_message_user_name: t.last_message_user_name,
      last_message_user_avatar: t.last_message_user_avatar,
      message_count: t.message_count,
    })),
  ];

  unified.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return unified;
}
