import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DollarSign,
  TrendingUp,
  Minus,
  GitBranch,
  BarChart3,
  TableProperties,
  ArrowUpRight,
  ArrowDownRight,
  ShoppingCart,
  Receipt,
  Percent,
  Layers,
  Wallet,
  Activity,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useBranchStore } from '@/shared/store/branchStore';
import { ViewToggle, type ViewOption } from '@/shared/components/ui/ViewToggle';
import {
  AnalyticsRangePicker,
  getSummaryForSelection,
} from '@/features/employee-analytics/components/AnalyticsRangePicker';
import {
  createDefaultRangeForGranularity,
  type AnalyticsRangeSelection,
  type AnalyticsGranularity,
} from '@/features/employee-analytics/utils/analyticsRangeBuckets';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProfitabilitySnapshot {
  grossSales: number;
  discounts: number;
  refunds: number;
  netSales: number;
  cogs: number;
  grossProfit: number;
  variableExpenses: number;
  grossSalary: number;
  operatingProfit: number;
  overheadExpenses: number;
  netProfit: number;
  grossMarginPct: number;
  netMarginPct: number;
  expenseRatio: number;
}

interface TrendPoint {
  label: string;
  netSales: number;
  grossProfit: number;
  netProfit: number;
}

interface StackedBarPoint {
  label: string;
  revenue: number;
  costs: number;
  profit: number;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────
// TODO: replace with real API calls per the Profitability Analytics spec

const MOCK_CURRENT: ProfitabilitySnapshot = {
  grossSales: 1_248_500,
  discounts: 37_250,
  refunds: 12_180,
  netSales: 1_199_070,
  cogs: 479_628,
  grossProfit: 719_442,
  variableExpenses: 62_400,
  grossSalary: 312_000,
  operatingProfit: 345_042,
  overheadExpenses: 98_500,
  netProfit: 246_542,
  grossMarginPct: 60.0,
  netMarginPct: 20.6,
  expenseRatio: 39.4,
};

const MOCK_PRIOR: ProfitabilitySnapshot = {
  grossSales: 1_148_200,
  discounts: 34_440,
  refunds: 10_960,
  netSales: 1_102_800,
  cogs: 452_148,
  grossProfit: 650_652,
  variableExpenses: 57_410,
  grossSalary: 308_000,
  operatingProfit: 285_242,
  overheadExpenses: 96_000,
  netProfit: 189_242,
  grossMarginPct: 59.0,
  netMarginPct: 17.2,
  expenseRatio: 41.8,
};

function buildTrendSeries(granularity: AnalyticsGranularity): TrendPoint[] {
  const configs: Record<AnalyticsGranularity, { count: number; labelFn: (i: number) => string }> = {
    day: { count: 7, labelFn: (i) => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i] },
    week: { count: 6, labelFn: (i) => `Wk ${i + 1}` },
    month: { count: 6, labelFn: (i) => ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'][i] },
    year: { count: 3, labelFn: (i) => `${2024 + i}` },
  };
  const { count, labelFn } = configs[granularity];
  const bases = [980_000, 1_010_000, 1_050_000, 1_090_000, 1_140_000, 1_190_000, 1_199_070];
  return Array.from({ length: count }, (_, i) => {
    const base = bases[Math.min(i, bases.length - 1)];
    const variation = 0.96 + Math.sin(i * 1.3) * 0.04;
    const ns = Math.round(base * variation);
    const gp = Math.round(ns * 0.6);
    const np = Math.round(ns * 0.205);
    return { label: labelFn(i), netSales: ns, grossProfit: gp, netProfit: np };
  });
}

function buildStackedSeries(granularity: AnalyticsGranularity): StackedBarPoint[] {
  const trend = buildTrendSeries(granularity);
  return trend.map((p) => ({
    label: p.label,
    revenue: p.netSales,
    costs: Math.round(p.netSales * 0.795),
    profit: p.netProfit,
  }));
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatCurrency(v: number, compact = false): string {
  if (compact) {
    if (v >= 1_000_000) return `₱${(v / 1_000_000).toFixed(2)}M`;
    if (v >= 1_000) return `₱${(v / 1_000).toFixed(1)}K`;
    return `₱${v.toLocaleString()}`;
  }
  return `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatPct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

function calcDeltaPct(current: number, prior: number): number {
  if (prior === 0) return 0;
  return ((current - prior) / prior) * 100;
}

// ─── View Options ─────────────────────────────────────────────────────────────

type ProfitView = 'chart' | 'table';

const VIEW_OPTIONS: ViewOption<ProfitView>[] = [
  { id: 'chart', label: 'Chart View', icon: BarChart3 },
  { id: 'table', label: 'Table View', icon: TableProperties },
];

// ─── AnalyticsCard ────────────────────────────────────────────────────────────

function AnalyticsCard({
  icon: Icon,
  title,
  description,
  children,
  className = '',
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex h-full flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm ${className}`}>
      <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50/40 px-5 py-4 flex-shrink-0">
        <Icon className="h-4 w-4 shrink-0 text-gray-400" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{title}</p>
          {description && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{description}</p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

type KpiColor = 'blue' | 'emerald' | 'rose' | 'amber';

const KPI_COLOR_MAP: Record<KpiColor, { bg: string; text: string; icon: string }> = {
  blue: { bg: 'bg-primary-50', text: 'text-primary-600', icon: 'text-primary-500' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', icon: 'text-emerald-500' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-600', icon: 'text-rose-500' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600', icon: 'text-amber-500' },
};

function KpiCard({
  icon: Icon,
  label,
  value,
  deltaPct,
  deltaCaption,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  deltaPct: number;
  deltaCaption: string;
  color: KpiColor;
}) {
  const c = KPI_COLOR_MAP[color];
  const isUp = deltaPct > 0;
  const isFlat = deltaPct === 0;
  const DeltaIcon = isFlat ? Minus : isUp ? ArrowUpRight : ArrowDownRight;
  const deltaColor = isFlat ? 'text-gray-400' : isUp ? 'text-emerald-600' : 'text-rose-600';
  const deltaBg = isFlat ? 'bg-gray-100' : isUp ? 'bg-emerald-50' : 'bg-rose-50';

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${c.bg}`}>
          <Icon className={`h-3.5 w-3.5 ${c.icon}`} />
        </div>
      </div>
      <div>
        <p className={`text-2xl font-bold ${c.text} tabular-nums`}>{value}</p>
      </div>
      <div className={`flex items-center gap-1.5 rounded-lg px-2 py-1 w-fit ${deltaBg}`}>
        <DeltaIcon className={`h-3.5 w-3.5 ${deltaColor}`} />
        <span className={`text-xs font-semibold tabular-nums ${deltaColor}`}>
          {isFlat ? '—' : formatPct(deltaPct)}
        </span>
        <span className="text-xs text-gray-400">{deltaCaption}</span>
      </div>
    </div>
  );
}

// ─── Waterfall Chart ──────────────────────────────────────────────────────────

const WATERFALL_STEPS = [
  { key: 'grossSales', label: 'Gross Sales', type: 'positive' as const },
  { key: 'discounts', label: '− Discounts', type: 'negative' as const },
  { key: 'refunds', label: '− Refunds', type: 'negative' as const },
  { key: 'netSales', label: 'Net Sales', type: 'total' as const },
  { key: 'cogs', label: '− COGS', type: 'negative' as const },
  { key: 'grossProfit', label: 'Gross Profit', type: 'total' as const },
  { key: 'variableExpenses', label: '− Variable', type: 'negative' as const },
  { key: 'grossSalary', label: '− Salary', type: 'negative' as const },
  { key: 'operatingProfit', label: 'Op. Profit', type: 'total' as const },
  { key: 'overheadExpenses', label: '− Overhead', type: 'negative' as const },
  { key: 'netProfit', label: 'Net Profit', type: 'total' as const },
];

function buildWaterfallData(snap: ProfitabilitySnapshot) {
  let running = 0;
  return WATERFALL_STEPS.map((step) => {
    const raw = snap[step.key as keyof ProfitabilitySnapshot] as number;
    let offset = 0;
    let value = 0;

    if (step.type === 'positive') {
      offset = 0;
      value = raw;
      running = raw;
    } else if (step.type === 'negative') {
      running -= raw;
      offset = running;
      value = raw;
    } else {
      // total — show as a full bar from 0
      offset = 0;
      value = running;
    }

    return {
      label: step.label,
      offset: step.type === 'total' ? 0 : offset,
      value: step.type === 'total' ? running : value,
      type: step.type,
    };
  });
}

const TYPE_COLOR = {
  positive: '#2563eb', // primary-600
  negative: '#f43f5e', // rose-500
  total: '#059669',    // emerald-600
};

function CustomWaterfallTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const entry = payload.find((p: any) => p.dataKey === 'value');
  if (!entry) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold text-gray-700">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-gray-900">{formatCurrency(entry.value)}</p>
    </div>
  );
}

function WaterfallChartCard({ snap }: { snap: ProfitabilitySnapshot }) {
  const data = buildWaterfallData(snap);

  return (
    <AnalyticsCard
      icon={Activity}
      title="Profit Waterfall"
      description="Gross Sales → Net Profit flow"
      className="h-full"
    >
      <div className="p-4 flex-1" style={{ minHeight: 300 }}>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={false}
              angle={-35}
              textAnchor="end"
              height={48}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatCurrency(v, true)}
              width={64}
            />
            <Tooltip content={<CustomWaterfallTooltip />} />
            {/* Invisible offset bar to lift the visible bar */}
            <Bar dataKey="offset" stackId="a" fill="transparent" radius={[0, 0, 0, 0]} />
            {/* Visible value bar */}
            <Bar dataKey="value" stackId="a" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={TYPE_COLOR[entry.type]}
                  opacity={0.9}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {/* Legend */}
        <div className="mt-2 flex items-center justify-center gap-5">
          {(['positive', 'negative', 'total'] as const).map((t) => (
            <div key={t} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: TYPE_COLOR[t] }} />
              <span className="text-xs text-gray-500 capitalize">
                {t === 'positive' ? 'Inflow' : t === 'negative' ? 'Deduction' : 'Total'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </AnalyticsCard>
  );
}

// ─── Margin Panel ──────────────────────────────────────────────────────────────

function MarginGauge({ label, pct, color }: { label: string; pct: number; color: string }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-600">{label}</span>
        <span className="text-lg font-bold tabular-nums" style={{ color }}>{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${clamped}%` }}
          transition={{ duration: 0.8, ease: [0.2, 0, 0, 1] }}
        />
      </div>
    </div>
  );
}

function MarginPanel({ snap, prior }: { snap: ProfitabilitySnapshot; prior: ProfitabilitySnapshot }) {
  const grossDelta = snap.grossMarginPct - prior.grossMarginPct;
  const netDelta = snap.netMarginPct - prior.netMarginPct;
  const expDelta = snap.expenseRatio - prior.expenseRatio;

  const DeltaBadge = ({ delta }: { delta: number }) => {
    const isUp = delta > 0;
    const isFlat = Math.abs(delta) < 0.05;
    const color = isFlat ? 'text-gray-400' : isUp ? 'text-emerald-600' : 'text-rose-600';
    const Icon = isFlat ? Minus : isUp ? ArrowUpRight : ArrowDownRight;
    return (
      <span className={`flex items-center gap-0.5 text-xs font-semibold ${color}`}>
        <Icon className="h-3 w-3" />
        {isFlat ? '—' : `${Math.abs(delta).toFixed(1)}pp`}
      </span>
    );
  };

  return (
    <AnalyticsCard
      icon={Percent}
      title="Margin Analysis"
      description="Profitability ratios"
      className="h-full"
    >
      <div className="flex flex-col gap-5 p-5">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs text-gray-400">vs prior period</span>
            <DeltaBadge delta={grossDelta} />
          </div>
          <MarginGauge label="Gross Margin" pct={snap.grossMarginPct} color="#059669" />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs text-gray-400">vs prior period</span>
            <DeltaBadge delta={netDelta} />
          </div>
          <MarginGauge label="Net Margin" pct={snap.netMarginPct} color="#2563eb" />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs text-gray-400">vs prior period</span>
            <DeltaBadge delta={-expDelta} />
          </div>
          <MarginGauge label="Expense Ratio" pct={snap.expenseRatio} color="#f59e0b" />
        </div>

        <div className="mt-1 rounded-lg bg-gray-50 border border-gray-100 p-3 space-y-2.5">
          {[
            { label: 'Gross Profit', value: formatCurrency(snap.grossProfit, true), color: 'text-emerald-600' },
            { label: 'Operating Profit', value: formatCurrency(snap.operatingProfit, true), color: 'text-primary-600' },
            { label: 'Net Profit', value: formatCurrency(snap.netProfit, true), color: 'text-emerald-700' },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between">
              <span className="text-xs text-gray-500">{row.label}</span>
              <span className={`text-sm font-bold tabular-nums ${row.color}`}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </AnalyticsCard>
  );
}

// ─── Trend Line Chart ─────────────────────────────────────────────────────────

function CustomTrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 shadow-lg space-y-1">
      <p className="text-xs font-semibold text-gray-600 mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-xs text-gray-500">{p.name}</span>
          <span className="text-xs font-bold text-gray-800 tabular-nums ml-auto">
            {formatCurrency(p.value, true)}
          </span>
        </div>
      ))}
    </div>
  );
}

