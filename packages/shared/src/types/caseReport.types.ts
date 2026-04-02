export type CaseReportStatus = 'open' | 'closed';

export interface CaseReport {
  id: string;
  case_number: number;
  title: string;
  description: string;
  status: CaseReportStatus;
  corrective_action: string | null;
  resolution: string | null;
  vn_requested: boolean;
  linked_vn_id: string | null;
  created_by: string;
  created_by_name?: string;
  closed_by: string | null;
  closed_by_name?: string;
  closed_at: string | null;
  message_count: number;
  unread_count: number;
  unread_reply_count: number;
  is_joined: boolean;
  is_muted: boolean;
  branch_id?: string | null;
  branch_name?: string | null;
  company_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaseMessage {
  id: string;
  case_id: string;
  user_id: string;
  user_name?: string;
  user_avatar?: string;
  content: string;
  is_system: boolean;
  is_deleted: boolean;
  parent_message_id: string | null;
  replies?: CaseMessage[];
  reactions: CaseReaction[];
  attachments: CaseAttachment[];
  mentions: CaseMention[];
  created_at: string;
  is_edited: boolean;
}

export interface CaseReaction {
  emoji: string;
  users: { id: string; name: string }[];
}

export interface CaseAttachment {
  id: string;
  file_url: string;
  file_name: string;
  file_size: number;
  content_type: string;
}

export interface CaseMention {
  mentioned_user_id: string | null;
  mentioned_role_id: string | null;
  mentioned_name?: string;
}
