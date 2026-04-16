import { memo } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import type { TokenPayCardSummary } from '@omnilert/shared';

function getInitials(firstName: string, lastName: string): string {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?';
}

function formatCurrency(value: number): string {
  return `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface TokenPayWalletCardProps {
  wallet: TokenPayCardSummary;
  selected: boolean;
  onClick: (userId: string) => void;
}

export const TokenPayWalletCard = memo(function TokenPayWalletCard({
  wallet,
  selected,
  onClick,
}: TokenPayWalletCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(wallet.userId)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(wallet.userId);
        }
      }}
      className={`flex flex-col rounded-xl border bg-white p-4 text-left transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
        selected
          ? 'border-primary-300 ring-1 ring-primary-300 bg-primary-50/50'
          : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      {/* Identity row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {wallet.avatarUrl ? (
            <img
              src={wallet.avatarUrl}
              alt={`${wallet.firstName} ${wallet.lastName}`}
              className="h-12 w-12 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">
              {getInitials(wallet.firstName, wallet.lastName)}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-900">
              {wallet.firstName} {wallet.lastName}
            </p>
            <p className="mt-0.5 truncate font-mono text-xs text-gray-400">{wallet.userKey}</p>
          </div>
        </div>
        {wallet.isSuspended && (
          <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
            Suspended
          </span>
        )}
      </div>

      {/* Balance */}
      <div className="mt-3 border-t border-gray-100 pt-3">
        <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">Balance</p>
        <p className="mt-0.5 text-2xl font-bold tabular-nums text-gray-900">
          {formatCurrency(wallet.balance)}
        </p>
      </div>

      {/* Earned / Spent row */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="flex items-center gap-1.5 rounded-lg bg-green-50 px-2.5 py-2">
          <TrendingUp className="h-3.5 w-3.5 shrink-0 text-green-600" />
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wider text-green-700">Earned</p>
            <p className="truncate text-xs font-bold tabular-nums text-green-800">
              {formatCurrency(wallet.totalEarned)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-2">
          <TrendingDown className="h-3.5 w-3.5 shrink-0 text-red-600" />
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wider text-red-700">Spent</p>
            <p className="truncate text-xs font-bold tabular-nums text-red-800">
              {formatCurrency(wallet.totalSpent)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
});
