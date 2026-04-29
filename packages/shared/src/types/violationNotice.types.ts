export type ViolationNoticeStatus =
  | 'queued'
  | 'discussion'
  | 'issuance'
  | 'disciplinary_meeting'
  | 'completed'
  | 'rejected';

export type ViolationNoticeCategory = 'manual' | 'case_reports' | 'store_audits' | 'aic_variance';

export type ViolationNoticeMessageType = 'message' | 'system';

export interface ViolationNoticeTarget {
  id: string;
  user_id: string;
  user_name?: string;
  user_avatar?: string | null;
}

export interface ViolationNoticeReaction {
  emoji: string;
  users: Array<{ id: string; name: string }>;
}

export interface ViolationNoticeAttachment {
  id: string;
  violation_notice_id: string;
  message_id: string | null;
  uploaded_by: string;
  file_url: string;
  file_name: string;
  file_size: number;
  content_type: string;
  created_at: string;
}

export interface ViolationNoticeMention {
  mentioned_user_id: string | null;
  mentioned_role_id: string | null;
  mentioned_name?: string;
}

export interface ViolationNoticeMessage {
  id: string;
  violation_notice_id: string;
  user_id: string;
  user_name?: string;
  user_avatar?: string | null;
  content: string;
  type: ViolationNoticeMessageType;
  is_deleted: boolean;
  deleted_by?: string | null;
  parent_message_id: string | null;
  parent_message?: {
    id: string;
    user_id: string;
    user_name?: string;
    content: string;
    is_deleted: boolean;
  } | null;
  reactions: ViolationNoticeReaction[];
  attachments: ViolationNoticeAttachment[];
  mentions: ViolationNoticeMention[];
  created_at: string;
  updated_at: string;
  is_edited: boolean;
}

export interface ViolationNotice {
  id: string;
  vn_number: number;
  status: ViolationNoticeStatus;
  category: ViolationNoticeCategory;
  description: string;
  created_by: string;
  created_by_name?: string;
  confirmed_by: string | null;
  confirmed_by_name?: string | null;
  issued_by: string | null;
  issued_by_name?: string | null;
  completed_by: string | null;
  completed_by_name?: string | null;
  epi_decrease: number | null;
  rejected_by: string | null;
  rejected_by_name?: string | null;
  rejection_reason: string | null;
  branch_id: string | null;
  branch_name?: string | null;
  company_name?: string | null;
  source_case_report_id: string | null;
  source_store_audit_id: string | null;
  issuance_file_url: string | null;
  issuance_file_name: string | null;
  disciplinary_file_url: string | null;
  disciplinary_file_name: string | null;
  targets: ViolationNoticeTarget[];
  message_count: number;
  unread_count: number;
  unread_reply_count: number;
  is_joined: boolean;
  is_muted: boolean;
  created_at: string;
  updated_at: string;
}

export interface ViolationNoticeDetail extends ViolationNotice {
  attachments: ViolationNoticeAttachment[];
}

export interface GroupedUsersResponse {
  management: Array<{ id: string; name: string; avatar_url: string | null }>;
  service_crew: Array<{ id: string; name: string; avatar_url: string | null }>;
  other: Array<{ id: string; name: string; avatar_url: string | null }>;
  suspended_user_ids?: string[];
}
