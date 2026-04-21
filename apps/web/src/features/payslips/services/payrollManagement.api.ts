import type { GroupedUsersResponse } from '@omnilert/shared';
import { api } from '@/shared/services/api.client';

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
