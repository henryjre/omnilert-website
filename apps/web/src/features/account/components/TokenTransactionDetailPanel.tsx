import { useState } from 'react';
import { motion, type Variants } from 'framer-motion';
import { CheckCircle2, Clock, XCircle, Copy, Check } from 'lucide-react';
import type { TokenTransaction } from '@omnilert/shared';

/* ------------------------------------------------------------------ */
/*  Formatters                                                          */
/* ------------------------------------------------------------------ */

function formatCurrency(amount: number): string {
  return `₱${Math.abs(amount).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

function formatDateOnly(iso: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(iso));
}

function formatTimeOnly(iso: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

/* ------------------------------------------------------------------ */
/*  Category helpers                                                    */
/* ------------------------------------------------------------------ */

const categoryMeta: Record<TokenTransaction['category'], { label: string; note: string }> = {
  reward: {
    label: 'Reward & Incentive',
    note: 'Credited by Omnilert System as incentive for reaching the target daily sales..',
  },
  purchase: {
    label: 'Store Purchase',
    note: 'Deducted for a company store item.',
  },
  transfer: {
    label: 'Token Transfer',
    note: 'Moved between accounts via the internal transfer system.',
  },
  adjustment: {
    label: 'Manual Adjustment',
    note: 'Applied by Finance Department to correct a balance discrepancy.',
  },
};

/* ------------------------------------------------------------------ */
/*  Hero gradient config per transaction type                          */
/* ------------------------------------------------------------------ */

type HeroTheme = {
  gradient: string;
  amountColor: string;
  labelColor: string;
  shimmer: string;
};

function getHeroTheme(type: TokenTransaction['type']): HeroTheme {
  if (type === 'credit') {
    return {
      gradient: 'linear-gradient(145deg, #14532d 0%, #166534 45%, #15803d 100%)',
      amountColor: '#86efac',
      labelColor: 'rgba(134,239,172,0.65)',
      shimmer: 'rgba(134,239,172,0.06)',
    };
  }
  return {
    gradient: 'linear-gradient(145deg, #450a0a 0%, #7f1d1d 45%, #991b1b 100%)',
    amountColor: '#fca5a5',
    labelColor: 'rgba(252,165,165,0.65)',
    shimmer: 'rgba(252,165,165,0.06)',
  };
}

/* ------------------------------------------------------------------ */
/*  Status bar                                                          */
/* ------------------------------------------------------------------ */

function StatusBar({ status }: { status: TokenTransaction['status'] }) {
  if (status === 'completed') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-3.5 py-2.5">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
        <div>
          <p className="text-sm font-bold text-emerald-800">Transaction Completed</p>
          <p className="text-xs text-emerald-600">Settled and reflected in your balance.</p>
        </div>
      </div>
    );
  }
  if (status === 'pending') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3.5 py-2.5">
        <Clock className="h-4 w-4 shrink-0 text-amber-600" />
        <div>
          <p className="text-sm font-bold text-amber-800">Processing</p>
          <p className="text-xs text-amber-600">This transaction is pending for approval.</p>
        </div>
      </div>
    );
  }
  if (status === 'cancelled') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5">
        <XCircle className="h-4 w-4 shrink-0 text-gray-400" />
        <div>
          <p className="text-sm font-bold text-gray-700">Transaction Cancelled</p>
          <p className="text-xs text-gray-500">This transaction was cancelled and will not affect your balance.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3.5 py-2.5">
      <XCircle className="h-4 w-4 shrink-0 text-red-600" />
      <div>
        <p className="text-sm font-bold text-red-800">Transaction Failed</p>
        <p className="text-xs text-red-600">Contact HR or Finance for assistance.</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Copy button                                                         */
/* ------------------------------------------------------------------ */

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="ml-1.5 shrink-0 rounded p-0.5 text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-500"
      aria-label={copied ? 'Copied' : 'Copy to clipboard'}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Detail row                                                          */
/* ------------------------------------------------------------------ */

function DetailRow({ label, value, mono = false, accent = false, copyable = false }: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
  copyable?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <span className="shrink-0 text-xs font-medium text-gray-400">{label}</span>
      <div className="flex min-w-0 items-center">
        <span
          className={`truncate text-right text-sm ${
            mono ? 'font-mono text-xs tracking-wide text-gray-500' :
            accent ? 'font-bold text-gray-900' :
            'font-medium text-gray-700'
          }`}
        >
          {value}
        </span>
        {copyable && <CopyButton value={value} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Animation variants                                                  */
/* ------------------------------------------------------------------ */

const containerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

const itemVariant: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.32, ease: 'easeOut' } },
};

/* ------------------------------------------------------------------ */
/*  Main panel                                                          */
/* ------------------------------------------------------------------ */

export function TokenTransactionDetailPanel({ tx }: { tx: TokenTransaction }) {
  const isCredit = tx.type === 'credit';
  const theme = getHeroTheme(tx.type);
  const meta = categoryMeta[tx.category];

  return (
    <motion.div
      className="flex-1 overflow-y-auto"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {/* ── Hero ── */}
      <motion.div
        variants={itemVariant}
        className="relative overflow-hidden px-7 pb-8 pt-7"
        style={{ background: theme.gradient }}
      >
        {/* Radial glow */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(ellipse 60% 50% at 20% 80%, ${theme.shimmer} 0%, transparent 70%)`,
          }}
        />
        {/* Noise texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          }}
        />

        <div className="relative">
          {/* Top row: category label */}
          <div className="mb-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: theme.labelColor }}>
              {meta.label}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-white/90 leading-tight">{tx.title}</p>
          </div>

          {/* Amount — the centrepiece */}
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold" style={{ color: theme.labelColor }}>
              {isCredit ? '+' : '−'}
            </span>
            <span className="text-[2.75rem] font-extrabold leading-none tracking-tight" style={{ color: theme.amountColor }}>
              {formatCurrency(tx.amount)}
            </span>
          </div>

          {/* Date line */}
          <p className="mt-3 text-xs" style={{ color: theme.labelColor }}>
            {formatDateTime(tx.date)}
          </p>
        </div>
      </motion.div>

      {/* ── Status ── */}
      <motion.div variants={itemVariant} className="px-6 pt-5">
        <StatusBar status={tx.status} />
      </motion.div>

      {/* ── Details ── */}
      <motion.div variants={itemVariant} className="mt-5 px-6">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-gray-300">Details</p>
        <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white px-4">
          <DetailRow label="Date" value={formatDateOnly(tx.date)} />
          <DetailRow label="Time" value={formatTimeOnly(tx.date)} />
          <DetailRow label="Issued By" value={tx.issuedBy ?? 'Unknown'} />
          {tx.reference && <DetailRow label="Reference" value={tx.reference} mono copyable />}
          <DetailRow label="Transaction ID" value={tx.id} mono copyable />
          <DetailRow label="Type" value={isCredit ? 'Credit' : 'Debit'} />
          <DetailRow label="Category" value={meta.label} />
        </div>
      </motion.div>

      {/* ── Amount summary ── */}
      <motion.div variants={itemVariant} className="mt-4 px-6">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-gray-300">Summary</p>
        <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white px-4">
          <DetailRow label="Amount" value={formatCurrency(tx.amount)} accent />
          <DetailRow
            label="Direction"
            value={isCredit ? 'Received into wallet' : 'Deducted from wallet'}
          />
        </div>
      </motion.div>

      {/* ── Note ── */}
      <motion.div variants={itemVariant} className="mx-6 mb-8 mt-4 rounded-xl bg-gray-50 px-4 py-3.5">
        <p className="text-xs leading-relaxed text-gray-500">{meta.note}</p>
      </motion.div>
    </motion.div>
  );
}
