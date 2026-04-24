export interface CaseTask {
  id: string;
  case_id: string;
  created_by: string | null;
  created_by_name: string | null;
  source_message_id: string | null;
  source_message_content: string | null;
  source_message_user_name: string | null;
  description: string;
  discussion_message_id: string | null;
  assignees: CaseTaskAssignee[];
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
}

export interface CaseTaskAssignee {
  id: string;
  task_id: string;
  user_id: string;
  user_name: string | null;
  user_avatar: string | null;
  completed_at: string | null;
  completed_by: string | null;
  completed_by_name: string | null;
}

export interface CaseTaskMessage {
  id: string;
  task_id: string;
  user_id: string | null;
  user_name: string | null;
  user_avatar: string | null;
  content: string;
  created_at: string;
}
