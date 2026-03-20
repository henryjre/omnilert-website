interface ResolveStoreAuditPaginationStateInput {
  page: number;
  pageSize: number;
  total: number;
}

export interface StoreAuditPaginationState {
  page: number;
  totalPages: number;
}

export function resolveStoreAuditPaginationState(
  input: ResolveStoreAuditPaginationStateInput,
): StoreAuditPaginationState {
  const safePageSize = Math.max(1, input.pageSize);
  const totalPages = Math.max(1, Math.ceil(Math.max(0, input.total) / safePageSize));

  return {
    page: Math.min(Math.max(input.page, 1), totalPages),
    totalPages,
  };
}
