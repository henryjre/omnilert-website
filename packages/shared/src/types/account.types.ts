export interface UnifiedMyTaskAssignee {
  id: string;
  task_id: string;
  user_id: string;
  user_name: string | null;
  user_avatar: string | null;
  completed_at: string | null;
  completed_by: string | null;
  completed_by_name: string | null;
}

export type MyTaskSource = 'case_report' | 'aic_variance';

export interface UnifiedMyTask {
  source: MyTaskSource;
  id: string;
  description: string;
  parent_id: string;
  parent_label: string;
  parent_title: string;
  assignees: UnifiedMyTaskAssignee[];
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  last_message_content: string | null;
  last_message_user_name: string | null;
  last_message_user_avatar: string | null;
  message_count: number;
}
