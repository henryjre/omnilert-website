export type PayrollAdjustmentManagerStatus =
  | 'pending'
  | 'processing'
  | 'employee_approval'
  | 'in_progress'
  | 'completed'
  | 'rejected';

export type PayrollAdjustmentEmployeeStatus = 'pending' | 'in_progress' | 'completed';

export type PayrollAdjustmentType = 'issuance' | 'deduction';

export interface PayrollAdjustmentTarget {
  id: string;
  userId: string;
  employeeName: string;
  employeeAvatarUrl: string | null;
  allocatedTotalAmount: number;
  allocatedMonthlyAmount: number;
  status: PayrollAdjustmentEmployeeStatus;
  authorizedAt: string | null;
  completedAt: string | null;
  odooSalaryAttachmentId: number | null;
}

export interface PayrollAdjustmentRequestSummary {
  id: string;
  companyId: string;
  companyName: string;
  branchId: string;
  branchName: string;
  type: PayrollAdjustmentType;
  totalAmount: number;
  payrollPeriods: number;
  status: PayrollAdjustmentManagerStatus;
  reason: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
  createdByName: string;
  processingOwnerUserId: string | null;
  processingOwnerName: string | null;
  approvedByUserId: string | null;
  approvedByName: string | null;
  rejectedByUserId: string | null;
  rejectedByName: string | null;
  rejectionReason: string | null;
  confirmedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  targets: PayrollAdjustmentTarget[];
}

export type PayrollAdjustmentRequestDetail = PayrollAdjustmentRequestSummary;

export interface PayrollAdjustmentEmployeeItem {
  id: string;
  requestId: string;
  companyId: string;
  companyName: string;
  branchId: string;
  branchName: string;
  type: PayrollAdjustmentType;
  status: PayrollAdjustmentEmployeeStatus;
  amount: number;
  monthlyAmount: number;
  payrollPeriods: number;
  reason: string;
  issuerName: string;
  submittedAt: string;
  authorizedAt: string | null;
  completedAt: string | null;
  odooSalaryAttachmentId: number | null;
}

export interface PayrollAdjustmentListPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PayrollAdjustmentRequestListResponse {
  items: PayrollAdjustmentRequestSummary[];
  pagination: PayrollAdjustmentListPagination;
}

export interface PayrollAdjustmentEmployeeListResponse {
  items: PayrollAdjustmentEmployeeItem[];
  pagination: PayrollAdjustmentListPagination;
}
