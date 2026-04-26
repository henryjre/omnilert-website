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
  last_message_content: string | null;
  last_message_user_name: string | null;
  last_message_user_avatar: string | null;
  message_count: number;
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

export interface CaseTaskReaction {
  emoji: string;
  users: { id: string; name: string }[];
}

export interface CaseTaskMention {
  id: string;
  message_id: string;
  mentioned_user_id: string | null;
  mentioned_role_id: string | null;
  mentioned_name: string | null;
}

export interface CaseTaskMessage {
  id: string;
  task_id: string;
  user_id: string | null;
  user_name: string | null;
  user_avatar: string | null;
  content: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  content_type: string | null;
  parent_message_id: string | null;
  reactions: CaseTaskReaction[];
  mentions: CaseTaskMention[];
  created_at: string;
}
