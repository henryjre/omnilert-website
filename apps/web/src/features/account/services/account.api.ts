import type { UnifiedMyTask } from '@omnilert/shared';
import { api } from '@/shared/services/api.client';

export async function getMyTasks(companyId?: string): Promise<UnifiedMyTask[]> {
  const response = await api.get(
    '/account/tasks/me',
    companyId ? { headers: { 'X-Company-Id': companyId } } : undefined,
  );
  return response.data.data as UnifiedMyTask[];
}
