export interface ProfitabilityBranchConfig {
  variableExpenseVendorIds: number[];
  overheadAccountIds: number[];
}

const DEFAULT_VARIABLE_EXPENSE_VENDOR_IDS = [125, 3022, 3401, 13, 155];
const DEFAULT_OVERHEAD_ACCOUNT_IDS = [107, 123, 188];

const BRANCH_CONFIG_BY_BRANCH_ID: Record<string, Partial<ProfitabilityBranchConfig>> = {};

export function getProfitabilityBranchConfig(branchId: string): ProfitabilityBranchConfig {
  const configured = BRANCH_CONFIG_BY_BRANCH_ID[branchId] ?? {};

  return {
    variableExpenseVendorIds:
      configured.variableExpenseVendorIds?.filter((value) => Number.isFinite(value)) ??
      DEFAULT_VARIABLE_EXPENSE_VENDOR_IDS,
    overheadAccountIds:
      configured.overheadAccountIds?.filter((value) => Number.isFinite(value)) ??
      DEFAULT_OVERHEAD_ACCOUNT_IDS,
  };
}