function TrendLineCard({ trend }: { trend: TrendPoint[] }) {
  return (
    <AnalyticsCard
      icon={TrendingUp}
      title="Revenue & Profit Trend"
      description="Net Sales · Gross Profit · Net Profit over period"
      className="h-full"
    >
      <div className="p-4 flex-1" style={{ minHeight: 260 }}>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} tickFormatter={(v) => formatCurrency(v, true)} width={60} />
            <Tooltip content={<CustomTrendTooltip />} />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ paddingTop: 12, fontSize: 12 }}
            />
            <Line
              type="monotone"
              dataKey="netSales"
              name="Net Sales"
              stroke="#2563eb"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="grossProfit"
              name="Gross Profit"
              stroke="#059669"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              strokeDasharray="4 2"
            />
            <Line
              type="monotone"
              dataKey="netProfit"
              name="Net Profit"
              stroke="#7c3aed"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              strokeDasharray="2 3"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </AnalyticsCard>
  );
}

// ─── Stacked Bar Chart ────────────────────────────────────────────────────────

function StackedBarCard({ series }: { series: StackedBarPoint[] }) {
  return (
    <AnalyticsCard
      icon={Layers}
      title="Revenue vs Costs vs Profit"
      description="Per period breakdown"
      className="h-full"
    >
      <div className="p-4 flex-1" style={{ minHeight: 260 }}>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} tickFormatter={(v) => formatCurrency(v, true)} width={60} />
            <Tooltip
              formatter={(value: number, name: string) => [formatCurrency(value, true), name]}
              contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
            />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ paddingTop: 12, fontSize: 12 }} />
            <Bar dataKey="revenue" name="Revenue" fill="#2563eb" opacity={0.8} radius={[2, 2, 0, 0]} />
            <Bar dataKey="costs" name="Costs" fill="#f43f5e" opacity={0.75} radius={[2, 2, 0, 0]} />
            <Bar dataKey="profit" name="Profit" fill="#059669" opacity={0.85} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </AnalyticsCard>
  );
}

