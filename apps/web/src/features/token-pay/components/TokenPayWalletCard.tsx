import { memo } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import type { TokenPayCardSummary } from '@omnilert/shared';

function getInitials(firstName: string, lastName: string): string {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase() || '?';
}

function formatCurrency(value: number): string {
  return `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Noise texture SVG as a data URL for the subtle grain overlay
const NOISE_SVG =
  "data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E";

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
  const activeGradient = 'linear-gradient(135deg, rgb(30 64 175) 0%, rgb(37 99 235) 100%)';
  const suspendedGradient = 'linear-gradient(135deg, #374151 0%, #6b7280 100%)';
  const gradient = wallet.isSuspended ? suspendedGradient : activeGradient;

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
      className={`flex flex-col overflow-hidden rounded-xl shadow-md transition-all duration-200 cursor-pointer focus:outline-none ${
        wallet.isSuspended ? 'opacity-75' : ''
      } ${
        selected
          ? 'ring-2 ring-primary-500 ring-offset-2 shadow-lg'
          : 'hover:shadow-lg'
      }`}
    >
      {/* ── Top zone: gradient header ── */}
      <div className="relative px-4 pb-4 pt-4" style={{ background: gradient }}>
        {/* Noise texture overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: `url("${NOISE_SVG}")` }}
        />

        {/* Identity row */}
        <div className="relative flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            {wallet.avatarUrl ? (
              <img
                src={wallet.avatarUrl}
                alt={`${wallet.firstName} ${wallet.lastName}`}
                className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-white/20"
              />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/15 text-base font-bold text-white ring-2 ring-white/20">
                {getInitials(wallet.firstName, wallet.lastName)}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate font-bold text-white leading-snug">
                {wallet.firstName} {wallet.lastName}
              </p>
              <p className="mt-0.5 truncate font-mono text-[11px] text-white/50">
                {wallet.userKey}
              </p>
            </div>
          </div>

          {wallet.isSuspended && (
            <span className="shrink-0 rounded-full bg-red-500/80 px-2 py-0.5 text-[10px] font-semibold text-white">
              Suspended
            </span>
          )}
        </div>

        {/* Balance */}
        <div className="relative mt-4">
          <p className="text-[10px] font-medium uppercase tracking-widest text-white/50">
            Balance
          </p>
          <p className="mt-0.5 text-2xl font-extrabold tabular-nums text-white">
            {formatCurrency(wallet.balance)}
          </p>
        </div>
      </div>

      {/* ── Bottom zone: stats ── */}
      <div className="grid grid-cols-2 divide-x divide-gray-100 bg-white">
        {/* Earned */}
        <div className="flex items-center gap-2 px-4 py-3">
          <TrendingUp className="h-4 w-4 shrink-0 text-green-500" />
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
              Earned
            </p>
            <p className="truncate text-sm font-bold tabular-nums text-green-600">
              {formatCurrency(wallet.totalEarned)}
            </p>
          </div>
        </div>

        {/* Spent */}
        <div className="flex items-center gap-2 px-4 py-3">
          <TrendingDown className="h-4 w-4 shrink-0 text-red-400" />
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
              Spent
            </p>
            <p className="truncate text-sm font-bold tabular-nums text-red-500">
              {formatCurrency(wallet.totalSpent)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
});
