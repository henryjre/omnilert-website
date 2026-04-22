import type { PayslipListItem, PayslipStatus } from '@omnilert/shared';

export type PayrollOverviewStatusTab = 'all' | PayslipStatus;

export interface GroupedEmployee {
  employee_id: number;
  employee_name: string;
  avatar_url?: string | null;
  /** All branch payslips/stubs for this employee, one per branch */
  branches: PayslipListItem[];
  /** Highest-priority status across branches (on_hold > pending > draft > completed) */
  status: PayslipStatus;
  /** Net pay for the primary branch chosen by the status priority order. */
  net_pay?: number;
}

const STATUS_PRIORITY: PayslipStatus[] = ['on_hold', 'pending', 'draft', 'completed'];

function normalizeEmployeeKey(name: string): string {
  return name.replace(/^\d+\s*-\s*/, '').trim().toLowerCase();
}

export function resolvePrimaryPayslip(
  branches: PayslipListItem[],
  preferredStatus?: PayslipStatus | null,
): PayslipListItem | null {
  if (branches.length === 0) return null;

  if (preferredStatus) {
    const preferred = branches.find((branch) => branch.status === preferredStatus);
    if (preferred) return preferred;
  }

  for (const status of STATUS_PRIORITY) {
    const match = branches.find((branch) => branch.status === status);
    if (match) return match;
  }

  return branches[0];
}

export function resolveGroupedEmployeeStatus(branches: PayslipListItem[]): PayslipStatus {
  return resolvePrimaryPayslip(branches)?.status ?? 'pending';
}

export function buildGroupedEmployees(items: PayslipListItem[]): GroupedEmployee[] {
  const map = new Map<string, GroupedEmployee>();

  for (const item of items) {
    const key = normalizeEmployeeKey(item.employee_name);
    const existing = map.get(key);

    if (existing) {
      existing.branches.push(item);
      if (!existing.avatar_url && item.avatar_url) {
        existing.avatar_url = item.avatar_url;
      }
      continue;
    }

    map.set(key, {
      employee_id: item.employee_id,
      employee_name: item.employee_name,
      avatar_url: item.avatar_url,
      branches: [item],
      status: item.status,
      net_pay: item.net_pay,
    });
  }

  return Array.from(map.values()).map((group) => {
    const primary = resolvePrimaryPayslip(group.branches);
    return {
      ...group,
      status: primary?.status ?? 'pending',
      net_pay: primary?.net_pay,
    };
  });
}

export function matchesPayrollOverviewStatusTab(
  group: GroupedEmployee,
  statusTab: PayrollOverviewStatusTab,
): boolean {
  if (statusTab === 'all') return true;
  return group.branches.some((branch) => branch.status === statusTab);
}

export function resolvePayrollOverviewDisplayStatus(
  group: GroupedEmployee,
  statusTab: PayrollOverviewStatusTab,
): PayslipStatus {
  if (statusTab === 'all') return group.status;
  return statusTab;
}