// ─── Cost Breakdown Donut ─────────────────────────────────────────────────────

const COST_COLORS = ['#f43f5e', '#f59e0b', '#8b5cf6', '#6b7280'];

function CostBreakdownCard({ snap }: { snap: ProfitabilitySnapshot }) {
  const data = [
    { name: 'COGS', value: snap.cogs },
    { name: 'Variable Exp.', value: snap.variableExpenses },
    { name: 'Gross Salary', value: snap.grossSalary },
    { name: 'Overhead', value: snap.overheadExpenses },
  ];
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <AnalyticsCard
      icon={Wallet}
      title="Cost Breakdown"
      description="Total operating costs"
      className="h-full"
    >
      <div className="flex flex-col gap-4 p-4">
        <div className="flex justify-center">
          <PieChart width={180} height={180}>
            <Pie
              data={data}
              cx={90}
              cy={90}
              innerRadius={54}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COST_COLORS[i]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number, name: string) => [formatCurrency(value, true), name]}
              contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
            />
          </PieChart>
        </div>
        <div className="space-y-2">
          {data.map((d, i) => {
            const pct = ((d.value / total) * 100).toFixed(1);
            return (
              <div key={d.name} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COST_COLORS[i] }} />
                <span className="flex-1 text-xs text-gray-600">{d.name}</span>
                <span className="text-xs font-semibold tabular-nums text-gray-800">{formatCurrency(d.value, true)}</span>
                <span className="w-10 text-right text-xs text-gray-400">{pct}%</span>
              </div>
            );
          })}
        </div>
        <div className="border-t border-gray-100 pt-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500">Total Costs</span>
          <span className="text-sm font-bold text-rose-600 tabular-nums">{formatCurrency(total, true)}</span>
        </div>
      </div>
    </AnalyticsCard>
  );
}

