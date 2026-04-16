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
      {/* Top: identity + status badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="relative shrink-0">
            {request.userAvatarUrl ? (
              <img
                src={request.userAvatarUrl}
                alt={request.userName}
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
                {getInitials(request.userName)}
              </div>
            )}
            <span className={`absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-white ${isCredit ? 'bg-green-100' : 'bg-red-100'}`}>
              {isCredit
                ? <ArrowUpCircle className="h-3 w-3 text-green-600" />
                : <ArrowDownCircle className="h-3 w-3 text-red-600" />}
            </span>
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-900">{request.userName}</p>
            <p className="truncate text-xs text-gray-400">by {request.issuedByName}</p>
          </div>
        </div>
        <Badge variant={statusVariant(request.status)} className="shrink-0">
          {statusLabel(request.status)}
        </Badge>
      </div>

      {/* Footer: date — amount + chevron */}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-2.5">
        <p className="text-xs text-gray-400">{formatDate(request.createdAt)}</p>
        <div className="flex shrink-0 items-center gap-2">
          <p className={`text-sm font-bold tabular-nums ${isCredit ? 'text-green-700' : 'text-red-700'}`}>
            {isCredit ? '+' : '−'}{formatCurrency(request.amount)}
          </p>
          <ChevronRight className="h-4 w-4 text-gray-300" />
        </div>
      </div>
    </button>
  );
});
