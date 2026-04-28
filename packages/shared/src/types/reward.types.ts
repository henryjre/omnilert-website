export type RewardRequestStatus = 'pending' | 'approved' | 'rejected';

export interface RewardRequestTarget {
  id: string;
  userId: string;
  employeeName: string;
  employeeAvatarUrl: string | null;
  epiBefore: number | null;
  epiAfter: number | null;
  epiDelta: number | null;
  appliedAt: string | null;
}

export interface RewardRequestSummary {
  id: string;
  companyId: string;
  companyName: string | null;
  status: RewardRequestStatus;
  reason: string;
  epiDelta: number;
  targetCount: number;
  createdByUserId: string;
  createdByName: string;
  reviewedByUserId: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  targets: RewardRequestTarget[];
}

export type RewardRequestDetail = RewardRequestSummary;

export interface RewardRequestListResponse {
  items: RewardRequestSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
