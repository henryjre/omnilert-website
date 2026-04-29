export type AicStatus = 'open' | 'resolved';
export type AicFlagType = 'threshold_violation' | 'invalid_threshold';
export type AicDiscrepancyDirection = 'negative' | 'positive' | 'neutral';

export interface AicRecord {
  id: string;
  aic_number: number;
  reference: string;
  company_id: string;
  company_name?: string | null;
  branch_id: string | null;
  branch_name?: string | null;
  aic_date: string;
  status: AicStatus;
  summary: string | null;
  resolution: string | null;
  vn_requested: boolean;
  linked_vn_id: string | null;
  resolved_by: string | null;
  resolved_by_name?: string | null;
  resolved_at: string | null;
  product_count: number;
  message_count: number;
  unread_count: number;
  unread_reply_count: number;
  is_joined: boolean;
  is_muted: boolean;
  created_at: string;
  updated_at: string;
}

export interface AicProduct {
  id: string;
  aic_record_id: string;
  odoo_product_tmpl_id: number;
  product_name: string;
  quantity: number;
  uom_name: string;
  flag_type: AicFlagType;
  discrepancy_direction: AicDiscrepancyDirection;
  created_at: string;
}

export interface AicMessage {
  id: string;
  aic_record_id: string;
  user_id: string | null;
  user_name?: string | null;
  user_avatar?: string | null;
  content: string;
  is_system: boolean;
  is_deleted: boolean;
  is_edited: boolean;
  parent_message_id: string | null;
  replies?: AicMessage[];
  reactions: AicReaction[];
  attachments: AicAttachment[];
  mentions: AicMention[];
  created_at: string;
}

export interface AicReaction {
  emoji: string;
  users: { id: string; name: string }[];
}

export interface AicAttachment {
  id: string;
  file_url: string;
  file_name: string;
  file_size: number;
  content_type: string;
}

export interface AicMention {
  mentioned_user_id: string | null;
  mentioned_role_id: string | null;
  mentioned_name?: string | null;
}

export interface AicTask {
  id: string;
  aic_record_id: string;
  created_by: string | null;
  created_by_name: string | null;
  source_message_id: string | null;
  discussion_message_id: string | null;
  source_message_content: string | null;
  source_message_user_name: string | null;
  description: string;
  assignees: AicTaskAssignee[];
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  last_message_content: string | null;
  last_message_user_name: string | null;
  last_message_user_avatar: string | null;
  message_count: number;
}

export interface AicTaskAssignee {
  id: string;
  task_id: string;
  user_id: string;
  user_name: string | null;
  user_avatar: string | null;
  completed_at: string | null;
  completed_by: string | null;
  completed_by_name: string | null;
}

export interface AicTaskMessage {
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
  reactions: AicTaskReaction[];
  mentions: AicTaskMention[];
  created_at: string;
}

export interface AicTaskReaction {
  emoji: string;
  users: { id: string; name: string }[];
}

export interface AicTaskMention {
  mentioned_user_id: string | null;
  mentioned_role_id: string | null;
  mentioned_name?: string | null;
}
