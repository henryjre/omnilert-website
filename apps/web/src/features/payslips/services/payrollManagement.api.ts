import type {
  CreatePayrollAdjustmentRequestInput,
  GroupedUsersResponse,
  PayrollAdjustmentEmployeeItem,
  PayrollAdjustmentEmployeeListResponse,
  PayrollAdjustmentEmployeeStatus,
  PayrollAdjustmentManagerStatus,
  PayrollAdjustmentRequestDetail,
  PayrollAdjustmentRequestListResponse,
  PayrollOverviewPeriodOption,
  PayrollOverviewResponse,
  PayrollOverviewValidationResponse,
  RejectPayrollAdjustmentInput,
  UpdatePayrollAdjustmentProcessingInput,
  ValidatePayrollOverviewInput,
} from '@omnilert/shared';
import { api } from '@/shared/services/api.client';

export async function fetchPayrollOverview(params: {
  branchIds?: string[];
  period?: PayrollOverviewPeriodOption;
}): Promise<PayrollOverviewResponse> {
  const response = await api.get('/dashboard/payroll-overview', {
    params: {
      ...(params.branchIds?.length ? { branchIds: params.branchIds.join(',') } : {}),
      ...(params.period ? { period: params.period } : {}),
    },
  });
  return response.data.data as PayrollOverviewResponse;
}

export async function validatePayrollOverview(params: ValidatePayrollOverviewInput): Promise<PayrollOverviewValidationResponse> {
  const response = await api.post('/dashboard/payroll-overview/validate', {
    ...(params.branchIds?.length ? { branchIds: params.branchIds } : {}),
    period: params.period,
  });

  return response.data.data as PayrollOverviewValidationResponse;
}

export async function fetchPayrollBranchUsers(params: {
  branchId: string;
  companyId: string;
}): Promise<GroupedUsersResponse> {
  const response = await api.get('/dashboard/payslips/branch-users', {
    params: { branchId: params.branchId },
    headers: {
      'X-Company-Id': params.companyId,
    },
  });

  return response.data.data as GroupedUsersResponse;
}

export async function fetchPayrollAdjustmentRequests(params: {
  companyId: string;
  status?: PayrollAdjustmentManagerStatus;
  branchIds?: string[];
  page?: number;
  limit?: number;
}): Promise<PayrollAdjustmentRequestListResponse> {
  const response = await api.get('/payroll-adjustments/requests', {
    params: {
      status: params.status,
      branchIds: params.branchIds?.join(','),
      page: params.page ?? 1,
      limit: params.limit ?? 50,
    },
    headers: {
      'X-Company-Id': params.companyId,
    },
  });

  return response.data.data as PayrollAdjustmentRequestListResponse;
}

export async function fetchPayrollAdjustmentRequestDetail(params: {
  companyId: string;
  requestId: string;
}): Promise<PayrollAdjustmentRequestDetail> {
  const response = await api.get(
    `/payroll-adjustments/requests/${encodeURIComponent(params.requestId)}`,
    {
      headers: {
        'X-Company-Id': params.companyId,
      },
    },
  );

  return response.data.data as PayrollAdjustmentRequestDetail;
}

export async function createPayrollAdjustmentRequest(params: {
  companyId: string;
  payload: CreatePayrollAdjustmentRequestInput;
}): Promise<{ id: string }> {
  const response = await api.post('/payroll-adjustments/requests', params.payload, {
    headers: {
      'X-Company-Id': params.companyId,
    },
  });

  return response.data.data as { id: string };
}

export async function confirmPayrollAdjustmentRequest(params: {
  companyId: string;
  requestId: string;
}): Promise<void> {
  await api.post(
    `/payroll-adjustments/requests/${encodeURIComponent(params.requestId)}/confirm`,
    {},
    {
      headers: {
        'X-Company-Id': params.companyId,
      },
    },
  );
}

export async function updatePayrollAdjustmentProcessing(params: {
  companyId: string;
  requestId: string;
  payload: UpdatePayrollAdjustmentProcessingInput;
}): Promise<void> {
  await api.patch(
    `/payroll-adjustments/requests/${encodeURIComponent(params.requestId)}/processing`,
    params.payload,
    {
      headers: {
        'X-Company-Id': params.companyId,
      },
    },
  );
}

export async function approvePayrollAdjustmentRequest(params: {
  companyId: string;
  requestId: string;
}): Promise<void> {
  await api.post(
    `/payroll-adjustments/requests/${encodeURIComponent(params.requestId)}/approve`,
    {},
    {
      headers: {
        'X-Company-Id': params.companyId,
      },
    },
  );
}

export async function rejectPayrollAdjustmentRequest(params: {
  companyId: string;
  requestId: string;
  payload: RejectPayrollAdjustmentInput;
}): Promise<void> {
  await api.post(
    `/payroll-adjustments/requests/${encodeURIComponent(params.requestId)}/reject`,
    params.payload,
    {
      headers: {
        'X-Company-Id': params.companyId,
      },
    },
  );
}

export async function fetchPayslipAdjustmentItems(params: {
  companyId: string;
  status?: PayrollAdjustmentEmployeeStatus;
  branchIds?: string[];
  page?: number;
  limit?: number;
}): Promise<PayrollAdjustmentEmployeeListResponse> {
  const response = await api.get('/dashboard/payslip-adjustments', {
    params: {
      status: params.status,
      branchIds: params.branchIds?.join(','),
      page: params.page ?? 1,
      limit: params.limit ?? 50,
    },
    headers: {
      'X-Company-Id': params.companyId,
    },
  });

  return response.data.data as PayrollAdjustmentEmployeeListResponse;
}

export async function fetchPayslipAdjustmentDetail(params: {
  companyId?: string;
  targetId: string;
}): Promise<PayrollAdjustmentEmployeeItem> {
  const response = await api.get(
    `/dashboard/payslip-adjustments/${encodeURIComponent(params.targetId)}`,
    params.companyId ? { headers: { 'X-Company-Id': params.companyId } } : undefined,
  );

  return response.data.data as PayrollAdjustmentEmployeeItem;
}

export async function authorizePayslipAdjustment(params: {
  companyId: string;
  targetId: string;
}): Promise<void> {
  await api.post(
    `/dashboard/payslip-adjustments/${encodeURIComponent(params.targetId)}/authorize`,
    {},
    {
      headers: {
        'X-Company-Id': params.companyId,
      },
    },
  );
}
