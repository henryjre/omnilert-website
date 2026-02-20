export type PosVerificationStatus = 'pending' | 'confirmed' | 'rejected';
export type PosSessionStatus = 'open' | 'closed' | 'audit_complete';

export interface BreakdownItem {
  denomination: number;
  quantity: number;
}

export type VerificationType = 'cf_breakdown' | 'pcf_breakdown' | 'closing_pcf_breakdown';

export interface PosVerification {
  id: string;
  branchId: string;
  posSessionId: string | null;
  odooPayload: Record<string, unknown>;
  title: string | null;
  description: string | null;
  amount: number | null;
  status: PosVerificationStatus;
  verificationType: VerificationType | null;
  breakdown: BreakdownItem[] | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  images: PosVerificationImage[];
  createdAt: string;
  updatedAt: string;
}

export interface PosVerificationImage {
  id: string;
  posVerificationId: string;
  uploadedBy: string;
  filePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number | null;
  createdAt: string;
}

export interface PosSession {
  id: string;
  branchId: string;
  odooSessionId: string | null;
  odooPayload: Record<string, unknown>;
  sessionName: string | null;
  openedAt: string | null;
  closedAt: string | null;
  status: PosSessionStatus;
  auditedBy: string | null;
  auditedAt: string | null;
  verifications: PosVerification[];
  createdAt: string;
  updatedAt: string;
}

export interface ConfirmRejectRequest {
  notes?: string;
}
