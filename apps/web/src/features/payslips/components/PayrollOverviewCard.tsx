import { memo, useState } from 'react';
import type { PayslipStatus } from '@omnilert/shared';
import type { GroupedEmployee } from './payrollOverview.shared';

function stripEmployeeNumber(name: string): string {
  return name.replace(/^\d+\s*-\s*/, '').trim();
}

function getInitials(name: string): string {
  const cleaned = stripEmployeeNumber(name);
  const parts = cleaned.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

function getStatusAccent(status: PayslipStatus): string {
  if (status === 'completed') return 'bg-green-400';
  if (status === 'draft') return 'bg-blue-300';
  if (status === 'on_hold') return 'bg-rose-400';
  return 'bg-amber-400';
}

function getStatusLabel(status: PayslipStatus): string {
  if (status === 'completed') return 'Completed';
  if (status === 'draft') return 'Draft';
  if (status === 'on_hold') return 'On Hold';
  return 'Pending';
}

function getBadgeClassName(status: PayslipStatus): string {
  if (status === 'pending') return 'bg-amber-400 text-white';
  if (status === 'on_hold') return 'bg-rose-400 text-white';
  return 'bg-white/20 text-white';
}

/** Converts a hex color to a low-opacity background for chips */
function hexToChipStyle(hex: string): { backgroundColor: string; color: string; borderColor: string } {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return {
    backgroundColor: `rgba(${r},${g},${b},0.10)`,
    color: hex,
    borderColor: `rgba(${r},${g},${b},0.25)`,
  };
}

interface PayrollOverviewCardProps {
  group: GroupedEmployee;
  selected: boolean;
  onSelect: (group: GroupedEmployee) => void;
  displayStatus?: PayslipStatus;
  /** Map of branch company_name → themeColor hex */
  branchColorMap: Map<string, string>;
}

export const PayrollOverviewCard = memo(function PayrollOverviewCard({
  group,
  selected,
  onSelect,
  displayStatus,
  branchColorMap,
}: PayrollOverviewCardProps) {
  const [imgError, setImgError] = useState(false);
  const showAvatar = Boolean(group.avatar_url?.trim()) && !imgError;
  const initials = getInitials(group.employee_name);
  const displayName = stripEmployeeNumber(group.employee_name);
  const resolvedStatus = displayStatus ?? group.status;
  const accent = getStatusAccent(resolvedStatus);
  const label = getStatusLabel(resolvedStatus);
  const visibleBranches = group.branches.slice(0, 4);
  const overflow = group.branches.length - 4;

  return (
    <button
      type="button"
      onClick={() => onSelect(group)}
      className={`group flex w-full flex-col overflow-hidden rounded-2xl border border-blue-100 text-left transition-all duration-200 ${
        selected
          ? 'shadow-lg ring-2 ring-white/60 ring-offset-1 ring-offset-[#1a3be8]'
          : 'shadow-sm hover:-translate-y-0.5 hover:shadow-lg'
      }`}
    >
      <div className="flex items-center gap-3 bg-gradient-to-br from-[#4f6ef7] via-[#2d52f5] to-[#1a3be8] px-4 py-3.5">
        <div className="relative shrink-0">
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-white/20 text-sm font-bold text-white ring-2 ring-white/30">
            {showAvatar ? (
              <img
                src={group.avatar_url!}
                alt={displayName}
                className="h-full w-full object-cover"
                onError={() => setImgError(true)}
              />
            ) : (
              initials
            )}
          </div>
          <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[#1a3be8] ${accent}`} />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight text-white">{displayName}</p>
        </div>

        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getBadgeClassName(resolvedStatus)}`}
        >
          {label}
        </span>
      </div>

      <div className="flex flex-1 flex-col justify-between gap-2.5 bg-white px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {visibleBranches.map((branch) => {
            const color = branchColorMap.get(branch.company_name);
            const chipStyle = color ? hexToChipStyle(color) : undefined;
            return (
              <span
                key={branch.id}
                className="rounded-md border px-2 py-0.5 text-[10px] font-medium"
                style={chipStyle ?? { backgroundColor: '#f3f4f6', color: '#6b7280', borderColor: '#e5e7eb' }}
              >
                {branch.company_name}
              </span>
            );
          })}
          {overflow > 0 && (
            <span className="rounded-md border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-400">
              +{overflow} more
            </span>
          )}
        </div>
        <p className="text-xs italic text-gray-400">Unofficial payslip · Click to view</p>
      </div>
    </button>
  );
});

PayrollOverviewCard.displayName = 'PayrollOverviewCard';
