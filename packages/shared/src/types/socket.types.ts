import type { PosVerification, PosSession } from './pos.types';
import type { CaseAttachment, CaseMessage } from './caseReport.types';
import type { StoreAudit } from './storeAudit.types';
import type { ViolationNoticeMessage } from './violationNotice.types.js';

export interface ServerToClientEvents {
  'pos-verification:new': (data: PosVerification) => void;
  'pos-verification:updated': (data: PosVerification) => void;
  'pos-verification:image-uploaded': (data: {
    verificationId: string;
    imageUrl: string;
    fileName: string;
  }) => void;

  'pos-session:new': (data: PosSession) => void;
  'pos-session:updated': (data: PosSession) => void;

  'shift:new': (data: Record<string, unknown>) => void;
  'shift:updated': (data: Record<string, unknown>) => void;
  'shift:deleted': (data: Record<string, unknown>) => void;
  'shift:log-new': (data: Record<string, unknown>) => void;
  'shift:authorization-new': (data: Record<string, unknown>) => void;
  'shift:authorization-updated': (data: Record<string, unknown>) => void;
  'shift:authorization-voided': (data: { shift_id: string | null; branch_id: string }) => void;
  'shift:activity-started': (data: { shiftId: string; activity: Record<string, unknown> }) => void;
  'shift:activity-ended': (data: { shiftId: string; activity: Record<string, unknown> }) => void;

  'notification:new': (data: {
    id: string;
    title: string;
    message: string;
    type: string;
    createdAt: string;
  }) => void;
  'notification:deleted': (data: { id: string; wasUnread: boolean }) => void;
  'notification:count': (data: { unreadCount: number }) => void;
  'user:branch-assignments-updated': (data: { branchIds: string[] }) => void;
  'user:auth-scope-updated': (data: { userId: string }) => void;
  'user:check-in-status-updated': (data: { userId: string }) => void;
  'auth:force-logout': (data: {
    companyId: string;
    reason: string;
    timestamp: string;
  }) => void;

  'employee-verification:updated': (data: {
    companyId: string;
    verificationId: string;
    verificationType: 'registration' | 'personal_information' | 'employment_requirement' | 'bank_information';
    action: 'created' | 'approved' | 'rejected' | 'submitted';
    userId?: string;
  }) => void;

  'employee-requirement:updated': (data: {
    companyId: string;
    action: 'submitted' | 'approved' | 'rejected';
    submissionId?: string;
    userId?: string;
    requirementCode?: string;
  }) => void;

  'employee-verification:approval-progress': (data: {
    companyId: string;
    verificationId: string;
    verificationType: 'registration';
    reviewerId: string;
    step:
      | 'start'
      | 'validate'
      | 'identity'
      | 'pin'
      | 'employees'
      | 'merge'
      | 'user'
      | 'email'
      | 'done';
    message: string;
    createdAt: string;
  }) => void;

  'store-audit:new': (data: StoreAudit) => void;
  'store-audit:claimed': (data: {
    id: string;
    auditor_user_id: string;
    auditor_name: string | null;
  }) => void;
  'store-audit:completed': (data: { id: string }) => void;
  'store-audit:updated': (data: { id: string }) => void;

  'case-report:created': (data: {
    id: string;
    caseNumber: number;
    title: string;
    status: 'open' | 'closed';
    createdBy: string;
  }) => void;
  'case-report:updated': (data: {
    id: string;
    caseNumber: number;
    field: string;
  }) => void;
  'case-report:message': (data: {
    caseId: string;
    message: CaseMessage;
  }) => void;
  'case-report:reaction': (data: {
    caseId: string;
    messageId: string;
    reactions: Array<{ emoji: string; users: { id: string; name: string }[] }>;
  }) => void;
  'case-report:attachment': (data: {
    caseId: string;
    attachment: CaseAttachment;
  }) => void;
  'case-report:message:edited': (data: { caseId: string; message: CaseMessage }) => void;
  'case-report:message:deleted': (data: { caseId: string; messageId: string }) => void;

  'violation-notice:created': (data: {
    id: string;
    vnNumber: number;
    status: string;
    category: string;
    createdBy: string;
  }) => void;
  'violation-notice:updated': (data: {
    id: string;
    vnNumber: number;
    field: string;
  }) => void;
  'violation-notice:status-changed': (data: {
    id: string;
    vnNumber: number;
    status: string;
  }) => void;
  'violation-notice:message': (data: {
    violationNoticeId: string;
    message: ViolationNoticeMessage;
  }) => void;
  'violation-notice:reaction': (data: {
    violationNoticeId: string;
    messageId: string;
    reactions: Array<{ emoji: string; users: Array<{ id: string; name: string }> }>;
  }) => void;
  'violation-notice:message:edited': (data: {
    violationNoticeId: string;
    message: ViolationNoticeMessage;
  }) => void;
  'violation-notice:message:deleted': (data: {
    violationNoticeId: string;
    messageId: string;
  }) => void;
  'peer-evaluation:new': (data: { shiftId: string }) => void;
  'peer-evaluation:completed': (data: { id: string }) => void;
  'peer-evaluation:expired': (data: { count: number }) => void;
}

export interface ClientToServerEvents {
  'join-branch': (branchId: string) => void;
  'leave-branch': (branchId: string) => void;
}
