import { memo } from 'react';
import { ArrowDownCircle, ArrowUpCircle, ChevronRight } from 'lucide-react';
import type { RewardRequestSummary } from '@omnilert/shared';
import { Badge } from '@/shared/components/ui/Badge';
import {
  formatRewardDate,
  formatSignedEpiDelta,
  getInitials,
  rewardStatusLabel,
  rewardStatusVariant,
} from './epiAdjustmentFormatters';

interface EpiAdjustmentRequestCardProps {
  request: RewardRequestSummary;
  selected: boolean;
  onClick: (id: string) => void;
}

function TargetAvatarStack({ request }: { request: RewardRequestSummary }) {
  const visibleTargets = request.targets.slice(0, 3);
  const overflow = Math.max(request.targetCount - visibleTargets.length, 0);

  if (visibleTargets.length === 0) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700 ring-2 ring-white">
        ?
      </div>
    );
  }

  return (
    <div className="flex items-center">
      {visibleTargets.map((target, index) => (
        <div
          key={target.id}
          className={`flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-primary-100 text-xs font-semibold text-primary-700 ring-2 ring-white ${
            index > 0 ? '-ml-2' : ''
          }`}
        >
          {target.employeeAvatarUrl?.trim() ? (
            <img
              src={target.employeeAvatarUrl}
              alt={target.employeeName}
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            getInitials(target.employeeName)
          )}
        </div>
      ))}
      {overflow > 0 ? (
        <div className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-[11px] font-semibold text-gray-600 ring-2 ring-white">
          +{overflow}
        </div>
      ) : null}
    </div>
  );
}

export const EpiAdjustmentRequestCard = memo(function EpiAdjustmentRequestCard({
  request,
  selected,
  onClick,
}: EpiAdjustmentRequestCardProps) {
  const isPositive = request.epiDelta >= 0;
  const isMulti = request.targetCount > 1;
  const primaryEmployee = request.targets[0];
  const displayEmployeeName =
    request.targetCount === 1
      ? primaryEmployee?.employeeName || 'Unknown Employee'
      : isMulti
        ? 'Multiple Employees'
        : 'Unknown Employee';

  return (
    <button
      type="button"
      onClick={() => onClick(request.id)}
      className={`w-full rounded-xl border bg-white px-4 py-3.5 text-left transition-colors ${
        selected
          ? 'border-primary-200 bg-primary-50/40 ring-1 ring-primary-200'
          : 'border-gray-200 hover:border-primary-200 hover:bg-primary-50/30'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="relative shrink-0">
            <TargetAvatarStack request={request} />
            <span
              className={`absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-white ${
                isPositive ? 'bg-green-100' : 'bg-red-100'
              }`}
            >
              {isPositive ? (
                <ArrowUpCircle className="h-3 w-3 text-green-600" />
              ) : (
                <ArrowDownCircle className="h-3 w-3 text-red-600" />
              )}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-gray-900">
              {displayEmployeeName}
            </p>
            <p className="truncate text-xs text-gray-400">by {request.createdByName || 'Unknown'}</p>
          </div>
        </div>
        <Badge variant={rewardStatusVariant(request.status)} className="shrink-0">
          {rewardStatusLabel(request.status)}
        </Badge>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-2.5">
        <p className="text-xs text-gray-400">{formatRewardDate(request.createdAt)}</p>
        <div className="flex shrink-0 items-center gap-2">
          <p className={`text-sm font-bold tabular-nums ${isPositive ? 'text-green-700' : 'text-red-700'}`}>
            {formatSignedEpiDelta(request.epiDelta)} EPI
          </p>
          <ChevronRight className="h-4 w-4 text-gray-300" />
        </div>
      </div>
    </button>
  );
});