// ─── P&L Table ────────────────────────────────────────────────────────────────

interface TableRow {
  label: string;
  value: number;
  prior: number;
  indent?: boolean;
  isSection?: boolean;
  isTotal?: boolean;
  isSubtraction?: boolean;
}

function buildTableRows(snap: ProfitabilitySnapshot, prior: ProfitabilitySnapshot): TableRow[] {
  return [
    { label: 'REVENUE', value: 0, prior: 0, isSection: true },
    { label: 'Gross Sales', value: snap.grossSales, prior: prior.grossSales },
    { label: 'Less: Discounts', value: -snap.discounts, prior: -prior.discounts, indent: true, isSubtraction: true },
    { label: 'Less: Refunds', value: -snap.refunds, prior: -prior.refunds, indent: true, isSubtraction: true },
    { label: 'Net Sales', value: snap.netSales, prior: prior.netSales, isTotal: true },
    { label: 'COST OF GOODS SOLD', value: 0, prior: 0, isSection: true },
    { label: 'COGS', value: -snap.cogs, prior: -prior.cogs, isSubtraction: true },
    { label: 'Gross Profit', value: snap.grossProfit, prior: prior.grossProfit, isTotal: true },
    { label: 'OPERATING COSTS', value: 0, prior: 0, isSection: true },
    { label: 'Variable Expenses', value: -snap.variableExpenses, prior: -prior.variableExpenses, indent: true, isSubtraction: true },
    { label: 'Gross Salary', value: -snap.grossSalary, prior: -prior.grossSalary, indent: true, isSubtraction: true },
    { label: 'Operating Profit', value: snap.operatingProfit, prior: prior.operatingProfit, isTotal: true },
    { label: 'OVERHEAD', value: 0, prior: 0, isSection: true },
    { label: 'Overhead Expenses', value: -snap.overheadExpenses, prior: -prior.overheadExpenses, isSubtraction: true },
    { label: 'Net Profit', value: snap.netProfit, prior: prior.netProfit, isTotal: true },
  ];
}

