import { useEffect, useMemo, useState, useSyncExternalStore, type ElementType, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Clock,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  CreditCard,
  GitBranch,
  Minus,
  Monitor,
  Receipt,
  ShoppingCart,
  TableProperties,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AnalyticsRangePicker,
  getSummaryForSelection,
} from '@/features/employee-analytics/components/AnalyticsRangePicker';
import { usePersistedAnalyticsRange } from '@/features/employee-analytics/utils/analyticsRangePersistence';
import { createCurrentMonthToDateRangeSelection } from '@/features/employee-analytics/utils/analyticsRangeBuckets';
import { ViewToggle, type ViewOption } from '@/shared/components/ui/ViewToggle';
import { useBranchStore } from '@/shared/store/branchStore';
import {
  fetchPosAnalytics,
  type PosAnalyticsBucket,
  type PosAnalyticsSnapshot,
  type PosSessionDetail,
} from '../services/posAnalytics.api';

type PosView = 'chart' | 'table';
type KpiColor = 'blue' | 'emerald' | 'rose' | 'amber';

type BranchComparisonRow = {
  branch: {
    id: string;
    name: string;
  };
  current: PosAnalyticsSnapshot;
  previousPeriod: PosAnalyticsSnapshot;
};

const VIEW_OPTIONS: ViewOption<PosView>[] = [
  { id: 'chart', label: 'Chart View', icon: BarChart3 },
  { id: 'table', label: 'Table View', icon: TableProperties },
];
const SESSION_TABLE_HEADERS = ['Session', 'Branch', 'Date'] as const;
const SESSION_TABLE_DESKTOP_HEADERS = ['Gross Sales', 'Discounts', 'Refunds', 'Net Sales'] as const;

const PIE_COLORS = [
  '#2563eb',
  '#059669',
  '#f59e0b',
  '#e11d48',
  '#7c3aed',
  '#0891b2',
  '#65a30d',
  '#c2410c',
];

const KPI_COLOR_MAP: Record<KpiColor, { bg: string; text: string; icon: string }> = {
  blue: { bg: 'bg-primary-50', text: 'text-primary-600', icon: 'text-primary-500' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', icon: 'text-emerald-500' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-600', icon: 'text-rose-500' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600', icon: 'text-amber-500' },
};

const EMPTY_SNAPSHOT: PosAnalyticsSnapshot = {
  totalSessions: 0,
  netSales: 0,
  grossSales: 0,
  discounts: 0,
  refunds: 0,
  avgSalesPerSession: 0,
  openingCash: 0,
  expectedClosingCash: 0,
  actualClosingCash: 0,
  cashVariance: 0,
  totalTransactions: 0,
  avgTransactionsPerSession: 0,
  avgDurationMinutes: 0,
  paymentBreakdown: [],
  topRefundedProducts: [],
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.2, 0, 0, 1] as const, delay },
  }),
};

function formatCurrency(value: number, compact = false): string {
  if (compact) {
    if (Math.abs(value) >= 1_000_000) return `PHP ${(value / 1_000_000).toFixed(2)}M`;
    if (Math.abs(value) >= 1_000) return `PHP ${(value / 1_000).toFixed(1)}K`;
    return `PHP ${value.toLocaleString('en-PH')}`;
  }

  return `PHP ${value.toLocaleString('en-PH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function calcDeltaPercent(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

function formatDuration(minutes: number | null): string {
  if (minutes === null) return 'Not closed';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
}

function parseSessionTimestamp(timestamp: string): Date | null {
  const normalized = timestamp.includes('T') ? timestamp : `${timestamp.replace(' ', 'T')}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateTime(timestamp: string): string {
  const parsed = parseSessionTimestamp(timestamp);
  if (!parsed) return 'Unavailable';
  return parsed.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function formatSessionDate(timestamp: string, isMobile = false): string {
  const parsed = parseSessionTimestamp(timestamp);
  if (!parsed) return 'Unavailable';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    month: isMobile ? '2-digit' : 'short',
    day: '2-digit',
    year: isMobile ? '2-digit' : 'numeric',
  }).format(parsed);
}

function formatTooltipCurrency(
  value: number | string | ReadonlyArray<string | number> | undefined,
  name: string | number | undefined,
): [string, string] {
  const resolved = Array.isArray(value) ? value[0] : value;
  const numericValue = typeof resolved === 'number' ? resolved : Number(resolved ?? 0);
  return [formatCurrency(Number.isFinite(numericValue) ? numericValue : 0), String(name ?? '')];
}

function formatTooltipNumber(
  value: number | string | ReadonlyArray<string | number> | undefined,
  name: string | number | undefined,
): [string, string] {
  const resolved = Array.isArray(value) ? value[0] : value;
  const numericValue = typeof resolved === 'number' ? resolved : Number(resolved ?? 0);
  return [numericValue.toLocaleString('en-PH'), String(name ?? '')];
}

function formatAxisCurrency(value: number, _compact = false): string {
  return formatCurrency(value);
}

const mobileQuery = window.matchMedia('(max-width: 639px)');
function subscribeMobile(cb: () => void) {
  mobileQuery.addEventListener('change', cb);
  return () => mobileQuery.removeEventListener('change', cb);
}
function useIsMobile() {
  return useSyncExternalStore(subscribeMobile, () => mobileQuery.matches, () => false);
}

