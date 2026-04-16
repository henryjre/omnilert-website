import { memo } from 'react';
import { ArrowDownCircle, ArrowUpCircle, ChevronRight } from 'lucide-react';
import type { TokenPayIssuanceRequest } from '@omnilert/shared';
import { Badge } from '@/shared/components/ui/Badge';

function formatCurrency(value: number): string {
  return `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusVariant(status: TokenPayIssuanceRequest['status']): 'warning' | 'success' | 'danger' {
  if (status === 'pending') return 'warning';
  if (status === 'completed') return 'success';
  return 'danger';
}

function statusLabel(status: TokenPayIssuanceRequest['status']): string {
  if (status === 'pending') return 'Pending';
  if (status === 'completed') return 'Approved';
  return 'Rejected';
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

interface TokenPayIssuanceCardProps {
  request: TokenPayIssuanceRequest;
  selected: boolean;
  onClick: (id: string) => void;
}

export const TokenPayIssuanceCard = memo(function TokenPayIssuanceCard({
  request,
  selected,
  onClick,
}: TokenPayIssuanceCardProps) {
  const isCredit = request.type === 'credit';

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
      <div className="flex items-center justify-between gap-3">
        {/* Left: user, type, date */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            {/* Type icon */}
            {isCredit ? (
              <ArrowUpCircle className="h-4 w-4 shrink-0 text-green-500" />
            ) : (
              <ArrowDownCircle className="h-4 w-4 shrink-0 text-red-500" />
            )}

            {/* Target user avatar + name */}
            <div className="flex min-w-0 items-center gap-2">
              {request.userAvatarUrl ? (
                <img
                  src={request.userAvatarUrl}
                  alt={request.userName}
                  className="h-6 w-6 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[10px] font-semibold text-primary-700">
                  {getInitials(request.userName)}
                </div>
              )}
              <p className="truncate font-medium text-gray-900">{request.userName}</p>
            </div>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <p className={`text-xs font-semibold ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
              {isCredit ? 'Issuance' : 'Deduction'}
            </p>
            <p className="text-xs text-gray-400">{formatDate(request.createdAt)}</p>
          </div>
          <p className="mt-0.5 truncate text-xs text-gray-500">by {request.issuedByName}</p>
        </div>

        {/* Right: amount + status */}
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <p className={`text-sm font-bold tabular-nums ${isCredit ? 'text-green-700' : 'text-red-700'}`}>
            {isCredit ? '+' : '−'}{formatCurrency(request.amount)}
          </p>
          <Badge variant={statusVariant(request.status)}>{statusLabel(request.status)}</Badge>
        </div>

        <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
      </div>
    </button>
  );
});