function PnLTable({ snap, prior }: { snap: ProfitabilitySnapshot; prior: ProfitabilitySnapshot }) {
  const rows = buildTableRows(snap, prior);

  return (
    <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      {/* Table header */}
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 border-b border-gray-100 bg-gray-50/60 px-5 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Line Item</span>
        <span className="w-32 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Current</span>
        <span className="w-32 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Prior</span>
        <span className="w-20 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Change</span>
      </div>

      <div className="divide-y divide-gray-50">
        {rows.map((row, i) => {
          if (row.isSection) {
            return (
              <div key={i} className="bg-gray-50/80 px-5 py-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{row.label}</span>
              </div>
            );
          }

          const deltaPct = calcDeltaPct(Math.abs(row.value), Math.abs(row.prior));
          const isPositiveChange = row.isSubtraction
            ? row.value > row.prior   // smaller deduction = improvement
            : row.value > row.prior;
          const isZeroDelta = Math.abs(deltaPct) < 0.05;

          return (
            <div
              key={i}
              className={`grid grid-cols-[1fr_auto_auto_auto] gap-x-4 items-center px-5 py-3 ${
                row.isTotal ? 'bg-gray-50/50 font-semibold' : ''
              }`}
            >
              <span
                className={`text-sm ${row.indent ? 'pl-4 text-gray-500' : row.isTotal ? 'font-semibold text-gray-900' : 'text-gray-700'}`}
              >
                {row.label}
              </span>
              <span
                className={`w-32 text-right text-sm tabular-nums font-${row.isTotal ? 'bold' : 'medium'} ${
                  row.value < 0 ? 'text-rose-600' : row.isTotal ? 'text-emerald-700' : 'text-gray-800'
                }`}
              >
                {row.value < 0 ? `(${formatCurrency(Math.abs(row.value))})` : formatCurrency(row.value)}
              </span>
              <span
                className={`w-32 text-right text-sm tabular-nums ${row.prior < 0 ? 'text-rose-400' : 'text-gray-400'}`}
              >
                {row.prior < 0 ? `(${formatCurrency(Math.abs(row.prior))})` : formatCurrency(row.prior)}
              </span>
              <div className="w-20 flex justify-end">
                {isZeroDelta ? (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-400">—</span>
                ) : (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      isPositiveChange
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-rose-50 text-rose-700'
                    }`}
                  >
                    {isPositiveChange ? '▲' : '▼'} {Math.abs(deltaPct).toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Selected Branches Strip ──────────────────────────────────────────────────

function SelectedBranchesStrip() {
  const { selectedBranchIds, companyBranchGroups } = useBranchStore();

  const branchNames = useMemo(() => {
    const allBranches = companyBranchGroups.flatMap((g) => g.branches);
    return selectedBranchIds
      .map((id) => allBranches.find((b) => b.id === id)?.name)
      .filter(Boolean) as string[];
  }, [selectedBranchIds, companyBranchGroups]);

  if (branchNames.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 text-gray-400">
        <GitBranch className="h-3.5 w-3.5" />
        <span className="text-xs font-semibold uppercase tracking-wide">Selected Branches</span>
      </div>
      {branchNames.map((name) => (
        <span
          key={name}
          className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700"
        >
          {name}
        </span>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ProfitabilityAnalyticsPage() {
  const [analyticsRange, setAnalyticsRange] = useState<AnalyticsRangeSelection>(() =>
    createDefaultRangeForGranularity('day'),
  );
  const [activeView, setActiveView] = useState<ProfitView>('chart');

  const granularity = analyticsRange.granularity;
  const trend = useMemo(() => buildTrendSeries(granularity), [granularity]);
  const stacked = useMemo(() => buildStackedSeries(granularity), [granularity]);
  const periodLabel = useMemo(() => getSummaryForSelection(analyticsRange), [analyticsRange]);

  // TODO: replace MOCK_CURRENT / MOCK_PRIOR with real API data
  const snap = MOCK_CURRENT;
  const prior = MOCK_PRIOR;

  const kpiCards = [
    {
      icon: ShoppingCart,
      label: 'Gross Sales',
      value: formatCurrency(snap.grossSales, true),
      deltaPct: calcDeltaPct(snap.grossSales, prior.grossSales),
      deltaCaption: 'vs prior',
      color: 'blue' as KpiColor,
    },
    {
      icon: Receipt,
      label: 'Net Sales',
      value: formatCurrency(snap.netSales, true),
      deltaPct: calcDeltaPct(snap.netSales, prior.netSales),
      deltaCaption: 'vs prior',
      color: 'blue' as KpiColor,
    },
    {
      icon: TrendingUp,
      label: 'Gross Profit',
      value: formatCurrency(snap.grossProfit, true),
      deltaPct: calcDeltaPct(snap.grossProfit, prior.grossProfit),
      deltaCaption: 'vs prior',
      color: 'emerald' as KpiColor,
    },
    {
      icon: Activity,
      label: 'Operating Profit',
      value: formatCurrency(snap.operatingProfit, true),
      deltaPct: calcDeltaPct(snap.operatingProfit, prior.operatingProfit),
      deltaCaption: 'vs prior',
      color: 'emerald' as KpiColor,
    },
    {
      icon: DollarSign,
      label: 'Net Profit',
      value: formatCurrency(snap.netProfit, true),
      deltaPct: calcDeltaPct(snap.netProfit, prior.netProfit),
      deltaCaption: 'vs prior',
      color: snap.netProfit >= 0 ? ('emerald' as KpiColor) : ('rose' as KpiColor),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-primary-600" />
            <h1 className="text-2xl font-bold text-gray-900">Profitability Analytics</h1>
          </div>
          <p className="mt-1 hidden text-sm text-gray-500 sm:block">
            Full P&amp;L view — Gross Sales to Net Profit.{' '}
            <span className="text-gray-400">{periodLabel}</span>
          </p>
        </div>
        <AnalyticsRangePicker
          value={analyticsRange}
          onChange={setAnalyticsRange}
          className="shrink-0 self-start sm:self-center"
        />
      </div>

      {/* Selected Branches */}
      <SelectedBranchesStrip />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {kpiCards.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>

      {/* View Toggle */}
      <ViewToggle
        options={VIEW_OPTIONS}
        activeId={activeView}
        onChange={setActiveView}
        layoutId="profitability-view-tabs"
      />

      {/* View Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeView}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeView === 'chart' && (
            <div className="space-y-6">
              {/* Row 1: Waterfall + Margin */}
              <div className="grid gap-4 lg:grid-cols-12">
                <div className="lg:col-span-7">
                  <WaterfallChartCard snap={snap} />
                </div>
                <div className="lg:col-span-5">
                  <MarginPanel snap={snap} prior={prior} />
                </div>
              </div>

              {/* Row 2: Trend Line */}
              <TrendLineCard trend={trend} />

              {/* Row 3: Stacked Bar + Cost Breakdown */}
              <div className="grid gap-4 lg:grid-cols-12">
                <div className="lg:col-span-7">
                  <StackedBarCard series={stacked} />
                </div>
                <div className="lg:col-span-5">
                  <CostBreakdownCard snap={snap} />
                </div>
              </div>
            </div>
          )}

          {activeView === 'table' && (
            <PnLTable snap={snap} prior={prior} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