function AnalyticsCard({
  icon: Icon,
  title,
  description,
  children,
  className = '',
}: {
  icon: ElementType;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex h-full flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm ${className}`}>
      <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50/50 px-5 py-4">
        <Icon className="h-4 w-4 shrink-0 text-gray-400" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">{title}</p>
          {description ? <p className="mt-0.5 text-xs text-gray-500">{description}</p> : null}
        </div>
      </div>
      {children}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  deltaPercent,
  deltaCaption,
  color,
}: {
  icon: ElementType;
  label: string;
  value: string;
  deltaPercent: number;
  deltaCaption: string;
  color: KpiColor;
}) {
  const palette = KPI_COLOR_MAP[color];
  const isFlat = deltaPercent === 0;
  const isUp = deltaPercent > 0;
  const DeltaIcon = isFlat ? Minus : isUp ? ArrowUpRight : ArrowDownRight;
  const deltaColor = isFlat ? 'text-gray-400' : isUp ? 'text-emerald-600' : 'text-rose-600';
  const deltaBg = isFlat ? 'bg-gray-100' : isUp ? 'bg-emerald-50' : 'bg-rose-50';

  return (
    <div className="flex h-full flex-col gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${palette.bg}`}>
          <Icon className={`h-4 w-4 ${palette.icon}`} />
        </div>
      </div>
      <p className={`text-lg font-bold tabular-nums sm:text-2xl ${palette.text}`}>{value}</p>
      <div className={`flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 ${deltaBg}`}>
        <DeltaIcon className={`h-3.5 w-3.5 ${deltaColor}`} />
        <span className={`text-xs font-semibold tabular-nums ${deltaColor}`}>
          {isFlat ? 'No change' : formatPercent(deltaPercent)}
        </span>
        <span className="text-xs text-gray-400">{deltaCaption}</span>
      </div>
    </div>
  );
}

