import {
  BarChart2,
  TrendingUp,
  Trophy,
  AlertTriangle,
  Calendar,
  ChevronRight,
  ChevronLeft,
  ArrowLeft,
  Activity,
  Plus,
  X,
  Target,
  Users,
  TrendingDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Select } from '@/shared/components/ui/Select';
import { useState, useMemo } from 'react';
import { ViewToggle, type ViewOption } from '@/shared/components/ui/ViewToggle';
import { SingleUserSelect, type UserEntry } from '../components/SingleUserSelect';

// ─── Skeleton Primitives ─────────────────────────────────────────────────────

function Bone({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`animate-pulse rounded-md bg-gray-100 ${className}`} style={style} />
  );
}

/** Reusable skeleton shell that matches AnalyticsCard's header */
function SkeletonCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm h-full ${className}`}>
      {/* Header skeleton */}
      <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50/40 px-5 py-4 flex-shrink-0">
        <Bone className="h-4 w-4 rounded-full" />
        <div className="flex flex-col gap-1.5 flex-1">
          <Bone className="h-2.5 w-28" />
          <Bone className="h-2 w-20" />
        </div>
      </div>
      {children}
    </div>
  );
}

function SkeletonEpiCard() {
  return (
    <div className="animate-pulse relative flex flex-col justify-between overflow-hidden rounded-xl p-5 shadow-sm h-full min-h-[160px] bg-gray-200">
      <Bone className="h-2.5 w-32 bg-gray-300/60" />
      <Bone className="h-14 w-28 mt-3 bg-gray-300/60" />
      <div className="mt-4 flex items-center gap-2 border-t border-gray-300/40 pt-3">
        <Bone className="h-5 w-14 rounded-full bg-gray-300/60" />
        <Bone className="h-2 w-24 bg-gray-300/60" />
      </div>
    </div>
  );
}

function SkeletonAwardsCard() {
  return (
    <SkeletonCard>
      <div className="flex flex-col gap-3 p-4 flex-1">
        {[0, 1].map(i => (
          <div key={i} className="rounded-lg border border-gray-100 p-4 flex flex-col gap-2">
            <Bone className="h-2.5 w-20" />
            <Bone className="h-8 w-12" />
          </div>
        ))}
      </div>
    </SkeletonCard>
  );
}

function SkeletonLeaderboardCard() {
  return (
    <SkeletonCard>
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y divide-gray-100 sm:divide-y-0 sm:divide-x p-4 sm:p-5 gap-0 flex-1">
        {[0, 1].map(col => (
          <div key={col} className={`flex flex-col ${col === 0 ? 'pb-4 sm:pb-0 sm:pr-6' : 'pt-4 sm:pt-0 sm:pl-6'}`}>
            <Bone className="h-2.5 w-24 mb-3" />
            <div className="space-y-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between px-2 py-2">
                  <div className="flex items-center gap-2">
                    <Bone className="h-2 w-3" />
                    <Bone className={`h-3 ${i % 2 === 0 ? 'w-28' : 'w-24'}`} />
                  </div>
                  <Bone className="h-3 w-8" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </SkeletonCard>
  );
}

function SkeletonTrendCard() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm h-full animate-pulse">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-gray-100 bg-gray-50/40 px-5 py-4 flex-shrink-0">
        <Bone className="h-4 w-4 rounded-full" />
        <div className="flex flex-col gap-1.5">
          <Bone className="h-2.5 w-32" />
          <Bone className="h-2 w-24" />
        </div>
      </div>
      {/* Controls strip */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 px-4 sm:px-5 pt-4 pb-3 border-b border-gray-50">
        <div className="grid grid-cols-2 sm:flex gap-3">
          <div className="flex flex-col gap-1.5">
            <Bone className="h-2 w-20" />
            <Bone className="h-8 w-full sm:w-44 rounded-lg" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Bone className="h-2 w-12" />
            <Bone className="h-8 w-full sm:w-52 rounded-lg" />
          </div>
        </div>
        <Bone className="h-6 w-28 rounded-full" />
      </div>
      {/* Chart area */}
      <div className="p-3 sm:p-5 flex-1 flex flex-col justify-between" style={{ minHeight: 240 }}>
        <div className="flex items-end justify-between gap-1 flex-1">
          {[55, 70, 45, 80, 60, 90, 65].map((h, i) => (
            <Bone key={i} className="flex-1 rounded-t-sm" style={{ height: `${h}%` }} />
          ))}
        </div>
        <div className="flex justify-between mt-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <Bone key={i} className="h-2 w-6 sm:w-8" />
          ))}
        </div>
      </div>
    </div>
  );
}

function SkeletonAlertsCard() {
  return (
    <SkeletonCard>
      <div className="divide-y divide-gray-50 flex-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-3 p-4">
            <div className="flex items-start gap-3">
              <Bone className="mt-0.5 h-8 w-8 flex-shrink-0 rounded-lg" />
              <div className="flex-1 flex flex-col gap-1.5">
                <Bone className="h-2 w-20" />
                <Bone className="h-3 w-28" />
                <Bone className="h-2 w-full" />
                <Bone className="h-2 w-3/4" />
              </div>
            </div>
            <Bone className="h-3 w-12 self-end" />
          </div>
        ))}
      </div>
    </SkeletonCard>
  );
}

function SkeletonRadarCard() {
  return (
    <SkeletonCard>
      <div className="flex-1 p-4 flex items-center justify-center min-h-[280px] sm:min-h-[320px]">
        {/* Concentric polygon approximation with circles */}
        <div className="relative flex items-center justify-center w-full h-full">
          <div className="animate-pulse flex items-center justify-center w-56 h-56">
            <div className="absolute w-56 h-56 rounded-full border-2 border-gray-100" />
            <div className="absolute w-40 h-40 rounded-full border-2 border-gray-100" />
            <div className="absolute w-24 h-24 rounded-full border-2 border-gray-100" />
            <Bone className="w-32 h-32 rounded-full opacity-40" />
          </div>
        </div>
      </div>
    </SkeletonCard>
  );
}

function SkeletonDistributionCard() {
  return (
    <SkeletonCard>
      <div className="p-5 flex flex-col flex-1 gap-4">
        {/* Bar chart */}
        <div className="flex items-end justify-between gap-2 h-[200px]">
          {[60, 35, 75, 100, 45].map((h, i) => (
            <div key={i} className="flex flex-col items-center gap-1 flex-1">
              <Bone className="w-full animate-pulse rounded-t-sm" style={{ height: `${h}%` }} />
              <Bone className="h-2 w-8 mt-1" />
            </div>
          ))}
        </div>
        {/* Legend */}
        <div className="grid grid-cols-5 gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <Bone className="h-1.5 w-full rounded-full" />
              <Bone className="h-2 w-6" />
              <Bone className="h-2 w-8" />
            </div>
          ))}
        </div>
        {/* Summary */}
        <Bone className="h-10 w-full rounded-lg" />
      </div>
    </SkeletonCard>
  );
}

function EmployeeAnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between animate-pulse">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <Bone className="h-5 w-5 rounded" />
            <Bone className="h-6 w-48" />
          </div>
          <Bone className="h-3 w-64 hidden sm:block" />
        </div>
        <Bone className="h-7 w-28 rounded-lg hidden sm:block" />
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <div className="col-span-2 sm:col-span-1">
          <SkeletonEpiCard />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <SkeletonAwardsCard />
        </div>
        <div className="col-span-2">
          <SkeletonLeaderboardCard />
        </div>
      </div>

      {/* Trend + Alerts */}
      <div className="grid gap-4 lg:grid-cols-10">
        <div className="lg:col-span-7">
          <SkeletonTrendCard />
        </div>
        <div className="lg:col-span-3">
          <SkeletonAlertsCard />
        </div>
      </div>

      {/* Radar + Distribution */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <SkeletonRadarCard />
        </div>
        <div className="lg:col-span-2">
          <SkeletonDistributionCard />
        </div>
      </div>
    </div>
  );
}
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  BarChart,
  Bar,
  Cell,
  LineChart,
  Line,
} from 'recharts';

// ─── Data ────────────────────────────────────────────────────────────────────

const TOP_PERFORMERS = [
  { name: 'Sarah Jenkins', epi: 98.2 },
  { name: 'Marcus Chen', epi: 97.5 },
  { name: 'Elena Rodriguez', epi: 96.8 },
  { name: 'David Park', epi: 95.9 },
  { name: 'Linda Wu', epi: 95.4 },
];

const PRIORITY_REVIEW = [
  { name: 'Robert Taylor', epi: 42.1 },
  { name: 'Kimberley Glass', epi: 44.8 },
  { name: 'Jason Miller', epi: 46.2 },
  { name: 'Samantha Reed', epi: 48.0 },
  { name: 'Tom Higgins', epi: 50.3 },
];

const ANALYTICS_USERS = [
  ...TOP_PERFORMERS.map(p => p.name),
  ...PRIORITY_REVIEW.map(p => p.name),
];

const ANALYTICS_USER_ENTRIES: UserEntry[] = [
  ...TOP_PERFORMERS.map(p => ({ id: p.name.toLowerCase().replace(' ', '-'), name: p.name, role: 'Senior Service Crew' })),
  ...PRIORITY_REVIEW.map(p => ({ id: p.name.toLowerCase().replace(' ', '-'), name: p.name, role: 'Service Crew' })),
];

const BRANCH_AVERAGES = {
  epi: 85.4,
  awards: 8.2,
  violations: 1.4,
  'customer-service': 88.5,
  'workplace-relations': 87.2,
  'professional-conduct': 89.1,
  'attendance-rate': 98.4,
  'punctuality-rate': 96.8,
  'productivity-rate': 82.5,
  'average-order-value': 385.20,
  'uniform-compliance': 98.8,
  'hygiene-compliance': 96.5,
  'sop-compliance': 95.2,
};

const getPersonalizedStats = (userName: string) => {
  const seed = userName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  
  const getVal = (base: number, range: number) => {
    return parseFloat((base + (seed % range) - (range / 2)).toFixed(1));
  };

  return {
    epi: getVal(BRANCH_AVERAGES.epi, 15),
    epiTrend: getVal(2, 4),
    awards: Math.floor(getVal(BRANCH_AVERAGES.awards, 10)),
    violations: Math.floor(Math.max(0, getVal(BRANCH_AVERAGES.violations, 4))),
    metrics: {
      'customer-service': getVal(BRANCH_AVERAGES['customer-service'], 12),
      'workplace-relations': getVal(BRANCH_AVERAGES['workplace-relations'], 12),
      'professional-conduct': getVal(BRANCH_AVERAGES['professional-conduct'], 12),
      'attendance-rate': Math.min(100, getVal(BRANCH_AVERAGES['attendance-rate'], 5)),
      'punctuality-rate': Math.min(100, getVal(BRANCH_AVERAGES['punctuality-rate'], 8)),
      'productivity-rate': getVal(BRANCH_AVERAGES['productivity-rate'], 20),
      'average-order-value': getVal(BRANCH_AVERAGES['average-order-value'], 150),
      'uniform-compliance': Math.min(100, getVal(BRANCH_AVERAGES['uniform-compliance'], 5)),
      'hygiene-compliance': Math.min(100, getVal(BRANCH_AVERAGES['hygiene-compliance'], 10)),
      'sop-compliance': Math.min(100, getVal(BRANCH_AVERAGES['sop-compliance'], 15)),
    }
  };
};

const METRICS = [
  { id: 'customer-service', label: 'Customer Service Score' },
  { id: 'workplace-relations', label: 'Workplace Relations Score' },
  { id: 'professional-conduct', label: 'Professional Conduct Score' },
  { id: 'attendance-rate', label: 'Attendance Rate' },
  { id: 'punctuality-rate', label: 'Punctuality Rate' },
  { id: 'productivity-rate', label: 'Productivity Rate' },
  { id: 'average-order-value', label: 'Average Order Value' },
  { id: 'uniform-compliance', label: 'Uniform Compliance' },
  { id: 'hygiene-compliance', label: 'Hygiene Compliance' },
  { id: 'sop-compliance', label: 'SOP Compliance' },
];

const WEEKLY_ALERTS = [
  {
    id: 1,
    employee: 'Sarah Jenkins',
    message: "Uniform compliance on a downtrend for the last 7 days.",
    type: 'warning',
    metric: 'Uniform Compliance',
  },
  {
    id: 2,
    employee: 'Marcus Chen',
    message: "Productivity rate up 15% this week, exceeding targets.",
    type: 'success',
    metric: 'Productivity Rate',
  },
  {
    id: 3,
    employee: 'Elena Rodriguez',
    message: "SOP compliance is 8% below the branch target of 95%.",
    type: 'warning',
    metric: 'SOP Compliance',
  },
];

const EPI_TREND_12W = [
  { week: 'W1',  epi: 81.2 },
  { week: 'W2',  epi: 80.8 },
  { week: 'W3',  epi: 82.1 },
  { week: 'W4',  epi: 81.7 },
  { week: 'W5',  epi: 83.0 },
  { week: 'W6',  epi: 82.4 },
  { week: 'W7',  epi: 83.9 },
  { week: 'W8',  epi: 84.1 },
  { week: 'W9',  epi: 83.6 },
  { week: 'W10', epi: 84.8 },
  { week: 'W11', epi: 85.1 },
  { week: 'W12', epi: 85.4 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getLast7Days = () => {
  const dates = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  }
  return dates;
};

const generateMockTrendData = (users: string[], metricId: string) => {
  const dates = getLast7Days();
  return dates.map((date, i) => {
    const dataPoint: any = { date };
    users.forEach(user => {
      const seed = (user + metricId).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const base = seed % 20 + 75;
      const variance = Math.sin(seed + i) * 10;
      dataPoint[user] = parseFloat(Math.min(100, Math.max(0, base + variance)).toFixed(1));
    });
    return dataPoint;
  });
};

const generateRadarData = (user: string) => {
  return METRICS.map(m => {
    const seed = (user + m.id).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return {
      subject: m.label
        .replace(' Score', '')
        .replace(' Rate', '')
        .replace(' Compliance', '')
        .replace('Professional Conduct', 'Prof. Conduct')
        .replace('Workplace Relations', 'Workplace Rel.'),
      A: 60 + (seed % 40),
      fullMark: 100,
    };
  });
};

const generateDistributionData = () => [
  { range: '0–50', count: 4, fill: '#ef4444' },
  { range: '51–70', count: 12, fill: '#f59e0b' },
  { range: '71–85', count: 28, fill: '#3b82f6' },
  { range: '86–95', count: 42, fill: '#10b981' },
  { range: '96–100', count: 14, fill: '#059669' },
];

const CHART_COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#ea580c'];

// ─── Shared Card Primitives ───────────────────────────────────────────────────

interface AnalyticsCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  headerRight?: React.ReactNode;
}

function AnalyticsCard({ icon, title, subtitle, children, className = '', headerRight }: AnalyticsCardProps) {
  return (
    <div className={`flex flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm h-full ${className}`}>
      {/* Unified card header */}
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/40 px-5 py-4 flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex-shrink-0 text-primary-600">{icon}</span>
          <div className="min-w-0">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 leading-none">
              {title}
            </h3>
            {subtitle && (
              <p className="mt-0.5 text-xs text-gray-400 truncate">{subtitle}</p>
            )}
          </div>
        </div>
        {headerRight && <div className="flex-shrink-0">{headerRight}</div>}
      </div>
      {/* Card body */}
      <div className="flex flex-col flex-1">{children}</div>
    </div>
  );
}

// ─── Stat Cards Row ───────────────────────────────────────────────────────────

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, delay: i * 0.07, ease: 'easeOut' as const },
  }),
};

function GlobalEpiCard() {
  return (
    <motion.div custom={0} variants={cardVariants} initial="hidden" animate="visible" className="h-full">
      <div
        className="relative flex flex-col overflow-hidden rounded-xl shadow-sm h-full min-h-[160px]"
        style={{
          background:
            'linear-gradient(150deg, rgb(var(--primary-600)) 0%, rgb(var(--primary-700)) 60%, rgb(var(--primary-800)) 100%)',
        }}
      >
        {/* Decorative rings */}
        <div
          className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full opacity-[0.08]"
          style={{ background: 'rgba(255,255,255,1)' }}
        />

        {/* Top section: label + number + badge */}
        <div className="px-5 pt-5 pb-3 flex-shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/55">
            Global Average EPI
          </p>

          <div className="mt-2 flex items-end gap-3">
            <span
              className="text-[48px] font-bold leading-none text-white tabular-nums"
              style={{ letterSpacing: '-2px' }}
            >
              85.4
            </span>
            <div className="mb-2 flex items-center gap-1.5">
              <span className="flex items-center gap-1 rounded-full bg-emerald-400/20 px-2.5 py-1 text-[11px] font-bold text-emerald-300 ring-1 ring-inset ring-emerald-400/20">
                <TrendingUp className="h-3 w-3" />
                +2.3
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
                from last week
              </span>
            </div>
          </div>

        </div>

        {/* Sparkline — fills remaining space */}
        <div className="flex-1 min-h-[80px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={EPI_TREND_12W} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="epi-line-glow" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.3)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0.9)" />
                </linearGradient>
              </defs>
              <YAxis domain={[78, 88]} hide />
              <Tooltip
                contentStyle={{
                  background: 'rgba(15,23,42,0.85)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '6px 10px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                }}
                labelStyle={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px', fontWeight: 700, marginBottom: '2px' }}
                itemStyle={{ color: '#fff', fontSize: '13px', fontWeight: 700 }}
                formatter={(v) => [v, 'EPI']}
              />
              <Line
                type="monotone"
                dataKey="epi"
                stroke="url(#epi-line-glow)"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, fill: '#fff', strokeWidth: 0 }}
                animationDuration={1200}
                animationEasing="ease-out"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Footer strip */}
        <div className="flex items-center justify-end px-5 py-2.5 border-t border-white/10 flex-shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
            12-week trend
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function AwardsViolationsCard() {
  return (
    <motion.div custom={1} variants={cardVariants} initial="hidden" animate="visible" className="h-full">
      <AnalyticsCard
        icon={<Trophy className="h-4 w-4" />}
        title="Recognition"
        subtitle="Last 30 days"
      >
        <div className="flex flex-col gap-3 p-4 flex-1">
          {/* Awards */}
          <div className="group flex cursor-pointer items-center justify-between rounded-lg border border-emerald-100/60 bg-emerald-50/50 px-4 py-3 transition-colors duration-200 hover:bg-emerald-50">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Trophy className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600/70">Total Awards</span>
              </div>
              <span className="text-3xl font-bold leading-none text-emerald-900 tabular-nums">12</span>
            </div>
            <ChevronRight className="h-4 w-4 text-emerald-300 opacity-0 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0" />
          </div>

          {/* Violations */}
          <div className="group flex cursor-pointer items-center justify-between rounded-lg border border-red-100/60 bg-red-50/50 px-4 py-3 transition-colors duration-200 hover:bg-red-50">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-red-600/70">Total Violations</span>
              </div>
              <span className="text-3xl font-bold leading-none text-red-900 tabular-nums">3</span>
            </div>
            <ChevronRight className="h-4 w-4 text-red-300 opacity-0 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0" />
          </div>
        </div>
      </AnalyticsCard>
    </motion.div>
  );
}

function LeaderboardCard() {
  const navigate = useNavigate();

  return (
    <motion.div custom={2} variants={cardVariants} initial="hidden" animate="visible" className="h-full">
      <AnalyticsCard icon={<Users className="h-4 w-4" />} title="Leaderboard" subtitle="EPI Score Rankings">
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y divide-gray-100 sm:divide-y-0 sm:divide-x p-4 sm:p-5 gap-0 flex-1">
          {/* Top Performers */}
          <div className="pb-4 sm:pb-0 sm:pr-6">
            <div className="flex items-center gap-1.5 mb-2.5">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Top Performers</span>
            </div>
            <div className="space-y-0.5">
              {TOP_PERFORMERS.map((employee, idx) => (
                <motion.div
                  key={employee.name}
                  variants={{
                    hidden: { opacity: 0, x: -8 },
                    visible: { opacity: 1, x: 0, transition: { delay: 0.1 + idx * 0.05, ease: 'easeOut', duration: 0.3 } },
                    hover: { x: 3, transition: { type: 'tween', duration: 0.12, ease: 'easeOut' } },
                    rest: { x: 0, transition: { type: 'tween', duration: 0.12, ease: 'easeOut' } },
                  }}
                  initial="hidden"
                  animate="visible"
                  whileHover="hover"
                  onClick={() => navigate('/employee-profiles')}
                  className="group flex cursor-pointer items-center justify-between rounded-md px-2 py-2 transition-colors hover:bg-gray-50 active:bg-gray-100"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-4 text-[10px] font-bold text-gray-300 tabular-nums flex-shrink-0">
                      {idx + 1}
                    </span>
                    <span className="text-sm font-medium text-gray-700 group-hover:text-primary-600 transition-colors truncate">
                      {employee.name}
                    </span>
                  </div>
                  <span className="ml-2 text-sm font-bold text-emerald-600 tabular-nums flex-shrink-0">
                    {employee.epi.toFixed(1)}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Priority Review */}
          <div className="pt-4 sm:pt-0 sm:pl-6">
            <div className="flex items-center gap-1.5 mb-2.5">
              <TrendingDown className="h-3.5 w-3.5 text-red-500" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-red-600">Priority Review</span>
            </div>
            <div className="space-y-0.5">
              {PRIORITY_REVIEW.map((employee, idx) => (
                <motion.div
                  key={employee.name}
                  variants={{
                    hidden: { opacity: 0, x: -8 },
                    visible: { opacity: 1, x: 0, transition: { delay: 0.1 + idx * 0.05, ease: 'easeOut', duration: 0.3 } },
                    hover: { x: 3, transition: { type: 'tween', duration: 0.12, ease: 'easeOut' } },
                    rest: { x: 0, transition: { type: 'tween', duration: 0.12, ease: 'easeOut' } },
                  }}
                  initial="hidden"
                  animate="visible"
                  whileHover="hover"
                  onClick={() => navigate('/employee-profiles')}
                  className="group flex cursor-pointer items-center justify-between rounded-md px-2 py-2 transition-colors hover:bg-gray-50 active:bg-gray-100"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-4 text-[10px] font-bold text-gray-300 tabular-nums flex-shrink-0">
                      {idx + 1}
                    </span>
                    <span className="text-sm font-medium text-gray-700 group-hover:text-primary-600 transition-colors truncate">
                      {employee.name}
                    </span>
                  </div>
                  <span className="ml-2 text-sm font-bold text-red-500 tabular-nums flex-shrink-0">
                    {employee.epi.toFixed(1)}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </AnalyticsCard>
    </motion.div>
  );
}

// ─── Individual Employee View Components ────────────────────────────────────

const generatePersonalTrendData = (userName: string) => {
  const seed = userName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return EPI_TREND_12W.map((w, i) => ({
    week: w.week,
    epi: parseFloat((w.epi + ((seed + i * 7) % 10) - 5).toFixed(1)),
    branchAvg: w.epi,
  }));
};

const PERSONAL_INSIGHTS = [
  { type: 'strength' as const, metric: 'Customer Service', message: 'Consistently in the top 15% of branch for this metric over the last 4 weeks.' },
  { type: 'improving' as const, metric: 'Punctuality', message: 'Rate improved by 3.2% in the last 2 weeks compared to prior month average.' },
  { type: 'attention' as const, metric: 'SOP Compliance', message: 'Trending 4.1% below the branch target. Review recommended.' },
];

function PersonalEpiCard({ stats }: { stats: ReturnType<typeof getPersonalizedStats> }) {
  const personalTrend = useMemo(() => generatePersonalTrendData('employee'), []);

  return (
    <motion.div custom={0} variants={cardVariants} initial="hidden" animate="visible" className="h-full">
      <div
        className="relative flex flex-col overflow-hidden rounded-xl shadow-sm h-full min-h-[160px]"
        style={{
          background:
            'linear-gradient(150deg, rgb(var(--primary-600)) 0%, rgb(var(--primary-700)) 60%, rgb(var(--primary-800)) 100%)',
        }}
      >
        {/* Decorative rings */}
        <div
          className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full opacity-[0.08]"
          style={{ background: 'rgba(255,255,255,1)' }}
        />

        {/* Top section */}
        <div className="px-5 pt-5 pb-3 flex-shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/55">
            Personal EPI Score
          </p>

          <div className="mt-2 flex items-end gap-3">
            <span
              className="text-[48px] font-bold leading-none text-white tabular-nums"
              style={{ letterSpacing: '-2px' }}
            >
              {stats.epi.toFixed(1)}
            </span>
            <div className="mb-2 flex items-center gap-1.5">
              <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${
                stats.epiTrend >= 0
                  ? 'bg-emerald-400/20 text-emerald-300 ring-emerald-400/20'
                  : 'bg-red-400/20 text-red-300 ring-red-400/20'
              }`}>
                {stats.epiTrend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {stats.epiTrend >= 0 ? '+' : ''}{stats.epiTrend.toFixed(1)}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
                from last week
              </span>
            </div>
          </div>
        </div>

        {/* Sparkline */}
        <div className="flex-1 min-h-[80px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={personalTrend} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="personal-epi-glow" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.3)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0.9)" />
                </linearGradient>
              </defs>
              <YAxis domain={['dataMin - 3', 'dataMax + 3']} hide />
              <Tooltip
                contentStyle={{
                  background: 'rgba(15,23,42,0.85)',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '6px 10px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                }}
                labelStyle={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px', fontWeight: 700, marginBottom: '2px' }}
                itemStyle={{ color: '#fff', fontSize: '13px', fontWeight: 700 }}
                formatter={(v) => [v, 'EPI']}
              />
              <Line
                type="monotone"
                dataKey="epi"
                stroke="url(#personal-epi-glow)"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, fill: '#fff', strokeWidth: 0 }}
                animationDuration={1200}
                animationEasing="ease-out"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Footer strip */}
        <div className="flex items-center justify-between px-5 py-2.5 border-t border-white/10 flex-shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
            Branch Avg: {BRANCH_AVERAGES.epi}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
            12-week trend
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function PersonalRecognitionCard({ stats }: { stats: ReturnType<typeof getPersonalizedStats> }) {
  return (
    <motion.div custom={1} variants={cardVariants} initial="hidden" animate="visible" className="h-full">
      <AnalyticsCard
        icon={<Trophy className="h-4 w-4" />}
        title="Recognition"
        subtitle="Cumulative record"
      >
        <div className="flex flex-col gap-3 p-4 flex-1">
          {/* Awards */}
          <div className="group flex cursor-pointer items-center justify-between rounded-lg border border-emerald-100/60 bg-emerald-50/50 px-4 py-3 transition-colors duration-200 hover:bg-emerald-50">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Trophy className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600/70">Total Awards</span>
              </div>
              <span className="text-3xl font-bold leading-none text-emerald-900 tabular-nums">{stats.awards}</span>
            </div>
            <ChevronRight className="h-4 w-4 text-emerald-300 opacity-0 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0" />
          </div>

          {/* Violations */}
          <div className="group flex cursor-pointer items-center justify-between rounded-lg border border-red-100/60 bg-red-50/50 px-4 py-3 transition-colors duration-200 hover:bg-red-50">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-red-600/70">Violations</span>
              </div>
              <span className="text-3xl font-bold leading-none text-red-900 tabular-nums">{stats.violations}</span>
            </div>
            <ChevronRight className="h-4 w-4 text-red-300 opacity-0 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0" />
          </div>
        </div>
      </AnalyticsCard>
    </motion.div>
  );
}

function PersonalRankingCard({ stats }: { stats: ReturnType<typeof getPersonalizedStats> }) {
  const allEmployees = useMemo(() => {
    const entries = [...TOP_PERFORMERS, ...PRIORITY_REVIEW].sort((a, b) => b.epi - a.epi);
    return entries;
  }, []);

  const rank = useMemo(() => {
    const idx = allEmployees.findIndex(e => stats.epi >= e.epi);
    return idx === -1 ? allEmployees.length : idx + 1;
  }, [stats.epi, allEmployees]);

  return (
    <motion.div custom={2} variants={cardVariants} initial="hidden" animate="visible" className="h-full">
      <AnalyticsCard
        icon={<Users className="h-4 w-4" />}
        title="Branch Ranking"
        subtitle="Position among peers"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y divide-gray-100 sm:divide-y-0 sm:divide-x p-4 sm:p-5 gap-0 flex-1">
          {/* Rank Position */}
          <div className="pb-4 sm:pb-0 sm:pr-6 flex flex-col justify-center">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Target className="h-3.5 w-3.5 text-primary-500" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary-600">Current Position</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold text-gray-900 tabular-nums leading-none">#{rank}</span>
              <span className="text-sm text-gray-400 font-medium">of {allEmployees.length}</span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${((allEmployees.length - rank + 1) / allEmployees.length) * 100}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  className="h-full rounded-full bg-primary-500"
                />
              </div>
              <span className="text-[10px] font-bold text-gray-400">
                Top {Math.round(((rank) / allEmployees.length) * 100)}%
              </span>
            </div>
          </div>

          {/* Key Benchmarks */}
          <div className="pt-4 sm:pt-0 sm:pl-6 flex flex-col justify-center">
            <div className="flex items-center gap-1.5 mb-2.5">
              <BarChart2 className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">vs Branch</span>
            </div>
            <div className="space-y-3">
              {[
                { label: 'EPI Score', val: stats.epi, avg: BRANCH_AVERAGES.epi },
                { label: 'Compliance', val: stats.metrics['hygiene-compliance'], avg: BRANCH_AVERAGES['hygiene-compliance'] },
                { label: 'Productivity', val: stats.metrics['productivity-rate'], avg: BRANCH_AVERAGES['productivity-rate'] },
              ].map((item) => {
                const diff = item.val - item.avg;
                const isPos = diff >= 0;
                return (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500">{item.label}</span>
                    <span className={`text-[11px] font-bold ${isPos ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {isPos ? '+' : ''}{diff.toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </AnalyticsCard>
    </motion.div>
  );
}

function PersonalTrendCard({ userName, stats }: { userName: string; stats: ReturnType<typeof getPersonalizedStats> }) {
  const [selectedMetric, setSelectedMetric] = useState(METRICS[0].id);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  const chartData = useMemo(() => {
    const dates = getLast7Days();
    return dates.map((date, i) => {
      const seed = (userName + selectedMetric).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const base = seed % 20 + 75;
      const variance = Math.sin(seed + i) * 10;
      const branchBase = 80 + (i * 0.8);
      return {
        date,
        [userName]: parseFloat(Math.min(100, Math.max(0, base + variance)).toFixed(1)),
        'Branch Avg': parseFloat(branchBase.toFixed(1)),
      };
    });
  }, [userName, selectedMetric]);

  const controlLabel = "text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5 flex items-center gap-1.5";

  return (
    <motion.div custom={3} variants={cardVariants} initial="hidden" animate="visible" className="h-full">
      <AnalyticsCard
        icon={<Activity className="h-4 w-4" />}
        title="Performance Trends"
        subtitle="7-day personal metric trend"
      >
        {/* Controls */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 px-4 sm:px-5 pt-4 pb-3 border-b border-gray-50">
          <div className="flex-1">
            <p className={controlLabel}>
              <Activity className="h-3 w-3" />
              Metric
            </p>
            <Select
              value={selectedMetric}
              onChange={e => setSelectedMetric(e.target.value)}
              options={METRICS.map(m => ({ value: m.id, label: m.label }))}
              className="!text-xs !py-1.5 !bg-white !border-gray-200 w-full sm:w-52"
            />
          </div>

          {/* Legend pills */}
          <div className="flex flex-wrap gap-1.5 min-h-[28px]">
            <div
              className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-200"
              style={{ borderLeft: '3px solid #2563eb' }}
            >
              {userName}
            </div>
            <div
              className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-400 shadow-sm ring-1 ring-inset ring-gray-200"
              style={{ borderLeft: '3px solid #d1d5db' }}
            >
              Branch Avg
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="p-3 sm:p-5 flex-1">
          <div className="h-[240px] sm:h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad-personal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 600 }}
                  dy={8}
                  interval="preserveStartEnd"
                  tickFormatter={isMobile ? toShortDate : undefined}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#9ca3af', fontSize: 11, fontWeight: 600 }}
                  domain={[50, 100]}
                  tickCount={6}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '10px',
                    border: '1px solid #f0f0f0',
                    boxShadow: '0 8px 24px -4px rgba(0,0,0,0.10)',
                    padding: '10px 14px',
                  }}
                  itemStyle={{ fontWeight: 700, fontSize: '12px' }}
                  labelStyle={{ fontWeight: 600, color: '#6b7280', marginBottom: '6px', fontSize: '11px' }}
                />
                <Area
                  type="monotone"
                  dataKey={userName}
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#grad-personal)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
                <Area
                  type="monotone"
                  dataKey="Branch Avg"
                  stroke="#d1d5db"
                  strokeWidth={1.5}
                  strokeDasharray="6 3"
                  fillOpacity={0}
                  dot={false}
                  activeDot={{ r: 3, strokeWidth: 0, fill: '#9ca3af' }}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </AnalyticsCard>
    </motion.div>
  );
}

function PersonalInsightsCard() {
  return (
    <motion.div custom={4} variants={cardVariants} initial="hidden" animate="visible" className="h-full">
      <AnalyticsCard
        icon={<AlertTriangle className="h-4 w-4" />}
        title="Key Insights"
        subtitle="Automated observations"
      >
        <div className="divide-y divide-gray-50 flex-1 overflow-auto">
          {PERSONAL_INSIGHTS.map((insight, idx) => (
            <div
              key={idx}
              className="flex flex-col gap-3 p-4 transition-colors hover:bg-gray-50/60"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center ${
                    insight.type === 'attention'
                      ? 'bg-amber-50 text-amber-500'
                      : insight.type === 'improving'
                        ? 'bg-blue-50 text-blue-500'
                        : 'bg-emerald-50 text-emerald-500'
                  }`}
                >
                  {insight.type === 'attention' ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : insight.type === 'improving' ? (
                    <TrendingUp className="h-4 w-4" />
                  ) : (
                    <Trophy className="h-4 w-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">
                    {insight.metric}
                  </p>
                  <p className={`text-sm font-semibold leading-none mb-1 ${
                    insight.type === 'attention' ? 'text-amber-700' : insight.type === 'improving' ? 'text-blue-700' : 'text-emerald-700'
                  }`}>
                    {insight.type === 'strength' ? 'Strength' : insight.type === 'improving' ? 'Improving' : 'Needs Attention'}
                  </p>
                  <p className="text-xs text-gray-500 leading-relaxed">{insight.message}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </AnalyticsCard>
    </motion.div>
  );
}

function PersonalRadarCard({ userName }: { userName: string }) {
  const radarData = useMemo(() => generateRadarData(userName), [userName]);

  return (
    <motion.div custom={5} variants={cardVariants} initial="hidden" animate="visible" className="h-full">
      <AnalyticsCard
        icon={<Target className="h-4 w-4" />}
        title="Performance Radar"
        subtitle="Multi-metric overview"
      >
        <div className="flex-1 p-4 flex items-center justify-center min-h-[280px] sm:min-h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="58%" data={radarData}>
              <PolarGrid stroke="#e5e7eb" strokeDasharray="0" />
              <PolarAngleAxis
                dataKey="subject"
                tick={{ fill: '#6b7280', fontSize: 9, fontWeight: 600 }}
              />
              <PolarRadiusAxis
                angle={30}
                domain={[0, 100]}
                tick={false}
                axisLine={false}
              />
              <Radar
                name={userName}
                dataKey="A"
                stroke="rgb(var(--primary-600))"
                strokeWidth={2}
                fill="rgb(var(--primary-600))"
                fillOpacity={0.18}
                animationDuration={600}
                animationEasing="ease-out"
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </AnalyticsCard>
    </motion.div>
  );
}

// ─── Metric Detail Mock Data ─────────────────────────────────────────────────

const GLOBAL_AVERAGES: Record<string, number> = {
  'Customer Service': 87.2,
  'Workplace Relations': 85.8,
  'Professional Conduct': 88.0,
  'Attendance': 96.1,
  'Punctuality': 94.5,
  'Productivity': 81.0,
  'Uniform': 97.3,
  'Hygiene': 95.0,
  'SOP': 93.8,
};

const TOTAL_EMPLOYEES = 85;

const EVALUATORS = ['M. Santos', 'R. Dela Cruz', 'J. Reyes', 'A. Garcia', 'L. Bautista', 'K. Tan'];
const INSPECTORS = ['QA Team', 'Shift Lead', 'Area Manager', 'Health Officer', 'Ops Manager'];
const SHIFTS = ['Morning (6AM–2PM)', 'Mid (10AM–6PM)', 'Closing (2PM–10PM)'];
const CATEGORIES = ['Walk-in', 'Drive-thru', 'Delivery', 'Dine-in', 'Complaint Resolution'];

type MetricEventRow = Record<string, string | number>;

interface MetricDetailConfig {
  columns: { key: string; label: string }[];
  formula: string;
  generateRows: (seed: number) => MetricEventRow[];
}

const generateDates = (count: number): string[] => {
  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }));
  }
  return dates;
};

const seededRandom = (seed: number, idx: number) => {
  const x = Math.sin(seed + idx * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

const METRIC_DETAIL_CONFIGS: Record<string, MetricDetailConfig> = {
  'Customer Service': {
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'score', label: 'Score' },
      { key: 'evaluator', label: 'Evaluator' },
      { key: 'category', label: 'Category' },
    ],
    formula: 'Average of all evaluation scores in period',
    generateRows: (seed) => {
      const dates = generateDates(30);
      return dates.map((date, i) => ({
        date,
        score: Math.round(75 + seededRandom(seed, i) * 25),
        evaluator: EVALUATORS[Math.floor(seededRandom(seed, i + 100) * EVALUATORS.length)],
        category: CATEGORIES[Math.floor(seededRandom(seed, i + 200) * CATEGORIES.length)],
      }));
    },
  },
  'Workplace Relations': {
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'score', label: 'Score' },
      { key: 'evaluator', label: 'Evaluator' },
      { key: 'category', label: 'Category' },
    ],
    formula: 'Average of all evaluation scores in period',
    generateRows: (seed) => {
      const dates = generateDates(25);
      return dates.map((date, i) => ({
        date,
        score: Math.round(70 + seededRandom(seed + 1, i) * 30),
        evaluator: EVALUATORS[Math.floor(seededRandom(seed + 1, i + 100) * EVALUATORS.length)],
        category: ['Peer Review', 'Team Feedback', 'Manager Assessment', 'Conflict Resolution'][Math.floor(seededRandom(seed + 1, i + 200) * 4)],
      }));
    },
  },
  'Professional Conduct': {
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'score', label: 'Score' },
      { key: 'evaluator', label: 'Evaluator' },
      { key: 'category', label: 'Category' },
    ],
    formula: 'Average of all evaluation scores in period',
    generateRows: (seed) => {
      const dates = generateDates(20);
      return dates.map((date, i) => ({
        date,
        score: Math.round(78 + seededRandom(seed + 2, i) * 22),
        evaluator: EVALUATORS[Math.floor(seededRandom(seed + 2, i + 100) * EVALUATORS.length)],
        category: ['Grooming', 'Communication', 'Professionalism', 'Ethics'][Math.floor(seededRandom(seed + 2, i + 200) * 4)],
      }));
    },
  },
  'Attendance': {
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'shift', label: 'Shift' },
      { key: 'status', label: 'Status' },
      { key: 'notes', label: 'Notes' },
    ],
    formula: '(Attended + Excused) / Total Scheduled',
    generateRows: (seed) => {
      const dates = generateDates(40);
      return dates.map((date, i) => {
        const r = seededRandom(seed + 3, i);
        const status = r > 0.12 ? 'Present' : r > 0.05 ? 'Excused' : 'Absent';
        return {
          date,
          shift: SHIFTS[Math.floor(seededRandom(seed + 3, i + 100) * SHIFTS.length)],
          status,
          notes: status === 'Excused' ? ['Sick leave', 'Family emergency', 'Medical appointment'][Math.floor(seededRandom(seed + 3, i + 200) * 3)] : status === 'Absent' ? 'Unexcused' : '',
        };
      });
    },
  },
  'Punctuality': {
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'shift', label: 'Shift' },
      { key: 'clockIn', label: 'Clock-in' },
      { key: 'variance', label: 'Variance' },
      { key: 'status', label: 'Status' },
    ],
    formula: 'On-time Shifts / Total Shifts',
    generateRows: (seed) => {
      const dates = generateDates(35);
      return dates.map((date, i) => {
        const varianceMin = Math.round((seededRandom(seed + 4, i) - 0.3) * 30);
        const status = varianceMin <= 0 ? 'On-time' : varianceMin <= 5 ? 'Late' : 'Late';
        const shiftIdx = Math.floor(seededRandom(seed + 4, i + 100) * SHIFTS.length);
        const baseHour = shiftIdx === 0 ? 6 : shiftIdx === 1 ? 10 : 14;
        const clockInMin = baseHour * 60 + varianceMin;
        const hours = Math.floor(clockInMin / 60);
        const mins = Math.abs(clockInMin % 60);
        return {
          date,
          shift: SHIFTS[shiftIdx],
          clockIn: `${hours}:${mins.toString().padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`,
          variance: varianceMin <= 0 ? `${varianceMin} min` : `+${varianceMin} min`,
          status,
        };
      });
    },
  },
  'Productivity': {
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'inspector', label: 'Inspector' },
      { key: 'result', label: 'Result' },
      { key: 'remarks', label: 'Remarks' },
    ],
    formula: 'Avg Daily Achievement %',
    generateRows: (seed) => {
      const dates = generateDates(28);
      return dates.map((date, i) => {
        const pct = Math.round(65 + seededRandom(seed + 5, i) * 35);
        return {
          date,
          inspector: INSPECTORS[Math.floor(seededRandom(seed + 5, i + 100) * INSPECTORS.length)],
          result: `${pct}%`,
          remarks: pct >= 90 ? 'Exceeded target' : pct >= 75 ? 'Met target' : 'Below target',
        };
      });
    },
  },
  'Uniform': {
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'inspector', label: 'Inspector' },
      { key: 'result', label: 'Result' },
      { key: 'remarks', label: 'Remarks' },
    ],
    formula: 'Passed Checks / Total Checks',
    generateRows: (seed) => {
      const dates = generateDates(22);
      return dates.map((date, i) => {
        const pass = seededRandom(seed + 6, i) > 0.08;
        return {
          date,
          inspector: INSPECTORS[Math.floor(seededRandom(seed + 6, i + 100) * INSPECTORS.length)],
          result: pass ? 'Pass' : 'Fail',
          remarks: pass ? '' : ['Missing name tag', 'Incorrect shoes', 'Wrinkled uniform'][Math.floor(seededRandom(seed + 6, i + 200) * 3)],
        };
      });
    },
  },
  'Hygiene': {
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'inspector', label: 'Inspector' },
      { key: 'result', label: 'Result' },
      { key: 'remarks', label: 'Remarks' },
    ],
    formula: 'Passed Checks / Total Checks',
    generateRows: (seed) => {
      const dates = generateDates(25);
      return dates.map((date, i) => {
        const pass = seededRandom(seed + 7, i) > 0.1;
        return {
          date,
          inspector: INSPECTORS[Math.floor(seededRandom(seed + 7, i + 100) * INSPECTORS.length)],
          result: pass ? 'Pass' : 'Fail',
          remarks: pass ? '' : ['Hand washing protocol', 'Glove usage', 'Hair net missing'][Math.floor(seededRandom(seed + 7, i + 200) * 3)],
        };
      });
    },
  },
  'SOP': {
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'inspector', label: 'Inspector' },
      { key: 'result', label: 'Result' },
      { key: 'remarks', label: 'Remarks' },
    ],
    formula: 'Passed Checks / Total Checks',
    generateRows: (seed) => {
      const dates = generateDates(30);
      return dates.map((date, i) => {
        const pass = seededRandom(seed + 8, i) > 0.12;
        return {
          date,
          inspector: INSPECTORS[Math.floor(seededRandom(seed + 8, i + 100) * INSPECTORS.length)],
          result: pass ? 'Pass' : 'Fail',
          remarks: pass ? '' : ['Step skipped', 'Wrong sequence', 'Incomplete procedure'][Math.floor(seededRandom(seed + 8, i + 200) * 3)],
        };
      });
    },
  },
};

