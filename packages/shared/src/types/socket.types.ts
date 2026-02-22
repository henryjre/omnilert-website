import type { PosVerification, PosSession } from './pos.types';

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

  'notification:new': (data: {
    id: string;
    title: string;
    message: string;
    type: string;
    createdAt: string;
  }) => void;
  'notification:count': (data: { unreadCount: number }) => void;
  'user:branch-assignments-updated': (data: { branchIds: string[] }) => void;
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
}

export interface ClientToServerEvents {
  'join-branch': (branchId: string) => void;
  'leave-branch': (branchId: string) => void;
}