function SelectedBranchesStrip() {
  const { selectedBranchIds, companyBranchGroups } = useBranchStore();
  const [expanded, setExpanded] = useState(false);

  const branchNames = useMemo(() => {
    const allBranches = companyBranchGroups.flatMap((group) => group.branches);
    return selectedBranchIds
      .map((branchId) => allBranches.find((branch) => branch.id === branchId)?.name)
      .filter(Boolean) as string[];
  }, [companyBranchGroups, selectedBranchIds]);

  if (branchNames.length === 0) return null;

  const shouldCollapse = branchNames.length > 4;
  const visibleNames = shouldCollapse && !expanded ? branchNames.slice(0, 4) : branchNames;
  const hiddenCount = branchNames.length - 4;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-gray-50/60 px-3.5 py-2.5 sm:flex-row sm:items-start sm:gap-2.5">
      <div className="flex shrink-0 items-center gap-1.5 text-gray-400 sm:pt-0.5">
        <GitBranch className="h-3 w-3" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
          {branchNames.length} {branchNames.length === 1 ? 'Branch' : 'Branches'}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        <AnimatePresence initial={false}>
          {visibleNames.map((name) => (
            <motion.span
              key={name}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ duration: 0.15 }}
              className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700"
            >
              {name}
            </motion.span>
          ))}
        </AnimatePresence>
        {shouldCollapse ? (
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs font-medium text-gray-500 transition-colors hover:border-primary-200 hover:bg-primary-50 hover:text-primary-600"
          >
            {expanded ? 'Show less' : `+${hiddenCount} more`}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SalesTrendLine({ buckets }: { buckets: PosAnalyticsBucket[] }) {
  const isMobile = useIsMobile();
  const data = buckets.map((bucket) => ({
    label: bucket.label,
    netSales: bucket.netSales,
    grossSales: bucket.grossSales,
  }));

  return (
    <div className="px-3 pb-4 pt-3 sm:px-5 sm:pb-4 sm:pt-4">
      <div style={{ height: isMobile ? 190 : 250 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: isMobile ? 10 : 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              interval={isMobile ? 'preserveStartEnd' : 0}
            />
            <YAxis
              tickFormatter={(v) => formatAxisCurrency(v, isMobile)}
              tick={{ fontSize: isMobile ? 10 : 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              width={isMobile ? 44 : 112}
              tickCount={isMobile ? 4 : 5}
            />
            <Tooltip formatter={formatTooltipCurrency} />
            {!isMobile && <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />}
            <Line type="monotone" dataKey="grossSales" name="Gross Sales" stroke="#93c5fd" strokeWidth={isMobile ? 1.5 : 2} dot={false} />
            <Line type="monotone" dataKey="netSales" name="Net Sales" stroke="#2563eb" strokeWidth={isMobile ? 2 : 2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {isMobile && (
        <div className="mt-2 flex items-center gap-3 px-1">
          <div className="flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-blue-300" /><span className="text-[10px] text-gray-400">Gross</span></div>
          <div className="flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-blue-600" /><span className="text-[10px] text-gray-400">Net</span></div>
        </div>
      )}
    </div>
  );
}

function CashVarianceBar({ buckets }: { buckets: PosAnalyticsBucket[] }) {
  const isMobile = useIsMobile();
  const data = buckets.map((bucket) => ({
    label: bucket.label,
    variance: bucket.cashVariance,
  }));

  return (
    <div className="px-3 pb-4 pt-3 sm:px-5 sm:pb-4 sm:pt-4">
      <div style={{ height: isMobile ? 190 : 250 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: isMobile ? 10 : 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              interval={isMobile ? 'preserveStartEnd' : 0}
            />
            <YAxis
              tickFormatter={(v) => formatAxisCurrency(v, isMobile)}
              tick={{ fontSize: isMobile ? 10 : 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              width={isMobile ? 44 : 112}
              tickCount={isMobile ? 4 : 5}
            />
            <Tooltip formatter={formatTooltipCurrency} />
            <Bar dataKey="variance" name="Cash Variance" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
                <Cell
                  key={`${entry.label}-${index}`}
                  fill={entry.variance === 0 ? '#94a3b8' : entry.variance > 0 ? '#059669' : '#e11d48'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function truncateBranchName(name: string, maxLen: number): string {
  if (name.length <= maxLen) return name;
  return `${name.slice(0, maxLen - 1)}…`;
}

function BranchComparisonChart({ comparisons }: { comparisons: BranchComparisonRow[] }) {
  const isMobile = useIsMobile();

  if (comparisons.length === 0) {
    return <div className="flex h-[200px] items-center justify-center px-5 text-sm text-gray-400 sm:h-[250px]">No branch comparison data</div>;
  }

  const data = comparisons.map((item) => ({
    label: isMobile ? truncateBranchName(item.branch.name, 10) : item.branch.name,
    fullName: item.branch.name,
    currentNetSales: item.current.netSales,
    previousNetSales: item.previousPeriod.netSales,
  }));

  // Mobile: horizontal BarChart so branch names go on Y-axis with plenty of room
  if (isMobile) {
    const rowHeight = 36;
    const chartHeight = Math.max(data.length * rowHeight * 2 + 16, 160);
    return (
      <div className="px-3 pb-4 pt-3">
        <div style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 48, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(v) => formatAxisCurrency(v, true)}
                tick={{ fontSize: 9, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                tickCount={4}
              />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ fontSize: 10, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                width={72}
              />
              <Tooltip
                formatter={formatTooltipCurrency}
                labelFormatter={(label) => {
                  const match = data.find((d) => d.label === label);
                  return match?.fullName ?? label;
                }}
              />
              <Bar dataKey="currentNetSales" name="Current" fill="#2563eb" radius={[0, 3, 3, 0]} barSize={10} />
              <Bar dataKey="previousNetSales" name="Previous" fill="#93c5fd" radius={[0, 3, 3, 0]} barSize={10} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex items-center gap-3 px-1">
          <div className="flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-blue-600" /><span className="text-[10px] text-gray-400">Current</span></div>
          <div className="flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-blue-300" /><span className="text-[10px] text-gray-400">Previous</span></div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 pb-4 pt-4">
      <div style={{ height: 250 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <YAxis
              tickFormatter={(v) => formatAxisCurrency(v, false)}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              width={112}
              tickCount={5}
            />
            <Tooltip formatter={formatTooltipCurrency} />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Bar dataKey="currentNetSales" name="Current Net Sales" fill="#2563eb" radius={[4, 4, 0, 0]} />
            <Bar dataKey="previousNetSales" name="Previous Net Sales" fill="#93c5fd" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function SessionComparisonChart({ sessions }: { sessions: PosSessionDetail[] }) {
  const isMobile = useIsMobile();

  if (sessions.length === 0) {
    return <div className="flex h-[200px] items-center justify-center px-5 text-sm text-gray-400 sm:h-[250px]">No session comparison data</div>;
  }

  const limit = isMobile ? 4 : 6;
  const data = sessions
    .slice()
    .sort((left, right) => right.netSales - left.netSales)
    .slice(0, limit)
    .map((session) => ({
      label: session.sessionName.replace(/^POS\//, ''),
      netSales: session.netSales,
      transactions: session.transactionCount,
      durationHours: session.durationMinutes === null ? 0 : Number((session.durationMinutes / 60).toFixed(1)),
    }));

  return (
    <div className="px-3 pb-4 pt-3 sm:px-5 sm:pb-4 sm:pt-4">
      <div style={{ height: isMobile ? 190 : 250 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: isMobile ? 4 : 44, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: isMobile ? 10 : 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <YAxis
              yAxisId="sales"
              tickFormatter={(v) => formatAxisCurrency(v, isMobile)}
              tick={{ fontSize: isMobile ? 10 : 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              width={isMobile ? 44 : 112}
              tickCount={isMobile ? 4 : 5}
            />
            {!isMobile && (
              <YAxis
                yAxisId="ops"
                orientation="right"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
            )}
            <Tooltip
              formatter={(value, name) => {
                if (name === 'Net Sales') return formatTooltipCurrency(value, name);
                if (name === 'Duration (hrs)') {
                  const numericValue = typeof value === 'number' ? value : Number(value ?? 0);
                  return [`${numericValue.toFixed(1)}h`, String(name)];
                }
                return formatTooltipNumber(value, name);
              }}
            />
            {!isMobile && <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />}
            <Bar yAxisId="sales" dataKey="netSales" name="Net Sales" fill="#2563eb" radius={[4, 4, 0, 0]} />
            {!isMobile && (
              <>
                <Line yAxisId="ops" type="monotone" dataKey="transactions" name="Transactions" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} />
                <Line yAxisId="ops" type="monotone" dataKey="durationHours" name="Duration (hrs)" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PaymentBreakdownPie({ snapshot }: { snapshot: PosAnalyticsSnapshot }) {
  const isMobile = useIsMobile();
  const data = snapshot.paymentBreakdown.slice(0, 8);

  if (data.length === 0) {
    return <div className="flex h-[200px] items-center justify-center px-5 text-sm text-gray-400 sm:h-[250px]">No payment method data</div>;
  }

  const pieHeight = isMobile ? 140 : 175;
  const innerR = isMobile ? 28 : 40;
  const outerR = isMobile ? 56 : 72;

  return (
    <div className="flex flex-col px-3 py-4 sm:px-5">
      <ResponsiveContainer width="100%" height={pieHeight}>
        <PieChart>
          <Pie data={data} dataKey="amount" nameKey="method" cx="50%" cy="50%" innerRadius={innerR} outerRadius={outerR} paddingAngle={2}>
            {data.map((item, index) => (
              <Cell key={`${item.method}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={formatTooltipCurrency} />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-3 grid gap-1.5 sm:grid-cols-2 sm:gap-x-5 sm:gap-y-2">
        {data.map((item, index) => (
          <div key={item.method} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50/70 px-2.5 py-2 text-xs">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
              <span className="truncate text-gray-600">{item.method}</span>
            </div>
            <span className="shrink-0 font-medium tabular-nums text-gray-700">{formatCurrency(item.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DurationTrendLine({ buckets }: { buckets: PosAnalyticsBucket[] }) {
  const isMobile = useIsMobile();
  const data = buckets.map((bucket) => ({
    label: bucket.label,
    avgDuration: bucket.avgDurationMinutes,
  }));

  return (
    <div className="px-3 pb-4 pt-3 sm:px-5 sm:pb-4 sm:pt-4">
      <div style={{ height: isMobile ? 190 : 250 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: isMobile ? 10 : 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              interval={isMobile ? 'preserveStartEnd' : 0}
            />
            <YAxis
              tickFormatter={(value) => `${Math.round(value)}m`}
              tick={{ fontSize: isMobile ? 10 : 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              width={44}
              tickCount={isMobile ? 4 : 5}
            />
            <Tooltip
              formatter={(value, name) => {
                const numericValue = typeof value === 'number' ? value : Number(value ?? 0);
                return [formatDuration(Number.isFinite(numericValue) ? numericValue : null), String(name ?? '')];
              }}
            />
            <Line type="monotone" dataKey="avgDuration" name="Avg Duration" stroke="#7c3aed" strokeWidth={isMobile ? 2 : 2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TopRefundedCard({ snapshot }: { snapshot: PosAnalyticsSnapshot }) {
  const items = snapshot.topRefundedProducts;

  if (items.length === 0) {
    return <div className="flex h-[250px] items-center justify-center px-5 text-sm text-gray-400">No refunds in this period</div>;
  }

  return (
    <div className="space-y-3 px-5 py-4">
      {items.map((item, index) => (
        <div key={item.product} className="rounded-xl border border-rose-100 bg-rose-50/40 px-3.5 py-3 sm:px-4">
          <div className="sm:flex sm:items-center sm:justify-between sm:gap-5">
            <div className="flex min-w-0 items-start gap-2.5 sm:flex-1 sm:items-center">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-100 text-[10px] font-bold text-rose-700 sm:mt-0">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <span className="block break-words text-sm font-medium leading-5 text-gray-700 sm:text-[15px] sm:leading-6 sm:truncate">
                  {item.product}
                </span>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-rose-100/80 pt-2.5 sm:mt-0 sm:min-w-[240px] sm:border-t-0 sm:pt-0">
              <div className="sm:rounded-lg sm:border sm:border-white/80 sm:bg-white/70 sm:px-3 sm:py-2 sm:text-right">
                <span className="hidden text-[10px] font-semibold uppercase tracking-wide text-gray-400 sm:block">Refunds</span>
                <span className="block text-sm font-bold tabular-nums text-rose-700">
                  {item.count.toLocaleString('en-PH')} refund{item.count === 1 ? '' : 's'}
                </span>
              </div>
              <div className="sm:rounded-lg sm:border sm:border-white/80 sm:bg-white/70 sm:px-3 sm:py-2 sm:text-right">
                <span className="hidden text-[10px] font-semibold uppercase tracking-wide text-gray-400 sm:block">Value</span>
                <span className="block text-[11px] font-medium tabular-nums text-gray-400 sm:text-xs sm:text-gray-600">
                  {formatCurrency(item.total)} total
                </span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SessionSummaryCard({ snapshot }: { snapshot: PosAnalyticsSnapshot }) {
  const summaryItems = [
    { label: 'Opening Cash', value: formatCurrency(snapshot.openingCash) },
    { label: 'Expected Cash', value: formatCurrency(snapshot.expectedClosingCash) },
    { label: 'Actual Cash', value: formatCurrency(snapshot.actualClosingCash) },
    { label: 'Cash Variance', value: formatCurrency(snapshot.cashVariance) },
    { label: 'Average Duration', value: formatDuration(snapshot.avgDurationMinutes) },
    { label: 'Transactions / Session', value: snapshot.avgTransactionsPerSession.toFixed(1) },
    { label: 'Discounts', value: formatCurrency(snapshot.discounts) },
    { label: 'Refunds', value: formatCurrency(snapshot.refunds) },
  ];

  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-gray-50 px-5 py-4">
      {summaryItems.map((item) => (
        <div key={item.label} className="px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{item.label}</p>
          <p className="mt-1 text-sm font-bold tabular-nums text-gray-700">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function SessionMetricTile({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'negative';
}) {
  const valueClass =
    tone === 'positive'
      ? 'text-emerald-600'
      : tone === 'negative'
        ? 'text-rose-600'
        : 'text-gray-800';

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-3.5 py-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</p>
      <p className={`mt-1.5 text-sm font-bold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}

function LedgerRow({
  label,
  value,
  tone = 'default',
  indent = false,
  bold = false,
  separator = false,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'negative' | 'muted';
  indent?: boolean;
  bold?: boolean;
  separator?: boolean;
}) {
  const valueClass =
    tone === 'positive'
      ? 'text-emerald-700'
      : tone === 'negative'
        ? 'text-rose-700'
        : tone === 'muted'
          ? 'text-gray-400'
          : 'text-gray-800';

  const rowBg =
    tone === 'positive'
      ? 'bg-emerald-50/60'
      : tone === 'negative'
        ? 'bg-rose-50/60'
        : '';

  return (
    <>
      {separator && <div className="my-1 border-t border-dashed border-gray-100" />}
      <div className={`flex items-baseline justify-between gap-4 rounded px-2 py-1.5 ${rowBg}`}>
        <span className={`text-xs ${indent ? 'pl-3 text-gray-400' : bold ? 'font-semibold text-gray-700' : 'text-gray-500'}`}>
          {label}
        </span>
        <span className={`shrink-0 font-mono text-xs tabular-nums ${bold ? 'font-semibold' : ''} ${valueClass}`}>
          {value}
        </span>
      </div>
    </>
  );
}

function LedgerSection({ title, icon: Icon, children }: { title: string; icon: ElementType; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5">
        <Icon className="h-3.5 w-3.5 shrink-0 text-gray-300" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{title}</span>
      </div>
      <div className="px-2 py-2">
        {children}
      </div>
    </div>
  );
}

function SessionDetailCard({
  sessions,
  periodLabel,
}: {
  sessions: PosSessionDetail[];
  periodLabel: string;
}) {
  const [selectedSession, setSelectedSession] = useState<PosSessionDetail | null>(null);
  const [sortKey, setSortKey] = useState<keyof PosSessionDetail | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null);

  useEffect(() => {
    if (!selectedSession) return;

    const latestMatch =
      sessions.find(
        (session) =>
          session.sessionName === selectedSession.sessionName && session.startAt === selectedSession.startAt,
      ) ?? null;

    if (!latestMatch) {
      setSelectedSession(null);
      return;
    }

    if (latestMatch !== selectedSession) {
      setSelectedSession(latestMatch);
    }
  }, [selectedSession, sessions]);

  const handleSort = (key: keyof PosSessionDetail) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('desc');
    } else if (sortDir === 'desc') {
      setSortDir('asc');
    } else if (sortDir === 'asc') {
      setSortKey(null);
      setSortDir(null);
    }
  };

  const sortedSessions = useMemo(() => {
    if (!sortKey || !sortDir) return sessions;

    return [...sessions].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        const cmp = aVal.localeCompare(bVal);
        return sortDir === 'asc' ? cmp : -cmp;
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }

      return 0;
    });
  }, [sessions, sortKey, sortDir]);

  const isDetailView = selectedSession !== null;
  const sessionDetailSubtitle = isDetailView && selectedSession
    ? `${selectedSession.sessionName} • ${selectedSession.branchName}`
    : `Click headers to sort (Desc → Asc → None). Showing ${sessions.length} sessions.`;

  const SortIndicator = ({ columnKey }: { columnKey: keyof PosSessionDetail }) => {
    if (sortKey !== columnKey) return <ChevronsUpDown className="h-2.5 w-2.5 text-gray-200 group-hover:text-gray-400" />;
    return sortDir === 'desc' ? (
      <ChevronDown className="h-3 w-3 text-primary-500" />
    ) : (
      <ChevronUp className="h-3 w-3 text-primary-500" />
    );
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/50 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <TableProperties className="h-4 w-4 shrink-0 text-gray-400" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">Session Detail</p>
            <p className="mt-0.5 truncate text-xs text-gray-500">{sessionDetailSubtitle}</p>
          </div>
        </div>
        {isDetailView ? (
          <button
            type="button"
            onClick={() => setSelectedSession(null)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-primary-600"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
        ) : null}
      </div>

      <div className="relative overflow-hidden">
        <motion.div
          animate={{ x: isDetailView ? '-100%' : 0, opacity: isDetailView ? 0 : 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          aria-hidden={isDetailView}
          className="overflow-x-auto"
        >
          {sessions.length === 0 ? (
            <div className="flex items-center justify-center px-5 py-10 text-sm text-gray-400">No sessions in this period</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60 transition-colors">
                  {[
                    { label: 'Session', key: 'sessionName' as const, mobile: true },
                    { label: 'Branch', key: 'branchName' as const, mobile: true },
                    { label: 'Date', key: 'startAt' as const, mobile: true },
                    { label: 'Gross Sales', key: 'grossSales' as const, mobile: false },
                    { label: 'Discounts', key: 'discounts' as const, mobile: false },
                    { label: 'Refunds', key: 'refunds' as const, mobile: false },
                    { label: 'Net Sales', key: 'netSales' as const, mobile: false },
                  ].map((col) => (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className={`${col.mobile ? '' : 'hidden lg:table-cell'} cursor-pointer select-none whitespace-nowrap px-4 py-4 text-left transition-colors hover:bg-gray-100/80 group`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wide ${sortKey === col.key ? 'text-primary-600' : 'text-gray-400 group-hover:text-gray-600'}`}>
                          {col.label}
                        </span>
                        <SortIndicator columnKey={col.key} />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sortedSessions.map((session, index) => (
                  <tr
                    key={`${session.sessionName}-${index}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedSession(session)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedSession(session);
                      }
                    }}
                    className="cursor-pointer transition-colors hover:bg-gray-50/70 focus-visible:bg-primary-50/40 focus-visible:outline-none"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-primary-700">{session.sessionName}</td>
                    <td className="px-4 py-3 text-gray-600">{session.branchName}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                      <span className="hidden sm:inline">{formatSessionDate(session.startAt)}</span>
                      <span className="sm:hidden">{formatSessionDate(session.startAt, true)}</span>
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-gray-600 lg:table-cell">
                      {formatCurrency(session.grossSales)}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-gray-600 lg:table-cell">
                      {formatCurrency(session.discounts)}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-gray-600 lg:table-cell">
                      {formatCurrency(session.refunds)}
                    </td>
                    <td className="hidden whitespace-nowrap px-4 py-3 font-semibold text-gray-700 lg:table-cell">
                      {formatCurrency(session.netSales)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </motion.div>

        <AnimatePresence initial={false}>
          {selectedSession ? (
            <motion.div
              key={`detail-${selectedSession.sessionName}`}
              initial={{ x: '100%', opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: '100%', opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="absolute inset-0 overflow-y-auto bg-gray-50/40"
            >
              <div className="space-y-3 p-4 sm:p-5">

                {/* Session Identity */}
                <LedgerSection title="Session" icon={Monitor}>
                  <LedgerRow label="Session Name" value={selectedSession.sessionName} bold />
                  <LedgerRow label="Branch" value={selectedSession.branchName} />
                  <LedgerRow
                    label="Status"
                    value={selectedSession.state === 'opened' ? 'Open' : 'Closed'}
                    tone={selectedSession.state === 'opened' ? 'positive' : 'negative'}
                  />
                  <LedgerRow label="Opened At" value={formatDateTime(selectedSession.startAt)} />
                  <LedgerRow
                    label="Closed At"
                    value={selectedSession.stopAt ? formatDateTime(selectedSession.stopAt) : '—'}
                    tone={selectedSession.stopAt ? 'default' : 'muted'}
                  />
                  <LedgerRow
                    label="Duration"
                    value={formatDuration(selectedSession.durationMinutes)}
                    tone={selectedSession.durationMinutes === null ? 'muted' : 'default'}
                  />
                  <LedgerRow label="Transactions" value={selectedSession.transactionCount.toLocaleString('en-PH')} />
                </LedgerSection>

                {/* Revenue */}
                <LedgerSection title="Revenue" icon={TrendingUp}>
                  <LedgerRow label="Gross Sales" value={formatCurrency(selectedSession.grossSales)} bold />
                  <LedgerRow label="Discounts" value={`− ${formatCurrency(selectedSession.discounts)}`} indent tone={selectedSession.discounts > 0 ? 'negative' : 'muted'} />
                  <LedgerRow label="Refunds" value={`− ${formatCurrency(selectedSession.refunds)}`} indent tone={selectedSession.refunds > 0 ? 'negative' : 'muted'} />
                  <LedgerRow label="Net Sales" value={formatCurrency(selectedSession.netSales)} bold separator />
                </LedgerSection>

                {/* Cash Control */}
                <LedgerSection title="Cash Control" icon={Wallet}>
                  <LedgerRow label="Opening Cash" value={formatCurrency(selectedSession.openingCash)} />
                  <LedgerRow label="Expected Closing Cash" value={formatCurrency(selectedSession.expectedClosingCash)} />
                  <LedgerRow label="Actual Closing Cash" value={formatCurrency(selectedSession.actualClosingCash)} bold separator />
                  <LedgerRow
                    label="Variance"
                    value={`${selectedSession.cashVariance >= 0 ? '+' : ''}${formatCurrency(selectedSession.cashVariance)}`}
                    tone={selectedSession.cashVariance > 0 ? 'positive' : selectedSession.cashVariance < 0 ? 'negative' : 'muted'}
                    bold
                  />
                </LedgerSection>

                {/* Payment Methods */}
                <LedgerSection title="Payment Methods" icon={CreditCard}>
                  {selectedSession.paymentBreakdown.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-gray-400">No payment breakdown recorded for this session.</div>
                  ) : (
                    <>
                      {selectedSession.paymentBreakdown.map((item) => (
                        <LedgerRow key={item.method} label={item.method} value={formatCurrency(item.amount)} />
                      ))}
                      <LedgerRow
                        label="Total Collected"
                        value={formatCurrency(selectedSession.paymentBreakdown.reduce((sum, item) => sum + item.amount, 0))}
                        bold
                        separator
                      />
                    </>
                  )}
                </LedgerSection>

                {/* Refunded Products */}
                <LedgerSection title="Refunded Products" icon={Receipt}>
                  {selectedSession.topRefundedProducts.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-gray-400">No refunded products recorded for this session.</div>
                  ) : (
                    selectedSession.topRefundedProducts.map((item, index) => (
                      <div key={`${item.product}-${index}`} className="flex items-baseline justify-between gap-4 rounded px-2 py-1.5">
                        <div className="flex min-w-0 items-baseline gap-2">
                          <span className="shrink-0 font-mono text-[10px] font-bold text-gray-300">#{index + 1}</span>
                          <span className="truncate text-xs text-gray-500">{item.product}</span>
                        </div>
                        <div className="flex shrink-0 items-baseline gap-3">
                          <span className="font-mono text-[10px] tabular-nums text-gray-400">
                            {item.count} refund{item.count === 1 ? '' : 's'}
                          </span>
                          <span className="font-mono text-xs font-semibold tabular-nums text-rose-700">
                            {formatCurrency(item.total)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </LedgerSection>

              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

function LoadingState({ periodLabel }: { periodLabel: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-xl border border-gray-100 bg-white px-5 py-12 text-center shadow-sm"
    >
      <div className="mb-4 flex h-8 items-end justify-center gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.div
            key={i}
            className="w-1.5 rounded-full bg-primary-400"
            animate={{ scaleY: [0.3, 1, 0.3] }}
            transition={{
              duration: 1,
              repeat: Infinity,
              delay: i * 0.12,
              ease: 'easeInOut',
            }}
            style={{ originY: 1, height: '100%' }}
          />
        ))}
      </div>
      <motion.p
        className="text-sm font-semibold text-gray-700"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      >
        Loading POS analytics data...
      </motion.p>
      <p className="mt-1 text-xs text-gray-400">{periodLabel}</p>
    </motion.div>
  );
}

export function PosAnalyticsPage() {
  const [analyticsRange, setAnalyticsRange] = usePersistedAnalyticsRange('pos-analytics.range', createCurrentMonthToDateRangeSelection());
  const [activeView, setActiveView] = useState<PosView>('chart');
  const { selectedBranchIds } = useBranchStore();

  const periodLabel = useMemo(() => getSummaryForSelection(analyticsRange), [analyticsRange]);
  const granularity = analyticsRange.granularity as 'day' | 'week' | 'month';

  const posQuery = useQuery({
    queryKey: [
      'pos-analytics',
      granularity,
      analyticsRange.rangeStartYmd,
      analyticsRange.rangeEndYmd,
      ...selectedBranchIds,
    ],
    enabled: selectedBranchIds.length > 0,
    staleTime: 60_000,
    queryFn: () =>
      fetchPosAnalytics({
        granularity,
        rangeStartYmd: analyticsRange.rangeStartYmd,
        rangeEndYmd: analyticsRange.rangeEndYmd,
        branchIds: selectedBranchIds,
      }),
  });

  const snapshot = posQuery.data?.current ?? EMPTY_SNAPSHOT;
  const previousSnapshot = posQuery.data?.previousPeriod ?? EMPTY_SNAPSHOT;
  const buckets = posQuery.data?.currentBuckets ?? [];
  const sessions = posQuery.data?.sessions ?? [];
  const branchComparison = posQuery.data?.branchComparison ?? [];

  const hasSelectedBranches = selectedBranchIds.length > 0;
  const isInitialLoading = posQuery.isLoading && !posQuery.data;
  const hasData = Boolean(posQuery.data && snapshot.totalSessions > 0);
  const showContent = hasSelectedBranches && !isInitialLoading && hasData;

  const kpiCards: Array<{
    icon: ElementType;
    label: string;
    value: string;
    deltaPercent: number;
    deltaCaption: string;
    color: KpiColor;
  }> = [
    {
      icon: Monitor,
      label: 'Sessions',
      value: snapshot.totalSessions.toLocaleString('en-PH'),
      deltaPercent: calcDeltaPercent(snapshot.totalSessions, previousSnapshot.totalSessions),
      deltaCaption: 'vs prior',
      color: 'blue' as KpiColor,
    },
    {
      icon: ShoppingCart,
      label: 'Net Sales',
      value: formatCurrency(snapshot.netSales),
      deltaPercent: calcDeltaPercent(snapshot.netSales, previousSnapshot.netSales),
      deltaCaption: 'vs prior',
      color: 'blue' as KpiColor,
    },
    {
      icon: Wallet,
      label: 'Cash Variance',
      value: `${snapshot.cashVariance >= 0 ? '+' : ''}${formatCurrency(snapshot.cashVariance)}`,
      deltaPercent: calcDeltaPercent(snapshot.cashVariance, previousSnapshot.cashVariance),
      deltaCaption: 'vs prior',
      color: snapshot.cashVariance === 0 ? 'blue' : snapshot.cashVariance > 0 ? 'emerald' : 'rose',
    },
    {
      icon: TrendingUp,
      label: 'Avg Sales / Session',
      value: formatCurrency(snapshot.avgSalesPerSession),
      deltaPercent: calcDeltaPercent(snapshot.avgSalesPerSession, previousSnapshot.avgSalesPerSession),
      deltaCaption: 'vs prior',
      color: 'emerald' as KpiColor,
    },
    {
      icon: Activity,
      label: 'Transactions',
      value: snapshot.totalTransactions.toLocaleString('en-PH'),
      deltaPercent: calcDeltaPercent(snapshot.totalTransactions, previousSnapshot.totalTransactions),
      deltaCaption: 'vs prior',
      color: 'amber' as KpiColor,
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-4 justify-between sm:flex-row sm:items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Monitor className="h-6 w-6 text-primary-600" />
            <h1 className="text-2xl font-bold text-gray-900">POS Sessions Analytics</h1>
          </div>
          <p className="mt-1 hidden text-sm text-gray-500 sm:block">
            Cash control, session performance, and cashier accountability across your selected branches.
          </p>
        </div>

        <AnalyticsRangePicker
          value={analyticsRange}
          onChange={setAnalyticsRange}
          minDateYmd={null}
          excludeGranularities={['year']}
          className="shrink-0 self-center"
        />
      </div>

      <SelectedBranchesStrip />

      {!hasSelectedBranches ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white px-5 py-10 text-center shadow-sm">
          <p className="text-sm font-semibold text-gray-700">Select at least one branch to view POS sessions analytics.</p>
        </div>
      ) : null}

      {hasSelectedBranches && isInitialLoading ? <LoadingState periodLabel={periodLabel} /> : null}

      {hasSelectedBranches && posQuery.isError && !posQuery.data ? (
        <div className="rounded-xl border border-rose-100 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          Failed to load POS sessions analytics. Please try again.
        </div>
      ) : null}

      {hasSelectedBranches && !isInitialLoading && posQuery.data && !hasData ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-dashed border-gray-200 bg-white px-5 py-12 text-center shadow-sm"
        >
          <Monitor className="mx-auto mb-3 h-8 w-8 text-gray-300" />
          <p className="text-sm font-semibold text-gray-700">No POS sessions found</p>
          <p className="mt-1 text-xs text-gray-400">No sessions were recorded for {periodLabel}.</p>
        </motion.div>
      ) : null}

      {showContent ? (
        <div className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {kpiCards.map((card, index) => (
              <motion.div
                key={card.label}
                className={index === 4 ? 'col-span-2 sm:col-span-1' : ''}
                variants={fadeUp}
                initial="hidden"
                animate="visible"
                custom={index * 0.07}
              >
                <KpiCard {...card} />
              </motion.div>
            ))}
          </div>

          <ViewToggle
            options={VIEW_OPTIONS}
            activeId={activeView}
            onChange={setActiveView}
            layoutId="pos-analytics-view-tabs"
            labelAboveOnMobile
          />

          <AnimatePresence mode="wait">
            <motion.div
              key={activeView}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              {activeView === 'chart' ? (
                <div className="space-y-4 sm:space-y-6">
                  <div className="grid gap-4 xl:grid-cols-2">
                    <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0.1}>
                      <AnalyticsCard
                        icon={TrendingUp}
                        title="Session Sales Trend"
                        description="Net and gross sales grouped by the selected granularity"
                      >
                        <SalesTrendLine buckets={buckets} />
                      </AnalyticsCard>
                    </motion.div>
                    <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0.15}>
                      <AnalyticsCard
                        icon={AlertTriangle}
                        title="Cash Variance"
                        description="Actual closing cash versus expected closing cash for each period"
                      >
                        <CashVarianceBar buckets={buckets} />
                      </AnalyticsCard>
                    </motion.div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0.2}>
                      <AnalyticsCard
                        icon={GitBranch}
                        title="Branch-to-Branch Comparison"
                        description="Current period net sales compared against the previous period by branch"
                      >
                        <BranchComparisonChart comparisons={branchComparison as BranchComparisonRow[]} />
                      </AnalyticsCard>
                    </motion.div>
                    <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0.25}>
                      <AnalyticsCard
                        icon={BarChart3}
                        title="Session-to-Session Comparison"
                        description="Top sessions compared by net sales, transactions, and duration"
                      >
                        <SessionComparisonChart sessions={sessions} />
                      </AnalyticsCard>
                    </motion.div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0.3}>
                      <AnalyticsCard
                        icon={CreditCard}
                        title="Payment Method Distribution"
                        description="Payment mix across the selected period"
                      >
                        <PaymentBreakdownPie snapshot={snapshot} />
                      </AnalyticsCard>
                    </motion.div>
                    <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0.35}>
                      <AnalyticsCard
                        icon={Clock}
                        title="Session Duration Trend"
                        description="Average operating duration across the selected period"
                      >
                        <DurationTrendLine buckets={buckets} />
                      </AnalyticsCard>
                    </motion.div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0.4}>
                      <AnalyticsCard
                        icon={Receipt}
                        title="Most Refunded Products"
                        description="Top 3 refunded products by refund count across all matching sessions"
                      >
                        <TopRefundedCard snapshot={snapshot} />
                      </AnalyticsCard>
                    </motion.div>
                    <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0.45}>
                      <AnalyticsCard
                        icon={Activity}
                        title="Session Summary"
                        description="Operational totals and averages for the current selection"
                      >
                        <SessionSummaryCard snapshot={snapshot} />
                      </AnalyticsCard>
                    </motion.div>
                  </div>
                </div>
              ) : (
                <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={0}>
                  <SessionDetailCard sessions={sessions} periodLabel={periodLabel} />
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      ) : null}
    </div>
  );
}