const ROWS_PER_PAGE = 10;

// ─── Detailed Metrics Card with Slide ────────────────────────────────────────

function PersonalMetricsBreakdownCard({ stats }: { stats: ReturnType<typeof getPersonalizedStats> }) {
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);

  const metricGroups = [
    {
      title: 'Core Performance',
      icon: <BarChart2 className="h-3.5 w-3.5 text-blue-500" />,
      items: [
        { label: 'Customer Service', val: stats.metrics['customer-service'], avg: BRANCH_AVERAGES['customer-service'] },
        { label: 'Workplace Relations', val: stats.metrics['workplace-relations'], avg: BRANCH_AVERAGES['workplace-relations'] },
        { label: 'Professional Conduct', val: stats.metrics['professional-conduct'], avg: BRANCH_AVERAGES['professional-conduct'] },
      ],
    },
    {
      title: 'Operational',
      icon: <Activity className="h-3.5 w-3.5 text-violet-500" />,
      items: [
        { label: 'Attendance', val: stats.metrics['attendance-rate'], avg: BRANCH_AVERAGES['attendance-rate'] },
        { label: 'Punctuality', val: stats.metrics['punctuality-rate'], avg: BRANCH_AVERAGES['punctuality-rate'] },
        { label: 'Productivity', val: stats.metrics['productivity-rate'], avg: BRANCH_AVERAGES['productivity-rate'] },
      ],
    },
    {
      title: 'SOP & Compliance',
      icon: <Target className="h-3.5 w-3.5 text-emerald-500" />,
      items: [
        { label: 'Uniform', val: stats.metrics['uniform-compliance'], avg: BRANCH_AVERAGES['uniform-compliance'] },
        { label: 'Hygiene', val: stats.metrics['hygiene-compliance'], avg: BRANCH_AVERAGES['hygiene-compliance'] },
        { label: 'SOP', val: stats.metrics['sop-compliance'], avg: BRANCH_AVERAGES['sop-compliance'] },
      ],
    },
  ];

  const allItems = metricGroups.flatMap(g => g.items);

  const selectedItem = selectedMetric ? allItems.find(i => i.label === selectedMetric) : null;
  const detailConfig = selectedMetric ? METRIC_DETAIL_CONFIGS[selectedMetric] : null;

  const eventRows = useMemo(() => {
    if (!selectedMetric || !detailConfig) return [];
    const seed = selectedMetric.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return detailConfig.generateRows(seed);
  }, [selectedMetric, detailConfig]);

  const totalPages = Math.ceil(eventRows.length / ROWS_PER_PAGE);
  const pageRows = eventRows.slice(currentPage * ROWS_PER_PAGE, (currentPage + 1) * ROWS_PER_PAGE);

  const globalAvg = selectedMetric ? (GLOBAL_AVERAGES[selectedMetric] ?? 0) : 0;
  const rank = useMemo(() => {
    if (!selectedItem) return 0;
    return Math.max(1, Math.round((1 - (selectedItem.val / 100)) * TOTAL_EMPLOYEES) + 1);
  }, [selectedItem]);

  const handleOpenDetail = (label: string) => {
    setCurrentPage(0);
    setSelectedMetric(label);
  };

  const handleBack = () => {
    setSelectedMetric(null);
  };

  const isDetailView = selectedMetric !== null;

  return (
    <motion.div custom={6} variants={cardVariants} initial="hidden" animate="visible" className="h-full">
      <div className="flex flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm h-full">
        {/* ── Static Header ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/40 px-5 py-4 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex-shrink-0 text-primary-600">
              <BarChart2 className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-500 leading-none">
                Detailed Metrics
              </h3>
              <p className="mt-0.5 text-xs text-gray-400 truncate">
                {isDetailView ? selectedMetric : 'All scores vs branch average'}
              </p>
            </div>
          </div>
          {isDetailView && (
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-primary-600"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>
          )}
        </div>

        {/* ── Content Area (overview defines height, detail overlays) ── */}
        <div className="relative flex-1 overflow-hidden">
          {/* Overview — always rendered to hold the card height */}
          <motion.div
            animate={{ x: isDetailView ? '-100%' : 0, opacity: isDetailView ? 0 : 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="p-4 sm:p-5 flex flex-col gap-5"
          >
            {metricGroups.map((group) => (
              <div key={group.title}>
                <div className="flex items-center gap-1.5 mb-3">
                  {group.icon}
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                    {group.title}
                  </span>
                </div>
                <div className="space-y-3">
                  {group.items.map((item) => {
                    const diff = item.val - item.avg;
                    const isPos = diff >= 0;
                    return (
                      <div
                        key={item.label}
                        onClick={() => handleOpenDetail(item.label)}
                        className="space-y-1.5 cursor-pointer rounded-lg px-2 py-1.5 -mx-2 transition-colors hover:bg-gray-50 active:bg-gray-100"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-600">{item.label}</span>
                            <ChevronRight className="h-3 w-3 text-gray-300" />
                          </div>
                          <div className="flex items-center gap-2.5">
                            <span className="text-sm font-bold text-gray-800 tabular-nums">{item.val}%</span>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${
                                isPos
                                  ? 'bg-emerald-50 text-emerald-600 ring-emerald-100'
                                  : 'bg-amber-50 text-amber-600 ring-amber-100'
                              }`}
                            >
                              {isPos ? '+' : ''}{diff.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${item.val}%` }}
                            transition={{ duration: 0.8, ease: 'easeOut' }}
                            className={`h-full rounded-full ${isPos ? 'bg-emerald-500' : 'bg-amber-400'}`}
                          />
                          <div
                            className="absolute top-0 h-full w-0.5 bg-gray-400/60"
                            style={{ left: `${item.avg}%` }}
                            title={`Branch avg: ${item.avg}%`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Summary */}
            <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-3.5 py-2.5">
              <p className="text-xs text-gray-600 leading-relaxed">
                <span className="font-bold text-blue-700">
                  {allItems.filter(i => i.val >= i.avg).length} of {allItems.length} metrics
                </span>{' '}
                are at or above branch average.
              </p>
            </div>
          </motion.div>

          {/* Detail — absolutely positioned overlay, slides in from right */}
          <AnimatePresence>
            {isDetailView && selectedItem && detailConfig && (
              <motion.div
                key={`detail-${selectedMetric}`}
                initial={{ x: '100%', opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: '100%', opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="absolute inset-0 flex flex-col bg-white"
              >
                {/* Summary Strip */}
                <div className="grid grid-cols-3 gap-3 px-4 sm:px-5 py-4 border-b border-gray-50">
                  <div className={`rounded-lg p-3 text-center ${
                    selectedItem.val >= globalAvg
                      ? 'bg-emerald-50 ring-1 ring-inset ring-emerald-100'
                      : 'bg-amber-50 ring-1 ring-inset ring-amber-100'
                  }`}>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Your Score</p>
                    <p className={`text-2xl font-bold tabular-nums ${
                      selectedItem.val >= globalAvg ? 'text-emerald-700' : 'text-amber-700'
                    }`}>
                      {selectedItem.val}%
                    </p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3 text-center ring-1 ring-inset ring-gray-100">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Global Avg</p>
                    <p className="text-2xl font-bold text-gray-600 tabular-nums">{globalAvg}%</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3 text-center ring-1 ring-inset ring-gray-100">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Rank</p>
                    <p className="text-2xl font-bold text-gray-600 tabular-nums">
                      {rank}<span className="text-sm font-medium text-gray-400">/{TOTAL_EMPLOYEES}</span>
                    </p>
                  </div>
                </div>

                {/* Formula */}
                <div className="px-4 sm:px-5 py-2.5 border-b border-gray-50">
                  <p className="text-[10px] text-gray-400">
                    <span className="font-bold uppercase tracking-widest">Formula: </span>
                    <span className="font-mono text-gray-500">{detailConfig.formula}</span>
                  </p>
                </div>

                {/* Event Log */}
                <div className="flex flex-col flex-1 px-4 sm:px-5 py-3 overflow-hidden">
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <Activity className="h-3 w-3 text-gray-400" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                      Event Log
                    </span>
                    <span className="text-[10px] text-gray-400 ml-1">({eventRows.length} records)</span>
                  </div>

                  <div className="flex-1 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100">
                          {detailConfig.columns.map((col) => (
                            <th
                              key={col.key}
                              className="py-2 px-2 text-center sm:text-left text-[10px] font-bold uppercase tracking-widest text-gray-400"
                            >
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.map((row, idx) => (
                          <tr
                            key={idx}
                            className="border-b border-gray-50 last:border-0 transition-colors hover:bg-gray-50/60"
                          >
                            {detailConfig.columns.map((col) => {
                              const cellValue = String(row[col.key] ?? '');
                              const isStatus = col.key === 'status' || col.key === 'result';
                              let statusClass = 'text-gray-700';
                              if (isStatus) {
                                if (cellValue === 'Present' || cellValue === 'On-time' || cellValue === 'Pass') {
                                  statusClass = 'text-emerald-600 font-semibold';
                                } else if (cellValue === 'Absent' || cellValue === 'Late' || cellValue === 'Fail') {
                                  statusClass = 'text-red-500 font-semibold';
                                } else if (cellValue === 'Excused') {
                                  statusClass = 'text-amber-600 font-semibold';
                                }
                              }
                              return (
                                <td
                                  key={col.key}
                                  className={`py-2.5 px-2 text-xs text-center sm:text-left ${isStatus ? statusClass : 'text-gray-600'}`}
                                >
                                  {cellValue}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="flex items-center justify-center gap-3 pt-3 border-t border-gray-50">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                      disabled={currentPage === 0}
                      className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                      Prev
                    </button>
                    <span className="text-[11px] font-bold text-gray-400 tabular-nums">
                      Page {currentPage + 1} of {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={currentPage >= totalPages - 1}
                      className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Next
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Trend Analytics Card ─────────────────────────────────────────────────────

// Converts "Mar 27" → "3/27" for narrow mobile labels
const toShortDate = (label: string) => {
  const months: Record<string, string> = {
    Jan: '1', Feb: '2', Mar: '3', Apr: '4', May: '5', Jun: '6',
    Jul: '7', Aug: '8', Sep: '9', Oct: '10', Nov: '11', Dec: '12',
  };
  const [mon, day] = label.split(' ');
  return `${months[mon] ?? mon}/${day}`;
};

function TrendAnalyticsCard() {
  const [selectedUsers, setSelectedUsers] = useState<string[]>([ANALYTICS_USERS[0]]);
  const [selectedMetric, setSelectedMetric] = useState(METRICS[0].id);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  const chartData = useMemo(
    () => generateMockTrendData(selectedUsers, selectedMetric),
    [selectedUsers, selectedMetric]
  );

  const handleAddUser = (userName: string) => {
    if (!selectedUsers.includes(userName) && selectedUsers.length < 5) {
      setSelectedUsers([...selectedUsers, userName]);
    }
  };

  const handleRemoveUser = (userName: string) => {
    if (selectedUsers.length > 1) {
      setSelectedUsers(selectedUsers.filter(u => u !== userName));
    }
  };

  const controlLabel = "text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5 flex items-center gap-1.5";

  return (
    <motion.div
      custom={3}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className="h-full"
    >
      <AnalyticsCard
        icon={<Activity className="h-4 w-4" />}
        title="Performance Trends"
        subtitle="7-day metric comparison"
      >
        {/* Controls — stacked on mobile, inline on desktop */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 px-4 sm:px-5 pt-4 pb-3 border-b border-gray-50">
          <div className="grid grid-cols-2 sm:flex sm:items-end gap-3 flex-1">
            {/* Add Employee */}
            <div className="flex-shrink-0">
              <p className={controlLabel}>
                <Plus className="h-3 w-3" />
                Add Employee
              </p>
              <Select
                value=""
                onChange={e => handleAddUser(e.target.value)}
                options={[
                  { value: '', label: 'Select employee…' },
                  ...ANALYTICS_USERS.filter(u => !selectedUsers.includes(u)).map(u => ({
                    value: u,
                    label: u,
                  })),
                ]}
                className="!text-xs !py-1.5 !bg-white !border-gray-200 w-full sm:w-44"
              />
            </div>
            {/* Metric */}
            <div className="flex-1 sm:flex-initial">
              <p className={controlLabel}>
                <Activity className="h-3 w-3" />
                Metric
              </p>
              <Select
                value={selectedMetric}
                onChange={e => setSelectedMetric(e.target.value)}
                options={METRICS.map(m => ({ value: m.id, label: m.label }))}
                className="!text-xs !py-1.5 !bg-white !border-gray-200 w-full sm:w-52"
              />
            </div>
          </div>

          {/* Active employee pills */}
          <div className="flex flex-wrap gap-1.5 min-h-[28px]">
            <AnimatePresence>
              {selectedUsers.map((user, idx) => (
                <motion.div
                  key={user}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-200"
                  style={{ borderLeft: `3px solid ${CHART_COLORS[idx % CHART_COLORS.length]}` }}
                >
                  {user}
                  {selectedUsers.length > 1 && (
                    <button
                      onClick={() => handleRemoveUser(user)}
                      className="ml-0.5 text-gray-300 hover:text-red-400 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Chart */}
        <div className="p-3 sm:p-5 flex-1">
          <div className="h-[240px] sm:h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
                <defs>
                  {selectedUsers.map((user, idx) => (
                    <linearGradient key={`grad-${user}`} id={`grad-${idx}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS[idx % CHART_COLORS.length]} stopOpacity={0.18} />
                      <stop offset="100%" stopColor={CHART_COLORS[idx % CHART_COLORS.length]} stopOpacity={0.01} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 600 }}
                  dy={8}
                  interval="preserveStartEnd"
                  tickFormatter={isMobile ? toShortDate : undefined}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#9ca3af', fontSize: 11, fontWeight: 600 }}
                  domain={[50, 100]}
                  tickCount={6}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '10px',
                    border: '1px solid #f0f0f0',
                    boxShadow: '0 8px 24px -4px rgba(0,0,0,0.10)',
                    padding: '10px 14px',
                  }}
                  itemStyle={{ fontWeight: 700, fontSize: '12px' }}
                  labelStyle={{ fontWeight: 600, color: '#6b7280', marginBottom: '6px', fontSize: '11px' }}
                  labelFormatter={v => `${v}`}
                />
                {selectedUsers.map((user, idx) => (
                  <Area
                    key={user}
                    type="monotone"
                    dataKey={user}
                    stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill={`url(#grad-${idx})`}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                    animationDuration={800}
                    animationEasing="ease-out"
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </AnalyticsCard>
    </motion.div>
  );
}

// ─── Weekly Alerts Card ───────────────────────────────────────────────────────

function WeeklyAnalyticsAlerts() {
  const navigate = useNavigate();

  return (
    <motion.div custom={4} variants={cardVariants} initial="hidden" animate="visible" className="h-full">
      <AnalyticsCard
        icon={<AlertTriangle className="h-4 w-4" />}
        title="Weekly Alerts"
        subtitle="Automated insights"
      >
        <div className="divide-y divide-gray-50 flex-1 overflow-auto">
          {WEEKLY_ALERTS.map(alert => (
            <div
              key={alert.id}
              className="flex flex-col gap-3 p-4 transition-colors hover:bg-gray-50/60"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center ${
                    alert.type === 'warning'
                      ? 'bg-amber-50 text-amber-500'
                      : 'bg-emerald-50 text-emerald-500'
                  }`}
                >
                  {alert.type === 'warning' ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : (
                    <TrendingUp className="h-4 w-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">
                    {alert.metric}
                  </p>
                  <p className="text-sm font-semibold text-gray-800 leading-none mb-1">
                    {alert.employee}
                  </p>
                  <p className="text-xs text-gray-500 leading-relaxed">{alert.message}</p>
                </div>
              </div>
              <button
                onClick={() => navigate('/employee-profiles')}
                className="self-end text-[11px] font-bold text-primary-600 hover:text-primary-700 transition-colors"
              >
                Review →
              </button>
            </div>
          ))}
        </div>
      </AnalyticsCard>
    </motion.div>
  );
}

// ─── Performance Radar Card ───────────────────────────────────────────────────

function PerformanceRadarCard() {
  const [selectedUser, setSelectedUser] = useState(ANALYTICS_USERS[0]);
  const radarData = useMemo(() => generateRadarData(selectedUser), [selectedUser]);

  return (
    <motion.div custom={5} variants={cardVariants} initial="hidden" animate="visible" className="h-full">
      <AnalyticsCard
        icon={<Target className="h-4 w-4" />}
        title="Performance Radar"
        subtitle="Multi-metric overview"
        headerRight={
          <select
            value={selectedUser}
            onChange={e => setSelectedUser(e.target.value)}
            className="text-xs font-semibold border border-gray-200 bg-white rounded-lg px-2.5 py-1.5 text-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-200 cursor-pointer hover:border-primary-300 transition-colors"
          >
            {ANALYTICS_USERS.map(u => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        }
      >
        <div className="flex-1 p-4 flex items-center justify-center min-h-[280px] sm:min-h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="58%" data={radarData}>
              <PolarGrid stroke="#e5e7eb" strokeDasharray="0" />
              <PolarAngleAxis
                dataKey="subject"
                tick={{ fill: '#6b7280', fontSize: 9, fontWeight: 600 }}
              />
              <PolarRadiusAxis
                angle={30}
                domain={[0, 100]}
                tick={false}
                axisLine={false}
              />
              <Radar
                name={selectedUser}
                dataKey="A"
                stroke="rgb(var(--primary-600))"
                strokeWidth={2}
                fill="rgb(var(--primary-600))"
                fillOpacity={0.18}
                animationDuration={600}
                animationEasing="ease-out"
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </AnalyticsCard>
    </motion.div>
  );
}

// ─── Score Distribution Card ──────────────────────────────────────────────────

function MetricsDistributionCard() {
  const distributionData = useMemo(() => generateDistributionData(), []);

  const totalEmployees = distributionData.reduce((sum, d) => sum + d.count, 0);

  return (
    <motion.div custom={6} variants={cardVariants} initial="hidden" animate="visible" className="h-full">
      <AnalyticsCard
        icon={<Users className="h-4 w-4" />}
        title="Score Distribution"
        subtitle={`${totalEmployees} employees total`}
      >
        <div className="p-5 flex flex-col flex-1 gap-4">
          {/* Bar chart */}
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distributionData} margin={{ top: 4, right: 0, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis
                  dataKey="range"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#9ca3af', fontSize: 11, fontWeight: 600 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#9ca3af', fontSize: 11, fontWeight: 600 }}
                />
                <Tooltip
                  cursor={{ fill: '#f9fafb' }}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #f0f0f0',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                    fontSize: '12px',
                  }}
                  formatter={(value) => [`${value ?? ''} employees`, 'Count']}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={52}>
                  {distributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="grid grid-cols-5 gap-1">
            {distributionData.map(d => {
              const pct = Math.round((d.count / totalEmployees) * 100);
              return (
                <div key={d.range} className="flex flex-col items-center gap-1">
                  <div className="h-1.5 w-full rounded-full" style={{ background: d.fill }} />
                  <span className="text-[10px] font-bold text-gray-500 tabular-nums">{pct}%</span>
                  <span className="text-[9px] text-gray-400 font-medium">{d.range}</span>
                </div>
              );
            })}
          </div>

          {/* Summary */}
          <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-3.5 py-2.5">
            <p className="text-xs text-gray-600 leading-relaxed">
              <span className="font-bold text-emerald-700">42% of workforce</span> scores in the{' '}
              <span className="font-bold text-emerald-700">Excellent (86–95)</span> range — the highest concentration.
            </p>
          </div>
        </div>
      </AnalyticsCard>
    </motion.div>
  );
}

// ─── View Toggle Options ──────────────────────────────────────────────────

type AnalyticsView = 'general' | 'employee' | 'metrics';

const ANALYTICS_VIEW_OPTIONS: ViewOption<AnalyticsView>[] = [
  { id: 'general', label: 'General View', icon: BarChart2 },
  { id: 'employee', label: 'Individual Employee', icon: Users },
  { id: 'metrics', label: 'Individual Metrics', icon: Target },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

interface EmployeeAnalyticsPageProps {
  isLoading?: boolean;
}

export function EmployeeAnalyticsPage({ isLoading = false }: EmployeeAnalyticsPageProps) {
  const [activeView, setActiveView] = useState<AnalyticsView>('general');
  const [selectedUser, setSelectedUser] = useState<UserEntry | null>(null);

  const stats = useMemo(() => {
    if (!selectedUser) return null;
    return getPersonalizedStats(selectedUser.name);
  }, [selectedUser]);

  if (isLoading) {
    return <EmployeeAnalyticsSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <BarChart2 className="h-6 w-6 text-primary-600" />
            <h1 className="text-2xl font-bold text-gray-900">
              {activeView === 'general' && 'Employee Analytics'}
              {activeView === 'employee' && 'Individual Employee Analytics'}
              {activeView === 'metrics' && 'Individual Metrics Analysis'}
            </h1>
          </div>
          <p className="mt-1 hidden text-sm text-gray-500 sm:block">
            {activeView === 'general' && 'Workforce performance metrics, trends, and intelligence.'}
            {activeView === 'employee' && 'Deep dive into specific employee performance and growth.'}
            {activeView === 'metrics' && 'Detailed breakdown of specific organizational performance indicators.'}
          </p>
        </div>

        <div className="hidden lg:flex items-center gap-1.5 rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5">
          <Calendar className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-xs font-semibold text-gray-400">Last 30 Days</span>
        </div>
      </div>

      {/* View Toggle - Separated like AuditResultsPage */}
      <ViewToggle
        options={ANALYTICS_VIEW_OPTIONS}
        activeId={activeView}
        onChange={setActiveView}
        layoutId="analytics-view-tabs"
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={activeView}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeView === 'general' && (
            <div className="space-y-6">
              {/* Top stat cards */}
              <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                {/* EPI: full-width on mobile, 1 col on lg */}
                <div className="col-span-2 sm:col-span-1">
                  <GlobalEpiCard />
                </div>
                {/* Recognition: full-width on mobile, 1 col on lg */}
                <div className="col-span-2 sm:col-span-1">
                  <AwardsViolationsCard />
                </div>
                {/* Leaderboard: always full-width on mobile, 2 cols on lg */}
                <div className="col-span-2">
                  <LeaderboardCard />
                </div>
              </div>

              {/* Trend + Alerts row */}
              <div className="grid gap-4 lg:grid-cols-10">
                <div className="lg:col-span-7 min-w-0">
                  <TrendAnalyticsCard />
                </div>
                <div className="lg:col-span-3">
                  <WeeklyAnalyticsAlerts />
                </div>
              </div>

              {/* Radar + Distribution row */}
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="lg:col-span-1">
                  <PerformanceRadarCard />
                </div>
                <div className="lg:col-span-2">
                  <MetricsDistributionCard />
                </div>
              </div>
            </div>
          )}

          {activeView === 'employee' && (
            <div className="space-y-6">
              {/* Employee Selector Bar */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl border border-gray-100 bg-white px-5 py-4 shadow-sm"
              >
                <div className="w-full sm:w-72">
                  <SingleUserSelect
                    users={ANALYTICS_USER_ENTRIES}
                    selectedUserId={selectedUser?.id ?? null}
                    onSelect={setSelectedUser}
                    placeholder="Select an employee..."
                  />
                </div>
                {selectedUser && (
                  <motion.div
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex flex-wrap items-center gap-3 sm:gap-6 text-sm sm:border-l sm:border-gray-100 sm:pl-6"
                  >
                    {[
                      { label: 'Department', value: 'Operations' },
                      { label: 'Branch', value: 'Manila North' },
                      { label: 'Tenure', value: '2.4 Years' },
                    ].map((info) => (
                      <div key={info.label} className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{info.label}</span>
                        <span className="text-sm font-bold text-gray-700">{info.value}</span>
                      </div>
                    ))}
                  </motion.div>
                )}
              </motion.div>

              {!selectedUser ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-dashed border-gray-200"
                >
                  <Users className="h-12 w-12 text-gray-300 mb-4" />
                  <h3 className="text-lg font-bold text-gray-900">No Employee Selected</h3>
                  <p className="text-sm text-gray-500 max-w-xs text-center mt-1">
                    Select an employee above to view their detailed performance analytics.
                  </p>
                </motion.div>
              ) : stats && (
                <div className="space-y-6">
                  {/* Row 1: EPI + Recognition + Ranking (mirrors General View top row) */}
                  <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                    <div className="col-span-2 sm:col-span-1">
                      <PersonalEpiCard stats={stats} />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <PersonalRecognitionCard stats={stats} />
                    </div>
                    <div className="col-span-2">
                      <PersonalRankingCard stats={stats} />
                    </div>
                  </div>

                  {/* Row 2: Trend + Insights (mirrors General View trend + alerts) */}
                  <div className="grid gap-4 lg:grid-cols-10">
                    <div className="lg:col-span-7 min-w-0">
                      <PersonalTrendCard userName={selectedUser.name} stats={stats} />
                    </div>
                    <div className="lg:col-span-3">
                      <PersonalInsightsCard />
                    </div>
                  </div>

                  {/* Row 3: Radar + Metrics Breakdown (mirrors General View radar + distribution) */}
                  <div className="grid gap-4 lg:grid-cols-3">
                    <div className="lg:col-span-1">
                      <PersonalRadarCard userName={selectedUser.name} />
                    </div>
                    <div className="lg:col-span-2">
                      <PersonalMetricsBreakdownCard stats={stats} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeView === 'metrics' && (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
              <Target className="h-12 w-12 text-gray-300 mb-4" />
              <h3 className="text-lg font-bold text-gray-900">Individual Metrics View</h3>
              <p className="text-sm text-gray-500 max-w-xs text-center mt-1">
                Analyze specific metrics across departments, locations, or time periods to identify organizational patterns.
              </p>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
