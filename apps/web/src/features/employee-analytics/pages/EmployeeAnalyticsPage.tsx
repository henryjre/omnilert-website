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
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Hash,
  Percent,
  Eye,
  Search,
  ChevronDown,
  Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useState, useMemo, useRef, useEffect } from 'react';
import { ViewToggle, type ViewOption } from '@/shared/components/ui/ViewToggle';
import {
  getHeroZoneLabel,
  resolveHeroEpiComparison,
  type HeroEpiZone,
} from "../../dashboard/components/epi/heroEpiComparison";
import { SingleUserSelect, type UserEntry } from '../components/SingleUserSelect';
import { AnalyticsRangePicker, getSummaryForSelection } from '../components/AnalyticsRangePicker';
import {
  createDefaultRangeForGranularity,
  type AnalyticsRangeSelection,
  formatYmdForEventLog,
  sampleCalendarDaysForEventLog,
} from '../utils/analyticsRangeBuckets';
import {
  buildGeneralKeyInsights,
  buildGeneralViewMockData,
  buildMetricSummaryTrendFooter,
  buildMetricTrendCardSubtitle,
  buildMetricTrendCardTitle,
  buildPersonalEpiSeries,
  buildPersonalKeyInsights,
  buildPersonalMetricTrendRows,
  buildPersonalRecognitionValues,
  buildPersonalTrendSubtitle,
  buildRadarDataset,
  buildTrendComparisonRows,
  formatInsightsPeriodSubtitle,
  getMetricAllEmployeeData,
  getMetricHeroVsGlobalDistribution,
  getMetricInsights,
  getMetricTrendForRange,
  hashRangeSeed,
  type IndividualMetricsRosterEntry,
  perturbGlobalMetricAverage,
  perturbMetricGlobalTarget,
  perturbPersonalMetricValue,
} from '../utils/generalViewMock';
import {
  formatMetricDelta as formatRuleMetricDelta,
  formatMetricValue as formatRuleMetricValue,
  getMetricKind,
  getMetricScaleMax,
} from '../utils/analyticsRuleEngine';
import { isStickyHeaderStuck } from '../stickyHeader';

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
  'customer-service': 4.2,
  'workplace-relations': 4.0,
  'professional-conduct': 4.2,
  'attendance-rate': 98.4,
  'punctuality-rate': 96.8,
  'productivity-rate': 82.5,
  'average-order-value': 385.20,
  'uniform-compliance': 98.8,
  'hygiene-compliance': 96.5,
  'sop-compliance': 95.2,
};

const METRIC_BENCHMARKS: Record<string, number> = {
  'average-order-value': BRANCH_AVERAGES['average-order-value'],
};

const getPersonalizedStats = (userName: string) => {
  const seed = userName.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  
  const getVal = (base: number, range: number) => {
    return parseFloat((base + (seed % range) - (range / 2)).toFixed(1));
  };

  const getLikert = (base: number) => {
    const raw = base + ((seed % 13) - 6) / 20;
    return parseFloat(Math.min(5, Math.max(1, raw)).toFixed(2));
  };

  return {
    epi: getVal(BRANCH_AVERAGES.epi, 15),
    epiTrend: getVal(2, 4),
    awards: Math.floor(getVal(BRANCH_AVERAGES.awards, 10)),
    violations: Math.floor(Math.max(0, getVal(BRANCH_AVERAGES.violations, 4))),
    metrics: {
      'customer-service': getLikert(BRANCH_AVERAGES['customer-service']),
      'workplace-relations': getLikert(BRANCH_AVERAGES['workplace-relations']),
      'professional-conduct': getLikert(BRANCH_AVERAGES['professional-conduct']),
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

/** Roster for Individual Metrics mock cards (same people as leaderboards). */
const INDIVIDUAL_METRICS_ROSTER: IndividualMetricsRosterEntry[] = [
  ...TOP_PERFORMERS.map((p) => ({ name: p.name, role: "Senior Service Crew" })),
  ...PRIORITY_REVIEW.map((p) => ({ name: p.name, role: "Service Crew" })),
];

function getBaseMetricValueForEmployee(employeeName: string, metricId: string): number {
  const stats = getPersonalizedStats(employeeName);
  const v = stats.metrics[metricId as keyof typeof stats.metrics];
  return typeof v === "number" ? v : 0;
}

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CHART_COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#ea580c'];

// ─── Shared Card Primitives ───────────────────────────────────────────────────

/** Max rAF iterations to wait for the sticky node (e.g. after `AnimatePresence mode="wait"`). */
const STICKY_HEADER_REF_WAIT_MAX_FRAMES = 120;

/**
 * Tracks whether a sticky header is stuck against the dashboard scroll container.
 * @param refreshKey - When this changes, scroll listeners rebind.
 * @param enabled - When false, clears stuck state and skips work (no ref polling when the bar is unmounted).
 */
function useStickyHeaderState(refreshKey?: unknown, enabled = true) {
  const stickyRef = useRef<HTMLDivElement | null>(null);
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setIsStuck(false);
      return;
    }

    let cancelled = false;
    let scrollFrameId = 0;
    let settleFrameId = 0;
    let waitRefRaf = 0;
    let refWaitAttempts = 0;

    const runWithStickyEl = (stickyEl: HTMLDivElement) => {
      const scrollContainer =
        stickyEl.closest<HTMLElement>('[data-dashboard-scroll-container="true"]')
        ?? (() => {
          let parent = stickyEl.parentElement;
          while (parent) {
            const styles = window.getComputedStyle(parent);
            const overflow = `${styles.overflow} ${styles.overflowX} ${styles.overflowY}`;
            if (/(auto|scroll|overlay)/.test(overflow)) {
              return parent;
            }
            parent = parent.parentElement;
          }
          return null;
        })();

      const updateIsStuck = () => {
        const computedTop = Number.parseFloat(window.getComputedStyle(stickyEl).top || "0");
        const stickyTop = Number.isNaN(computedTop) ? 0 : computedTop;
        const containerTop = scrollContainer?.getBoundingClientRect().top ?? 0;
        const elementTop = stickyEl.getBoundingClientRect().top;
        const nextIsStuck = isStickyHeaderStuck({
          containerTop,
          elementTop,
          stickyTop,
        });
        setIsStuck(prev => (prev === nextIsStuck ? prev : nextIsStuck));
      };

      const handleViewportChange = () => {
        cancelAnimationFrame(scrollFrameId);
        scrollFrameId = window.requestAnimationFrame(updateIsStuck);
      };

      const runSettleChecks = () => {
        let checks = 0;
        const maxChecks = 24;

        const tick = () => {
          updateIsStuck();
          checks += 1;
          if (checks < maxChecks) {
            settleFrameId = window.requestAnimationFrame(tick);
          }
        };

        settleFrameId = window.requestAnimationFrame(tick);
      };

      updateIsStuck();
      runSettleChecks();
      const scrollTarget = scrollContainer ?? window;
      scrollTarget.addEventListener("scroll", handleViewportChange as EventListener, { passive: true });
      window.addEventListener("resize", handleViewportChange);

      return () => {
        cancelAnimationFrame(scrollFrameId);
        cancelAnimationFrame(settleFrameId);
        scrollTarget.removeEventListener("scroll", handleViewportChange as EventListener);
        window.removeEventListener("resize", handleViewportChange);
      };
    };

    let detachListeners: (() => void) | undefined;

    const tryAttach = () => {
      if (cancelled) return;
      const stickyEl = stickyRef.current;
      if (!stickyEl) {
        refWaitAttempts += 1;
        if (refWaitAttempts > STICKY_HEADER_REF_WAIT_MAX_FRAMES) {
          return;
        }
        waitRefRaf = window.requestAnimationFrame(tryAttach);
        return;
      }
      detachListeners = runWithStickyEl(stickyEl);
    };

    tryAttach();

    return () => {
      cancelled = true;
      cancelAnimationFrame(waitRefRaf);
      detachListeners?.();
    };
  }, [enabled, refreshKey]);

  return { stickyRef, isStuck };
}

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

const PEOPLE_INSIGHTS_PAGE_SIZE = 4;
const METRIC_INSIGHTS_PAGE_SIZE = 8;
const FIXED_KEY_INSIGHTS_CARD_HEIGHT = 'h-[540px]';

const keyInsightsPageVariants = {
  enter: (direction: number) => ({
    opacity: 0,
    x: direction === 0 ? 0 : direction > 0 ? 20 : -20,
  }),
  center: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.22, ease: 'easeOut' as const },
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction === 0 ? 0 : direction > 0 ? -20 : 20,
    transition: { duration: 0.16, ease: 'easeInOut' as const },
  }),
};

interface CardPaginationProps {
  currentPage: number;
  totalPages: number;
  onPrevious: () => void;
  onNext: () => void;
  layout?: 'edge' | 'centered';
}

function CardPagination({
  currentPage,
  totalPages,
  onPrevious,
  onNext,
  layout = 'edge',
}: CardPaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const containerClass =
    layout === 'centered'
      ? 'flex items-center justify-center gap-3 pt-3 border-t border-gray-50'
      : 'grid grid-cols-[1fr_auto_1fr] items-center gap-3 pt-3 border-t border-gray-50';

  return (
    <div className={containerClass}>
      <div className={layout === 'centered' ? undefined : 'flex justify-start'}>
        <button
          onClick={onPrevious}
          disabled={currentPage === 0}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Previous
        </button>
      </div>
      <span className="text-center text-[11px] font-bold text-gray-400 tabular-nums">
        Page {currentPage + 1} of {totalPages}
      </span>
      <div className={layout === 'centered' ? undefined : 'flex justify-end'}>
        <button
          onClick={onNext}
          disabled={currentPage >= totalPages - 1}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
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

function GlobalEpiCard({
  globalEpi,
  globalEpiDelta,
  globalEpiTrend,
  comparisonCaption,
  trendFooter,
}: {
  globalEpi: number;
  globalEpiDelta: number;
  globalEpiTrend: { label: string; epi: number }[];
  comparisonCaption: string;
  trendFooter: string;
}) {
  const deltas = globalEpiTrend.map((p) => p.epi);
  const lo = deltas.length ? Math.min(...deltas) : 70;
  const hi = deltas.length ? Math.max(...deltas) : 90;
  const pad = Math.max(2, (hi - lo) * 0.08);
  const yDomain: [number, number] = [Math.max(0, lo - pad), Math.min(100, hi + pad)];

  const deltaPositive = globalEpiDelta > 0;
  const deltaNegative = globalEpiDelta < 0;

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
              {globalEpi.toFixed(1)}
            </span>
            <div className="mb-2 flex items-center gap-1.5">
              <span
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${
                  deltaPositive
                    ? 'bg-emerald-400/20 text-emerald-300 ring-emerald-400/20'
                    : deltaNegative
                      ? 'bg-red-400/20 text-red-300 ring-red-400/20'
                      : 'bg-white/10 text-white/70 ring-white/15'
                }`}
              >
                {deltaPositive ? (
                  <TrendingUp className="h-3 w-3" />
                ) : deltaNegative ? (
                  <TrendingDown className="h-3 w-3" />
                ) : (
                  <Minus className="h-3 w-3" />
                )}
                {globalEpiDelta > 0 ? '+' : ''}
                {globalEpiDelta.toFixed(1)}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
                {comparisonCaption}
              </span>
            </div>
          </div>

        </div>

        {/* Sparkline — fills remaining space */}
        <div className="flex-1 min-h-[80px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={globalEpiTrend} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="epi-line-glow" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.3)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0.9)" />
                </linearGradient>
              </defs>
              <YAxis domain={yDomain} hide />
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
                labelFormatter={(_, items) => {
                  const row = items?.[0]?.payload as { label?: string } | undefined;
                  return row?.label ?? '';
                }}
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
            {trendFooter}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function AwardsViolationsCard({
  recognitionSubtitle,
  awards,
  violations,
}: {
  recognitionSubtitle: string;
  awards: number;
  violations: number;
}) {
  return (
    <motion.div custom={1} variants={cardVariants} initial="hidden" animate="visible" className="h-full">
      <AnalyticsCard
        icon={<Trophy className="h-4 w-4" />}
        title="Recognition"
        subtitle={recognitionSubtitle}
      >
        <div className="flex flex-col gap-3 p-4 flex-1">
          {/* Awards */}
          <div className="group flex cursor-pointer items-center justify-between rounded-lg border border-emerald-100/60 bg-emerald-50/50 px-4 py-3 transition-colors duration-200 hover:bg-emerald-50">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Trophy className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600/70">Total Awards</span>
              </div>
              <span className="text-3xl font-bold leading-none text-emerald-900 tabular-nums">{awards}</span>
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
              <span className="text-3xl font-bold leading-none text-red-900 tabular-nums">{violations}</span>
            </div>
            <ChevronRight className="h-4 w-4 text-red-300 opacity-0 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0" />
          </div>
        </div>
      </AnalyticsCard>
    </motion.div>
  );
}

function LeaderboardCard({
  topPerformers,
  priorityReview,
}: {
  topPerformers: { name: string; epi: number }[];
  priorityReview: { name: string; epi: number }[];
}) {
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
              {topPerformers.map((employee, idx) => (
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
              {priorityReview.map((employee, idx) => (
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

function PersonalEpiCard({
  displayEpi,
  epiDelta,
  comparisonCaption,
  trendFooter,
  globalAvgDisplay,
  chartData,
}: {
  displayEpi: number;
  epiDelta: number;
  comparisonCaption: string;
  trendFooter: string;
  globalAvgDisplay: number;
  chartData: { label: string; epi: number; globalAvg: number }[];
}) {
  const vals = chartData.flatMap((p) => [p.epi, p.globalAvg]);
  const lo = vals.length ? Math.min(...vals) : 60;
  const hi = vals.length ? Math.max(...vals) : 95;
  const pad = Math.max(2, (hi - lo) * 0.08);
  const yDomain: [number, number] = [Math.max(0, lo - pad), Math.min(100, hi + pad)];
  const deltaPositive = epiDelta > 0;
  const deltaNegative = epiDelta < 0;

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
              {displayEpi.toFixed(1)}
            </span>
            <div className="mb-2 flex items-center gap-1.5">
              <span
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${
                  deltaPositive
                    ? 'bg-emerald-400/20 text-emerald-300 ring-emerald-400/20'
                    : deltaNegative
                      ? 'bg-red-400/20 text-red-300 ring-red-400/20'
                      : 'bg-white/10 text-white/70 ring-white/15'
                }`}
              >
                {deltaPositive ? (
                  <TrendingUp className="h-3 w-3" />
                ) : deltaNegative ? (
                  <TrendingDown className="h-3 w-3" />
                ) : (
                  <Minus className="h-3 w-3" />
                )}
                {epiDelta > 0 ? '+' : ''}
                {epiDelta.toFixed(1)}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
                {comparisonCaption}
              </span>
            </div>
          </div>
        </div>

        {/* Sparkline */}
        <div className="flex-1 min-h-[80px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="personal-epi-glow" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.3)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0.9)" />
                </linearGradient>
              </defs>
              <YAxis domain={yDomain} hide />
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
                formatter={(v, name) => [v, name === 'epi' ? 'You' : 'Global']}
                labelFormatter={(_, items) => {
                  const row = items?.[0]?.payload as { label?: string } | undefined;
                  return row?.label ?? '';
                }}
              />
              <Line
                type="monotone"
                dataKey="globalAvg"
                stroke="rgba(255,255,255,0.35)"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                dot={false}
                activeDot={{ r: 3, fill: 'rgba(255,255,255,0.5)', strokeWidth: 0 }}
                animationDuration={1200}
                animationEasing="ease-out"
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
            Global Avg: {globalAvgDisplay.toFixed(1)}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
            {trendFooter}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function PersonalRecognitionCard({
  recognitionSubtitle,
  awards,
  violations,
}: {
  recognitionSubtitle: string;
  awards: number;
  violations: number;
}) {
  return (
    <motion.div custom={1} variants={cardVariants} initial="hidden" animate="visible" className="h-full">
      <AnalyticsCard
        icon={<Trophy className="h-4 w-4" />}
        title="Recognition"
        subtitle={recognitionSubtitle}
      >
        <div className="flex flex-col gap-3 p-4 flex-1">
          {/* Awards */}
          <div className="group flex cursor-pointer items-center justify-between rounded-lg border border-emerald-100/60 bg-emerald-50/50 px-4 py-3 transition-colors duration-200 hover:bg-emerald-50">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Trophy className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600/70">Total Awards</span>
              </div>
              <span className="text-3xl font-bold leading-none text-emerald-900 tabular-nums">{awards}</span>
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
              <span className="text-3xl font-bold leading-none text-red-900 tabular-nums">{violations}</span>
            </div>
            <ChevronRight className="h-4 w-4 text-red-300 opacity-0 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0" />
          </div>
        </div>
      </AnalyticsCard>
    </motion.div>
  );
}

const HERO_ZONE_TEXT: Record<HeroEpiZone, string> = {
  red: "text-red-500",
  amber: "text-amber-600",
  green: "text-emerald-600",
  blue: "text-blue-500",
};

/** Subtle border + background for EPI distribution summary (tracks dominant hero zone). */
const HERO_ZONE_DISTRIBUTION_PANEL: Record<HeroEpiZone, string> = {
  red: "border-red-200 bg-red-50/80",
  amber: "border-amber-200 bg-amber-50/80",
  green: "border-emerald-200 bg-emerald-50/80",
  blue: "border-blue-200 bg-blue-50/80",
};

/** Shared summary strip under hero-zone distribution charts (EPI or metric vs global). */
function HeroZoneDistributionSummaryPanel({
  dominantEmployeeCount,
  dominantSharePct,
  dominantBandLabel,
  dominantZone,
  trailingAfterBand,
}: {
  dominantEmployeeCount: number;
  dominantSharePct: number;
  dominantBandLabel: string;
  dominantZone: HeroEpiZone;
  trailingAfterBand: string;
}) {
  const accentClass = HERO_ZONE_TEXT[dominantZone];
  const panelClass = HERO_ZONE_DISTRIBUTION_PANEL[dominantZone];
  return (
    <div className={`rounded-lg border px-3.5 py-2.5 ${panelClass}`}>
      <p className="text-xs text-gray-600 leading-relaxed">
        <span className={`font-bold ${accentClass}`}>
          {dominantEmployeeCount} employees ({dominantSharePct}%)
        </span>
        <span> in the </span>
        <span className={`font-bold ${accentClass}`}>{dominantBandLabel}</span>
        <span>{trailingAfterBand}</span>
      </p>
    </div>
  );
}

function PersonalRankingCard({
  rank,
  totalPeers,
  displayEpi,
  globalEpi,
}: {
  rank: number;
  totalPeers: number;
  displayEpi: number;
  globalEpi: number;
}) {
  const hero = useMemo(
    () => resolveHeroEpiComparison({ userEpiScore: displayEpi, globalAverageEpi: globalEpi }),
    [displayEpi, globalEpi],
  );
  const percentMain =
    hero.percentChange !== null && Number.isFinite(hero.percentChange)
      ? `${hero.percentChange > 0 ? "+" : ""}${hero.percentChange.toFixed(1)}%`
      : "—";
  const zoneClass = HERO_ZONE_TEXT[hero.zone];

  return (
    <motion.div custom={2} variants={cardVariants} initial="hidden" animate="visible" className="h-full">
      <AnalyticsCard
        icon={<Users className="h-4 w-4" />}
        title="Global Ranking"
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
              <span className="text-sm text-gray-400 font-medium">of {totalPeers}</span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${((totalPeers - rank + 1) / totalPeers) * 100}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  className="h-full rounded-full bg-primary-500"
                />
              </div>
              <span className="text-[10px] font-bold text-gray-400">
                Top {Math.round((rank / totalPeers) * 100)}%
              </span>
            </div>
          </div>

          {/* vs Global — EPI only */}
          <div className="pt-4 sm:pt-0 sm:pl-6 flex flex-col justify-center">
            <div className="flex items-center gap-1.5 mb-2.5">
              <BarChart2 className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">vs Global</span>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
                % change vs global
              </p>
              <span className={`text-5xl font-bold tabular-nums leading-none block ${zoneClass}`}>
                {percentMain}
              </span>
              <p className={`text-xs font-medium mt-2 leading-snug ${zoneClass}`}>
                {getHeroZoneLabel(hero.zone)}
              </p>
            </div>
          </div>
        </div>
      </AnalyticsCard>
    </motion.div>
  );
}

function PersonalTrendCard({
  userName,
  analyticsRange,
}: {
  userName: string;
  analyticsRange: AnalyticsRangeSelection;
}) {
  const [selectedMetric, setSelectedMetric] = useState(METRICS[0].id);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  const chartData = useMemo(
    () => buildPersonalMetricTrendRows(userName, selectedMetric, analyticsRange),
    [userName, selectedMetric, analyticsRange],
  );

  const subtitle = useMemo(() => buildPersonalTrendSubtitle(analyticsRange), [analyticsRange]);
  const selectedMetricKind = getMetricKind(selectedMetric);
  const trendYPadding = selectedMetricKind === 'likert' ? 0.25 : selectedMetricKind === 'monetary' ? 30 : 5;
  const yAxisDomain = useMemo<[number | ((v: number) => number), number | ((v: number) => number)]>(() => {
    if (selectedMetricKind === 'likert') {
      return [1, 5];
    }
    return [
      (dataMin: number) => Math.max(0, dataMin - trendYPadding),
      (dataMax: number) => dataMax + trendYPadding,
    ];
  }, [selectedMetricKind, trendYPadding]);

  const controlLabel = "text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5 flex items-center gap-1.5";

  return (
    <motion.div custom={3} variants={cardVariants} initial="hidden" animate="visible" className="h-full">
      <AnalyticsCard
        icon={<Activity className="h-4 w-4" />}
        title="Performance Trends"
        subtitle={subtitle}
      >
        {/* Controls */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 px-4 sm:px-5 pt-4 pb-3 border-b border-gray-50">
          <div className="w-full sm:w-64">
            <p className={controlLabel}>
              <Activity className="h-3 w-3" />
              Metric
            </p>
            <CompactMetricSelect
              selectedMetricId={selectedMetric}
              onSelect={setSelectedMetric}
            />
          </div>

          {/* Legend pills */}
          <div className="flex flex-wrap justify-center sm:justify-end gap-1.5 min-h-[28px] sm:ml-auto">
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
              Global Avg
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
                  domain={yAxisDomain}
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
                  formatter={(v, name) => {
                    const num =
                      typeof v === "number"
                        ? v
                        : typeof v === "string"
                          ? Number(v)
                          : NaN;
                    const label = typeof name === "string" ? name : "Score";
                    if (!Number.isFinite(num)) {
                      return ["—", label];
                    }
                    return [formatMetricDisplay(selectedMetric, num), label];
                  }}
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
                  dataKey="Global Avg"
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

function PersonalInsightsCard({
  analyticsRange,
  userName,
}: {
  analyticsRange: AnalyticsRangeSelection;
  userName: string;
}) {
  const [currentPage, setCurrentPage] = useState(0);
  const [pageDirection, setPageDirection] = useState(0);
  const metricRowsByMetric = useMemo(() => {
    const rows: Record<string, { name: string; value: number; previousValue: number }[]> = {};
    for (const metric of METRICS) {
      rows[metric.id] = getMetricAllEmployeeData(
        metric.id,
        analyticsRange,
        INDIVIDUAL_METRICS_ROSTER,
        getBaseMetricValueForEmployee,
      ).map((row) => ({
        name: row.name,
        value: row.value,
        previousValue: row.startValue,
      }));
    }
    return rows;
  }, [analyticsRange]);

  const insights = useMemo(
    () =>
      buildPersonalKeyInsights(analyticsRange, {
        employeeName: userName,
        metricRowsByMetric,
        metricBenchmarksByMetric: METRIC_BENCHMARKS,
      }),
    [analyticsRange, metricRowsByMetric, userName],
  );
  const totalPages = Math.max(1, Math.ceil(insights.length / PEOPLE_INSIGHTS_PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages - 1);
  const pageInsights = useMemo(
    () =>
      insights.slice(
        safeCurrentPage * PEOPLE_INSIGHTS_PAGE_SIZE,
        (safeCurrentPage + 1) * PEOPLE_INSIGHTS_PAGE_SIZE,
      ),
    [insights, safeCurrentPage],
  );

  useEffect(() => {
    setCurrentPage(0);
    setPageDirection(0);
  }, [analyticsRange, userName]);

  return (
    <motion.div custom={4} variants={cardVariants} initial="hidden" animate="visible" className="h-full">
      <AnalyticsCard
        icon={<AlertTriangle className="h-4 w-4" />}
        title="Key Insights"
        subtitle={formatInsightsPeriodSubtitle(analyticsRange)}
        className={FIXED_KEY_INSIGHTS_CARD_HEIGHT}
      >
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait" initial={false} custom={pageDirection}>
              <motion.div
                key={safeCurrentPage}
                custom={pageDirection}
                variants={keyInsightsPageVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="divide-y divide-gray-50 h-full overflow-auto"
              >
                {pageInsights.map((insight, idx) => (
                  <div
                    key={`${safeCurrentPage}-${idx}-${insight.metric}`}
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
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="px-4 pb-3">
            <CardPagination
              currentPage={safeCurrentPage}
              totalPages={totalPages}
              onPrevious={() => {
                setPageDirection(-1);
                setCurrentPage(p => Math.max(0, p - 1));
              }}
              onNext={() => {
                setPageDirection(1);
                setCurrentPage(p => Math.min(totalPages - 1, p + 1));
              }}
            />
          </div>
        </div>
      </AnalyticsCard>
    </motion.div>
  );
}

function PersonalRadarCard({
  userName,
  analyticsRange,
}: {
  userName: string;
  analyticsRange: AnalyticsRangeSelection;
}) {
  const radarData = useMemo(
    () => buildRadarDataset(userName, analyticsRange),
    [userName, analyticsRange],
  );

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
  'Customer Service': 4.1,
  'Workplace Relations': 3.9,
  'Professional Conduct': 4.1,
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
  generateRows: (seed: number, selection: AnalyticsRangeSelection) => MetricEventRow[];
}

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
    generateRows: (seed, selection) => {
      const dates = sampleCalendarDaysForEventLog(selection, 40).map(formatYmdForEventLog);
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
    generateRows: (seed, selection) => {
      const dates = sampleCalendarDaysForEventLog(selection, 35).map(formatYmdForEventLog);
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
    generateRows: (seed, selection) => {
      const dates = sampleCalendarDaysForEventLog(selection, 30).map(formatYmdForEventLog);
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
    generateRows: (seed, selection) => {
      const dates = sampleCalendarDaysForEventLog(selection, 45).map(formatYmdForEventLog);
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
    generateRows: (seed, selection) => {
      const dates = sampleCalendarDaysForEventLog(selection, 40).map(formatYmdForEventLog);
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
    generateRows: (seed, selection) => {
      const dates = sampleCalendarDaysForEventLog(selection, 35).map(formatYmdForEventLog);
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
    generateRows: (seed, selection) => {
      const dates = sampleCalendarDaysForEventLog(selection, 30).map(formatYmdForEventLog);
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
    generateRows: (seed, selection) => {
      const dates = sampleCalendarDaysForEventLog(selection, 32).map(formatYmdForEventLog);
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
    generateRows: (seed, selection) => {
      const dates = sampleCalendarDaysForEventLog(selection, 40).map(formatYmdForEventLog);
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

function PersonalMetricsBreakdownCard({
  stats,
  analyticsRange,
  userName,
}: {
  stats: ReturnType<typeof getPersonalizedStats>;
  analyticsRange: AnalyticsRangeSelection;
  userName: string;
}) {
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);

  const metricGroups = useMemo(() => {
    const mk = (label: string, metricKey: keyof typeof stats.metrics) => {
      const globalBase =
        GLOBAL_AVERAGES[label as keyof typeof GLOBAL_AVERAGES] ??
        BRANCH_AVERAGES[metricKey as keyof typeof BRANCH_AVERAGES] ??
        85;
      return {
        label,
        metricId: metricKey,
        val: perturbPersonalMetricValue(stats.metrics[metricKey], metricKey, userName, analyticsRange),
        avg: perturbGlobalMetricAverage(globalBase, analyticsRange),
      };
    };
    return [
      {
        title: "Core Performance",
        icon: <BarChart2 className="h-3.5 w-3.5 text-blue-500" />,
        items: [
          mk("Customer Service", "customer-service"),
          mk("Workplace Relations", "workplace-relations"),
          mk("Professional Conduct", "professional-conduct"),
        ],
      },
      {
        title: "Operational",
        icon: <Activity className="h-3.5 w-3.5 text-violet-500" />,
        items: [
          mk("Attendance", "attendance-rate"),
          mk("Punctuality", "punctuality-rate"),
          mk("Productivity", "productivity-rate"),
        ],
      },
      {
        title: "SOP & Compliance",
        icon: <Target className="h-3.5 w-3.5 text-emerald-500" />,
        items: [
          mk("Uniform", "uniform-compliance"),
          mk("Hygiene", "hygiene-compliance"),
          mk("SOP", "sop-compliance"),
        ],
      },
    ];
  }, [stats, userName, analyticsRange]);

  const allItems = metricGroups.flatMap((g) => g.items);

  const selectedItem = selectedMetric ? allItems.find((i) => i.label === selectedMetric) : null;
  const detailConfig = selectedMetric ? METRIC_DETAIL_CONFIGS[selectedMetric] : null;

  const eventRows = useMemo(() => {
    if (!selectedMetric || !detailConfig) return [];
    const seed = selectedMetric.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return detailConfig.generateRows(seed, analyticsRange);
  }, [selectedMetric, detailConfig, analyticsRange]);

  const totalPages = Math.max(1, Math.ceil(eventRows.length / ROWS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages - 1);
  const pageRows = eventRows.slice(
    safeCurrentPage * ROWS_PER_PAGE,
    (safeCurrentPage + 1) * ROWS_PER_PAGE,
  );

  const globalAvg = useMemo(() => {
    if (!selectedMetric) return 0;
    const base = GLOBAL_AVERAGES[selectedMetric as keyof typeof GLOBAL_AVERAGES] ?? 0;
    return perturbGlobalMetricAverage(base, analyticsRange);
  }, [selectedMetric, analyticsRange]);

  const rank = useMemo(() => {
    if (!selectedItem) return 0;
    const scorePct = metricProgressPct(selectedItem.metricId, selectedItem.val);
    const base = Math.max(1, Math.round((1 - scorePct / 100) * TOTAL_EMPLOYEES) + 1);
    const shift = (hashRangeSeed(analyticsRange) % 9) - 4;
    return Math.max(1, Math.min(TOTAL_EMPLOYEES, base + shift));
  }, [selectedItem, analyticsRange]);

  useEffect(() => {
    setCurrentPage(0);
  }, [analyticsRange]);

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
                {isDetailView ? selectedMetric : "All scores vs global average"}
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
                            <span className="text-sm font-bold text-gray-800 tabular-nums">
                              {formatMetricDisplay(item.metricId, item.val)}
                            </span>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${
                                isPos
                                  ? 'bg-emerald-50 text-emerald-600 ring-emerald-100'
                                  : 'bg-amber-50 text-amber-600 ring-amber-100'
                              }`}
                            >
                              {formatMetricDeltaDisplay(item.metricId, diff)}
                            </span>
                          </div>
                        </div>
                        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${metricProgressPct(item.metricId, item.val)}%` }}
                            transition={{ duration: 0.8, ease: 'easeOut' }}
                            className={`h-full rounded-full ${isPos ? 'bg-emerald-500' : 'bg-amber-400'}`}
                          />
                          <div
                            className="absolute top-0 h-full w-0.5 bg-gray-400/60"
                            style={{ left: `${metricProgressPct(item.metricId, item.avg)}%` }}
                            title={`Global avg: ${formatMetricDisplay(item.metricId, item.avg)}`}
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
                are at or above global average.
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
                      {formatMetricDisplay(selectedItem.metricId, selectedItem.val)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3 text-center ring-1 ring-inset ring-gray-100">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-1">Global Avg</p>
                    <p className="text-2xl font-bold text-gray-600 tabular-nums">
                      {formatMetricDisplay(selectedItem.metricId, globalAvg)}
                    </p>
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
                  <CardPagination
                    currentPage={safeCurrentPage}
                    totalPages={totalPages}
                    onPrevious={() => setCurrentPage(p => Math.max(0, p - 1))}
                    onNext={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                    layout="centered"
                  />
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

function TrendAnalyticsCard({
  analyticsRange,
  comparisonSubtitle,
}: {
  analyticsRange: AnalyticsRangeSelection;
  comparisonSubtitle: string;
}) {
  const [selectedUsers, setSelectedUsers] = useState<string[]>([ANALYTICS_USERS[0]]);
  const [selectedMetric, setSelectedMetric] = useState(METRICS[0].id);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  const chartData = useMemo(
    () => buildTrendComparisonRows(analyticsRange, selectedUsers, selectedMetric),
    [analyticsRange, selectedUsers, selectedMetric],
  );
  const selectedMetricKind = getMetricKind(selectedMetric);
  const trendYPadding = selectedMetricKind === 'likert' ? 0.25 : selectedMetricKind === 'monetary' ? 30 : 5;
  const yAxisDomain = useMemo<[number | ((v: number) => number), number | ((v: number) => number)]>(() => {
    if (selectedMetricKind === 'likert') {
      return [1, 5];
    }
    return [
      (dataMin: number) => Math.max(0, dataMin - trendYPadding),
      (dataMax: number) => dataMax + trendYPadding,
    ];
  }, [selectedMetricKind, trendYPadding]);

  const handleToggleUser = (userName: string) => {
    if (selectedUsers.includes(userName)) {
      if (selectedUsers.length > 1) {
        setSelectedUsers(selectedUsers.filter(u => u !== userName));
      }
    } else if (selectedUsers.length < 5) {
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
        subtitle={comparisonSubtitle}
      >
        {/* Controls — stacked on mobile, inline on desktop */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 px-4 sm:px-5 pt-4 pb-3 border-b border-gray-50">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 flex-1">
            {/* Add Employee */}
            <div className="w-full sm:w-56">
              <p className={controlLabel}>
                <Users className="h-3 w-3" />
                Employees
              </p>
              <EmployeePickerDropdown
                allUsers={ANALYTICS_USERS}
                selectedUsers={selectedUsers}
                onToggle={handleToggleUser}
              />
            </div>
            {/* Metric */}
            <div className="w-full sm:w-64">
              <p className={controlLabel}>
                <Activity className="h-3 w-3" />
                Metric
              </p>
              <CompactMetricSelect
                selectedMetricId={selectedMetric}
                onSelect={setSelectedMetric}
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
                  domain={yAxisDomain}
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
                  formatter={(v, name) => {
                    const num =
                      typeof v === "number"
                        ? v
                        : typeof v === "string"
                          ? Number(v)
                          : NaN;
                    const label = typeof name === "string" ? name : "Score";
                    if (!Number.isFinite(num)) {
                      return ["—", label];
                    }
                    return [formatMetricDisplay(selectedMetric, num), label];
                  }}
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

// ─── General View: Key Insights Card ───────────────────────────────────────────

function GeneralKeyInsightsCard({
  analyticsRange,
  globalEpiCurrent,
  globalEpiPrevious,
  employeeEpi,
}: {
  analyticsRange: AnalyticsRangeSelection;
  globalEpiCurrent: number;
  globalEpiPrevious: number;
  employeeEpi: Array<{ name: string; epi: number }>;
}) {
  const [currentPage, setCurrentPage] = useState(0);
  const [pageDirection, setPageDirection] = useState(0);
  const metricRowsByMetric = useMemo(() => {
    const rows: Record<string, { name: string; value: number; previousValue: number }[]> = {};
    for (const metric of METRICS) {
      rows[metric.id] = getMetricAllEmployeeData(
        metric.id,
        analyticsRange,
        INDIVIDUAL_METRICS_ROSTER,
        getBaseMetricValueForEmployee,
      ).map((row) => ({
        name: row.name,
        value: row.value,
        previousValue: row.startValue,
      }));
    }
    return rows;
  }, [analyticsRange]);

  const alerts = useMemo(
    () =>
      buildGeneralKeyInsights(analyticsRange, {
        globalEpiCurrent,
        globalEpiPrevious,
        employeeEpi,
        metricRowsByMetric,
        metricBenchmarksByMetric: METRIC_BENCHMARKS,
      }),
    [analyticsRange, employeeEpi, globalEpiCurrent, globalEpiPrevious, metricRowsByMetric],
  );
  const totalPages = Math.max(1, Math.ceil(alerts.length / PEOPLE_INSIGHTS_PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages - 1);
  const pageAlerts = useMemo(
    () =>
      alerts.slice(
        safeCurrentPage * PEOPLE_INSIGHTS_PAGE_SIZE,
        (safeCurrentPage + 1) * PEOPLE_INSIGHTS_PAGE_SIZE,
      ),
    [alerts, safeCurrentPage],
  );

  useEffect(() => {
    setCurrentPage(0);
    setPageDirection(0);
  }, [analyticsRange]);

  return (
    <motion.div custom={4} variants={cardVariants} initial="hidden" animate="visible" className="h-full">
      <AnalyticsCard
        icon={<AlertTriangle className="h-4 w-4" />}
        title="Key Insights"
        subtitle={formatInsightsPeriodSubtitle(analyticsRange)}
        className={FIXED_KEY_INSIGHTS_CARD_HEIGHT}
      >
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait" initial={false} custom={pageDirection}>
              <motion.div
                key={safeCurrentPage}
                custom={pageDirection}
                variants={keyInsightsPageVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="divide-y divide-gray-50 h-full overflow-auto"
              >
          {pageAlerts.map((alert, idx) => (
            <div
              key={`${safeCurrentPage}-${idx}-${alert.id}`}
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
                  <p className={`text-sm font-semibold leading-none mb-1 ${
                    alert.type === 'warning' ? 'text-amber-700' : 'text-emerald-700'
                  }`}>
                    {alert.employee}
                  </p>
                  <p className="text-xs text-gray-500 leading-relaxed">{alert.message}</p>
                </div>
              </div>
            </div>
          ))}
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="px-4 pb-3">
            <CardPagination
              currentPage={safeCurrentPage}
              totalPages={totalPages}
              onPrevious={() => {
                setPageDirection(-1);
                setCurrentPage(p => Math.max(0, p - 1));
              }}
              onNext={() => {
                setPageDirection(1);
                setCurrentPage(p => Math.min(totalPages - 1, p + 1));
              }}
            />
          </div>
        </div>
      </AnalyticsCard>
    </motion.div>
  );
}

// ─── Performance Radar Card ───────────────────────────────────────────────────

function PerformanceRadarCard({ analyticsRange }: { analyticsRange: AnalyticsRangeSelection }) {
  const [selectedUser, setSelectedUser] = useState(ANALYTICS_USERS[0]);
  const radarData = useMemo(
    () => buildRadarDataset(selectedUser, analyticsRange),
    [selectedUser, analyticsRange],
  );

  return (
    <motion.div custom={5} variants={cardVariants} initial="hidden" animate="visible" className="h-full">
      <AnalyticsCard
        icon={<Target className="h-4 w-4" />}
        title="Performance Radar"
        subtitle="Multi-metric overview"
        headerRight={
          <CompactUserSelect
            users={ANALYTICS_USERS}
            selectedUser={selectedUser}
            onSelect={setSelectedUser}
          />
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

function MetricsDistributionCard({
  distributionData,
  distributionDominantEmployeeCount,
  distributionDominantSharePct,
  distributionDominantBandLabel,
  distributionSummaryDominantZone,
}: {
  distributionData: { range: string; count: number; fill: string }[];
  distributionDominantEmployeeCount: number;
  distributionDominantSharePct: number;
  distributionDominantBandLabel: string;
  distributionSummaryDominantZone: HeroEpiZone;
}) {
  const totalEmployees = distributionData.reduce((sum, d) => sum + d.count, 0);

  return (
    <motion.div custom={6} variants={cardVariants} initial="hidden" animate="visible" className="h-full">
      <AnalyticsCard
        icon={<Users className="h-4 w-4" />}
        title="EPI score distribution"
        subtitle={`${totalEmployees} employees · vs Global Average EPI`}
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

          {/* Legend — single row on all breakpoints */}
          <div className="grid grid-cols-4 gap-1">
            {distributionData.map(d => {
              const pct = totalEmployees > 0 ? Math.round((d.count / totalEmployees) * 100) : 0;
              return (
                <div key={d.range} className="flex min-w-0 flex-col items-center gap-1">
                  <div className="h-1.5 w-full rounded-full" style={{ background: d.fill }} />
                  <span className="text-[10px] font-bold text-gray-500 tabular-nums">{pct}%</span>
                  <span className="text-[8px] sm:text-[9px] text-gray-400 font-medium text-center leading-tight px-0.5 break-words">{d.range}</span>
                </div>
              );
            })}
          </div>

          <HeroZoneDistributionSummaryPanel
            dominantEmployeeCount={distributionDominantEmployeeCount}
            dominantSharePct={distributionDominantSharePct}
            dominantBandLabel={distributionDominantBandLabel}
            dominantZone={distributionSummaryDominantZone}
            trailingAfterBand=" category — the highest concentration."
          />
        </div>
      </AnalyticsCard>
    </motion.div>
  );
}

// ─── Compact Dropdowns (SingleUserSelect-style, for inline card controls) ───

/** Hook: computes fixed position for a dropdown panel relative to a trigger ref */
function useDropdownPosition(triggerRef: React.RefObject<HTMLElement | null>, isOpen: boolean, align: 'left' | 'right' = 'left') {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;
    const update = () => {
      const rect = triggerRef.current!.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, left: align === 'right' ? rect.right : rect.left, width: rect.width });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [isOpen, triggerRef, align]);

  return pos;
}

/** Multi-select employee picker — stays open, toggles checkmarks, max 5 */
function EmployeePickerDropdown({
  allUsers,
  selectedUsers,
  onToggle,
  max = 5,
}: {
  allUsers: string[];
  selectedUsers: string[];
  onToggle: (name: string) => void;
  max?: number;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pos = useDropdownPosition(triggerRef, isOpen);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const filtered = allUsers.filter(u =>
    u.toLowerCase().includes(search.toLowerCase())
  );

  const count = selectedUsers.length;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left transition-all hover:border-blue-400 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      >
        <div className="h-6 w-6 flex items-center justify-center rounded-full bg-gray-100 text-gray-400 flex-shrink-0">
          <Users className="h-3 w-3" />
        </div>
        <span className="text-xs font-medium text-gray-700 flex-1 truncate">
          {count === 0 ? <span className="text-gray-400">Select employees…</span> : `${count} selected`}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="fixed z-[9999] rounded-2xl border border-gray-100 bg-white p-2 shadow-xl ring-1 ring-black/5"
            style={{ top: pos.top, left: pos.left, width: Math.max(pos.width, 240) }}
          >
            {/* Search */}
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border-none bg-gray-50 py-2 pl-8 pr-3 text-xs font-medium text-gray-700 placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-blue-500/10"
              />
            </div>

            {/* Capacity indicator */}
            <div className="flex items-center justify-between px-2.5 pb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                {count}/{max} selected
              </span>
              {count >= max && (
                <span className="text-[10px] font-bold text-amber-500">Max reached</span>
              )}
            </div>

            {/* List */}
            <div className="max-h-[260px] overflow-y-auto p-1 space-y-0.5">
              {filtered.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-xs font-medium text-gray-400">No employees found</p>
                </div>
              ) : (
                filtered.map((user) => {
                  const isSelected = selectedUsers.includes(user);
                  const isDisabled = !isSelected && count >= max;
                  const initials = user.split(' ').map(w => w[0]).join('').toUpperCase();
                  const hue = user.split('').reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) & 0xffffffff, 0) % 360;
                  return (
                    <button
                      key={user}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => onToggle(user)}
                      className={`group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left transition-all ${
                        isDisabled
                          ? 'opacity-40 cursor-not-allowed'
                          : isSelected
                            ? 'bg-blue-50/80 hover:bg-blue-50'
                            : 'hover:bg-blue-50/50'
                      }`}
                    >
                      {/* Checkbox */}
                      <div className={`h-4 w-4 flex flex-shrink-0 items-center justify-center rounded border transition-colors ${
                        isSelected
                          ? 'bg-blue-600 border-blue-600'
                          : 'border-gray-300 bg-white'
                      }`}>
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <div
                        className="h-6 w-6 flex flex-shrink-0 items-center justify-center rounded-full text-white text-[9px] font-bold shadow-sm"
                        style={{ backgroundColor: `hsl(${Math.abs(hue)}, 65%, 55%)` }}
                      >
                        {initials}
                      </div>
                      <span className={`text-xs font-semibold truncate ${isSelected ? 'text-blue-700' : 'text-gray-700'}`}>
                        {user}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Compact metric picker — used inside card control strips */
function CompactMetricSelect({
  selectedMetricId,
  onSelect,
}: {
  selectedMetricId: string;
  onSelect: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pos = useDropdownPosition(triggerRef, isOpen);

  const selectedMetric = METRICS.find(m => m.id === selectedMetricId);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const filtered = METRICS.filter(m =>
    m.label.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left transition-all hover:border-blue-400 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      >
        <div className="h-6 w-6 flex items-center justify-center rounded-full bg-primary-50 text-primary-600 flex-shrink-0">
          <Activity className="h-3 w-3" />
        </div>
        <span className="text-xs font-semibold text-gray-700 flex-1 truncate">
          {selectedMetric?.label ?? 'Select metric…'}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="fixed z-[9999] rounded-2xl border border-gray-100 bg-white p-2 shadow-xl ring-1 ring-black/5"
            style={{ top: pos.top, left: pos.left, width: Math.max(pos.width, 260) }}
          >
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus
                type="text"
                placeholder="Search metrics..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border-none bg-gray-50 py-2 pl-8 pr-3 text-xs font-medium text-gray-700 placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-blue-500/10"
              />
            </div>
            <div className="max-h-[280px] overflow-y-auto p-1 space-y-0.5">
              {filtered.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-xs font-medium text-gray-400">No metrics found</p>
                </div>
              ) : (
                filtered.map((metric) => (
                  <button
                    key={metric.id}
                    type="button"
                    onClick={() => {
                      onSelect(metric.id);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className={`group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left transition-all hover:bg-blue-50/50 ${
                      selectedMetricId === metric.id ? 'bg-blue-50/80' : ''
                    }`}
                  >
                    <div className={`h-6 w-6 flex flex-shrink-0 items-center justify-center rounded-full shadow-sm ${
                      selectedMetricId === metric.id ? 'bg-primary-100 text-primary-600' : 'bg-gray-50 text-gray-500'
                    }`}>
                      {METRIC_ICONS[metric.id] ?? <Target className="h-3 w-3" />}
                    </div>
                    <span className={`text-xs font-semibold truncate ${selectedMetricId === metric.id ? 'text-blue-700' : 'text-gray-700'}`}>
                      {metric.label}
                    </span>
                    {selectedMetricId === metric.id && (
                      <Check className="h-3.5 w-3.5 text-blue-600 ml-auto flex-shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Compact single-user picker — used in Performance Radar header */
function CompactUserSelect({
  users,
  selectedUser,
  onSelect,
}: {
  users: string[];
  selectedUser: string;
  onSelect: (name: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pos = useDropdownPosition(triggerRef, isOpen, 'right');

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const filtered = users.filter(u =>
    u.toLowerCase().includes(search.toLowerCase())
  );

  const initials = selectedUser.split(' ').map(w => w[0]).join('').toUpperCase();
  const hue = selectedUser.split('').reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) & 0xffffffff, 0) % 360;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 text-left transition-all hover:border-blue-400 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      >
        <div
          className="h-5 w-5 flex items-center justify-center rounded-full text-white text-[8px] font-bold flex-shrink-0"
          style={{ backgroundColor: `hsl(${Math.abs(hue)}, 65%, 55%)` }}
        >
          {initials}
        </div>
        <span className="text-xs font-semibold text-gray-700 truncate max-w-[100px]">{selectedUser}</span>
        <ChevronDown className={`h-3 w-3 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="fixed z-[9999] w-56 rounded-2xl border border-gray-100 bg-white p-2 shadow-xl ring-1 ring-black/5"
            style={{ top: pos.top, left: Math.max(8, pos.left - 224) }}
          >
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border-none bg-gray-50 py-2 pl-8 pr-3 text-xs font-medium text-gray-700 placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-blue-500/10"
              />
            </div>
            <div className="max-h-[240px] overflow-y-auto p-1 space-y-0.5">
              {filtered.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-xs font-medium text-gray-400">No employees found</p>
                </div>
              ) : (
                filtered.map((user) => {
                  const uInitials = user.split(' ').map(w => w[0]).join('').toUpperCase();
                  const uHue = user.split('').reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) & 0xffffffff, 0) % 360;
                  const isSelected = selectedUser === user;
                  return (
                    <button
                      key={user}
                      type="button"
                      onClick={() => {
                        onSelect(user);
                        setIsOpen(false);
                        setSearch('');
                      }}
                      className={`group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left transition-all hover:bg-blue-50/50 ${
                        isSelected ? 'bg-blue-50/80' : ''
                      }`}
                    >
                      <div
                        className="h-6 w-6 flex flex-shrink-0 items-center justify-center rounded-full text-white text-[9px] font-bold shadow-sm"
                        style={{ backgroundColor: `hsl(${Math.abs(uHue)}, 65%, 55%)` }}
                      >
                        {uInitials}
                      </div>
                      <span className={`text-xs font-semibold truncate ${isSelected ? 'text-blue-700' : 'text-gray-700'}`}>
                        {user}
                      </span>
                      {isSelected && (
                        <Check className="h-3.5 w-3.5 text-blue-600 ml-auto flex-shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Individual Metrics View Components ──────────────────────────────────────

const METRIC_LABELS: Record<string, string> = {
  'customer-service': 'Customer Service Score',
  'workplace-relations': 'Workplace Relations Score',
  'professional-conduct': 'Professional Conduct Score',
  'attendance-rate': 'Attendance Rate',
  'punctuality-rate': 'Punctuality Rate',
  'productivity-rate': 'Productivity Rate',
  'average-order-value': 'Average Order Value',
  'uniform-compliance': 'Uniform Compliance',
  'hygiene-compliance': 'Hygiene Compliance',
  'sop-compliance': 'SOP Compliance',
};

function formatMetricDisplay(metricId: string, value: number, fractionDigits = 1): string {
  const kind = getMetricKind(metricId);
  if (kind === 'monetary') {
    return `₱${value.toFixed(0)}`;
  }
  if (kind === 'likert') {
    const digits = fractionDigits > 1 ? fractionDigits : 2;
    return `${value.toFixed(digits)}/5`;
  }
  return `${value.toFixed(1)}%`;
}

function formatMetricDeltaDisplay(metricId: string, delta: number): string {
  return formatRuleMetricDelta(metricId, delta);
}

function formatMetricStdDev(metricId: string, value: number): string {
  const kind = getMetricKind(metricId);
  if (kind === 'monetary') {
    return `±₱${value.toFixed(1)}`;
  }
  if (kind === 'likert') {
    return `±${value.toFixed(2)}`;
  }
  return `±${value.toFixed(1)} pts`;
}

function metricProgressPct(metricId: string, value: number, maxForMonetary = 100): number {
  const kind = getMetricKind(metricId);
  if (kind === 'monetary') {
    const safeMax = maxForMonetary > 0 ? maxForMonetary : 1;
    return Math.min(100, Math.max(0, (value / safeMax) * 100));
  }
  const scale = getMetricScaleMax(metricId) || 100;
  return Math.min(100, Math.max(0, (value / scale) * 100));
}

function MetricSummaryCard({
  metricId,
  analyticsRange,
}: {
  metricId: string;
  analyticsRange: AnalyticsRangeSelection;
}) {
  const employees = useMemo(
    () =>
      getMetricAllEmployeeData(metricId, analyticsRange, INDIVIDUAL_METRICS_ROSTER, getBaseMetricValueForEmployee),
    [metricId, analyticsRange],
  );
  const trendData = useMemo(
    () =>
      getMetricTrendForRange(
        metricId,
        analyticsRange,
        BRANCH_AVERAGES[metricId as keyof typeof BRANCH_AVERAGES] ?? 85,
      ),
    [metricId, analyticsRange],
  );
  const avg = employees.reduce((s, e) => s + e.value, 0) / employees.length;
  const avgPeriodChange = employees.reduce((s, e) => s + e.periodChange, 0) / employees.length;
  const summaryTrendFooter = useMemo(() => buildMetricSummaryTrendFooter(analyticsRange), [analyticsRange]);
  const summaryYPadding = getMetricKind(metricId) === 'likert' ? 0.4 : 3;

  return (
    <motion.div custom={0} variants={cardVariants} initial="hidden" animate="visible" className="h-full">
      <div
        className="relative flex flex-col overflow-hidden rounded-xl shadow-sm h-full min-h-[160px]"
        style={{
          background:
            'linear-gradient(150deg, rgb(var(--primary-600)) 0%, rgb(var(--primary-700)) 60%, rgb(var(--primary-800)) 100%)',
        }}
      >
        <div
          className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full opacity-[0.08]"
          style={{ background: 'rgba(255,255,255,1)' }}
        />

        <div className="px-5 pt-5 pb-3 flex-shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/55">
            Global Average
          </p>
          <div className="mt-2 flex items-end gap-3">
            <span
              className="text-[48px] font-bold leading-none text-white tabular-nums"
              style={{ letterSpacing: '-2px' }}
            >
              {formatMetricDisplay(metricId, avg)}
            </span>
            <div className="mb-2 flex items-center gap-1.5">
              <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ${
                avgPeriodChange >= 0
                  ? 'bg-emerald-400/20 text-emerald-300 ring-emerald-400/20'
                  : 'bg-red-400/20 text-red-300 ring-red-400/20'
              }`}>
                {avgPeriodChange >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {formatMetricDeltaDisplay(metricId, avgPeriodChange)}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
                avg period
              </span>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-[80px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="metric-summary-glow" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.3)" />
                  <stop offset="100%" stopColor="rgba(255,255,255,0.9)" />
                </linearGradient>
              </defs>
              <YAxis
                domain={[
                  (dataMin: number) => Math.max(0, dataMin - summaryYPadding),
                  (dataMax: number) => dataMax + summaryYPadding,
                ]}
                hide
              />
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
                formatter={(v) => {
                  const num = typeof v === 'number' ? v : Number(v);
                  return [Number.isFinite(num) ? formatRuleMetricValue(metricId, num) : '—', 'Score'];
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="url(#metric-summary-glow)"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, fill: '#fff', strokeWidth: 0 }}
                animationDuration={1200}
                animationEasing="ease-out"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="flex items-center justify-between px-5 py-2.5 border-t border-white/10 flex-shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
            {employees.length} employees
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">
            {summaryTrendFooter}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function MetricTopBottomCard({
  metricId,
  analyticsRange,
}: {
  metricId: string;
  analyticsRange: AnalyticsRangeSelection;
}) {
  const employees = useMemo(
    () =>
      getMetricAllEmployeeData(metricId, analyticsRange, INDIVIDUAL_METRICS_ROSTER, getBaseMetricValueForEmployee),
    [metricId, analyticsRange],
  );
  const top3 = employees.slice(0, 3);
  const bottom3 = employees.slice(-3).reverse();

  return (
    <motion.div custom={1} variants={cardVariants} initial="hidden" animate="visible" className="h-full">
      <AnalyticsCard icon={<Users className="h-4 w-4" />} title="Top & Bottom" subtitle="Performers for this metric">
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y divide-gray-100 sm:divide-y-0 sm:divide-x p-4 sm:p-5 gap-0 flex-1">
          <div className="pb-4 sm:pb-0 sm:pr-6">
            <div className="flex items-center gap-1.5 mb-2.5">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Top Performers</span>
            </div>
            <div className="space-y-0.5">
              {top3.map((emp, idx) => (
                <motion.div
                  key={emp.name}
                  variants={{
                    hidden: { opacity: 0, x: -8 },
                    visible: { opacity: 1, x: 0, transition: { delay: 0.1 + idx * 0.05, ease: 'easeOut', duration: 0.3 } },
                  }}
                  initial="hidden"
                  animate="visible"
                  className="flex items-center justify-between rounded-md px-2 py-2 transition-colors hover:bg-gray-50"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-4 text-[10px] font-bold text-gray-300 tabular-nums flex-shrink-0">
                      {idx + 1}
                    </span>
                    <span className="text-sm font-medium text-gray-700 truncate">{emp.name}</span>
                  </div>
                  <span className="ml-2 text-sm font-bold text-emerald-600 tabular-nums flex-shrink-0">
                    {formatMetricDisplay(metricId, emp.value)}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="pt-4 sm:pt-0 sm:pl-6">
            <div className="flex items-center gap-1.5 mb-2.5">
              <TrendingDown className="h-3.5 w-3.5 text-red-500" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-red-600">Needs Improvement</span>
            </div>
            <div className="space-y-0.5">
              {bottom3.map((emp, idx) => (
                <motion.div
                  key={emp.name}
                  variants={{
                    hidden: { opacity: 0, x: -8 },
                    visible: { opacity: 1, x: 0, transition: { delay: 0.1 + idx * 0.05, ease: 'easeOut', duration: 0.3 } },
                  }}
                  initial="hidden"
                  animate="visible"
                  className="flex items-center justify-between rounded-md px-2 py-2 transition-colors hover:bg-gray-50"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-4 text-[10px] font-bold text-gray-300 tabular-nums flex-shrink-0">
                      {employees.length - 2 + idx}
                    </span>
                    <span className="text-sm font-medium text-gray-700 truncate">{emp.name}</span>
                  </div>
                  <span className="ml-2 text-sm font-bold text-red-500 tabular-nums flex-shrink-0">
                    {formatMetricDisplay(metricId, emp.value)}
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

function MetricBenchmarkCard({
  metricId,
  analyticsRange,
}: {
  metricId: string;
  analyticsRange: AnalyticsRangeSelection;
}) {
  const employees = useMemo(
    () =>
      getMetricAllEmployeeData(metricId, analyticsRange, INDIVIDUAL_METRICS_ROSTER, getBaseMetricValueForEmployee),
    [metricId, analyticsRange],
  );
  const avg = employees.reduce((s, e) => s + e.value, 0) / employees.length;
  const globalTarget = useMemo(
    () =>
      perturbMetricGlobalTarget(
        metricId,
        BRANCH_AVERAGES[metricId as keyof typeof BRANCH_AVERAGES] ?? 85,
        analyticsRange,
      ),
    [metricId, analyticsRange],
  );

  const aboveTarget = employees.filter((e) => e.value >= globalTarget).length;
  const pctAbove = Math.round((aboveTarget / employees.length) * 100);
  const median = employees[Math.floor(employees.length / 2)]?.value ?? 0;
  const stdDev = Math.sqrt(employees.reduce((s, e) => s + Math.pow(e.value - avg, 2), 0) / employees.length);

  return (
    <motion.div custom={2} variants={cardVariants} initial="hidden" animate="visible" className="h-full">
      <AnalyticsCard icon={<Target className="h-4 w-4" />} title="Benchmarks" subtitle="Key statistical measures">
        <div className="p-4 sm:p-5 flex flex-col gap-4 flex-1">
          {/* Key metrics grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Target', value: formatMetricDisplay(metricId, globalTarget), icon: Target, color: 'text-primary-600' },
              { label: 'Median', value: formatMetricDisplay(metricId, median), icon: Hash, color: 'text-violet-600' },
              { label: 'Std Dev', value: formatMetricStdDev(metricId, stdDev), icon: Activity, color: 'text-amber-600' },
              { label: 'Above Target', value: `${pctAbove}%`, icon: Percent, color: 'text-emerald-600' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg bg-gray-50 p-3 ring-1 ring-inset ring-gray-100">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <stat.icon className={`h-3 w-3 ${stat.color}`} />
                  <span className="text-[9px] font-bold uppercase tracking-widest text-gray-400">{stat.label}</span>
                </div>
                <p className={`text-lg font-bold tabular-nums ${stat.color}`}>{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Target achievement bar */}
          <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-3.5 py-2.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Target Achievement</span>
              <span className="text-xs font-bold text-blue-700">{aboveTarget}/{employees.length}</span>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-blue-100">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pctAbove}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className="h-full rounded-full bg-blue-500"
              />
            </div>
          </div>
        </div>
      </AnalyticsCard>
    </motion.div>
  );
}

function MetricEmployeeRankingCard({
  metricId,
  analyticsRange,
}: {
  metricId: string;
  analyticsRange: AnalyticsRangeSelection;
}) {
  const [sortBy, setSortBy] = useState<'rank' | 'change'>('rank');
  const employees = useMemo(
    () =>
      getMetricAllEmployeeData(metricId, analyticsRange, INDIVIDUAL_METRICS_ROSTER, getBaseMetricValueForEmployee),
    [metricId, analyticsRange],
  );
  const avg = employees.reduce((s, e) => s + e.value, 0) / employees.length;
  const maxVal = Math.max(...employees.map(e => e.value));

  const sorted = useMemo(() => {
    if (sortBy === 'change') {
      return [...employees].sort((a, b) => b.periodChange - a.periodChange);
    }
    return employees;
  }, [employees, sortBy]);

  return (
    <motion.div custom={3} variants={cardVariants} initial="hidden" animate="visible" className="h-full">
      <AnalyticsCard
        icon={<BarChart2 className="h-4 w-4" />}
        title="Employee Rankings"
        subtitle={`All employees sorted by ${sortBy === 'rank' ? 'score' : 'range change'}`}
        headerRight={
          <div className="hidden sm:flex items-center gap-0 rounded-lg bg-gray-100 p-0.5">
            {(['rank', 'change'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setSortBy(tab)}
                className={`relative rounded-md px-3 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  sortBy === tab ? 'text-primary-600' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {sortBy === tab && (
                  <motion.div
                    layoutId="metric-sort-indicator"
                    className="absolute inset-0 rounded-md bg-white shadow-sm ring-1 ring-inset ring-gray-200/60"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{tab === 'rank' ? 'By Score' : 'By Change'}</span>
              </button>
            ))}
          </div>
        }
      >
        {/* Mobile sort tabs — full-width strip */}
        <div className="flex sm:hidden items-center justify-center gap-0 rounded-lg bg-gray-100 p-0.5 mx-4 mt-3">
          {(['rank', 'change'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setSortBy(tab)}
              className={`relative flex-1 rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors ${
                sortBy === tab ? 'text-primary-600' : 'text-gray-400'
              }`}
            >
              {sortBy === tab && (
                <motion.div
                  layoutId="metric-sort-indicator-mobile"
                  className="absolute inset-0 rounded-md bg-white shadow-sm ring-1 ring-inset ring-gray-200/60"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10">{tab === 'rank' ? 'By Score' : 'By Change'}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto">
          {/* Table header — desktop only */}
          <div className="hidden sm:grid sticky top-0 z-10 grid-cols-12 gap-2 px-5 py-2.5 bg-gray-50/80 backdrop-blur-sm border-b border-gray-100 text-[10px] font-bold uppercase tracking-widest text-gray-400">
            <div className="col-span-1 text-center">#</div>
            <div className="col-span-3">Employee</div>
            <div className="col-span-5">Score</div>
            <div className="col-span-3 text-right">Period Δ</div>
          </div>

          {/* Employee rows */}
          <div className="divide-y divide-gray-50">
            <AnimatePresence mode="popLayout">
            {sorted.map((emp, idx) => {
              const diff = emp.value - avg;
              const isAboveAvg = diff >= 0;
              const barWidth = metricProgressPct(metricId, emp.value, maxVal);
              const avgMarker = metricProgressPct(metricId, avg, maxVal);
              const originalRank = employees.findIndex(e => e.name === emp.name) + 1;
              const displayRank = sortBy === 'rank' ? idx + 1 : originalRank;

              return (
                <motion.div
                  key={emp.name}
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ layout: { type: 'spring', stiffness: 350, damping: 30 }, opacity: { duration: 0.2 } }}
                  className="px-4 sm:px-5 py-3 transition-colors hover:bg-gray-50/60 group"
                >
                  {/* ── Desktop: single-row grid ── */}
                  <div className="hidden sm:grid grid-cols-12 gap-2 items-center">
                    {/* Rank */}
                    <div className="col-span-1 text-center">
                      <span className={`text-xs font-bold tabular-nums ${
                        displayRank <= 3 ? 'text-primary-600' : 'text-gray-300'
                      }`}>
                        {displayRank}
                      </span>
                    </div>

                    {/* Name */}
                    <div className="col-span-3 min-w-0">
                      <p className="text-sm font-semibold text-gray-700 truncate group-hover:text-primary-600 transition-colors">
                        {emp.name}
                      </p>
                      <p className="text-[10px] text-gray-400 truncate">{emp.role}</p>
                    </div>

                    {/* Score bar */}
                    <div className="col-span-5 flex items-center gap-2.5">
                      <div className="flex-1 relative h-5 overflow-hidden rounded bg-gray-100">
                        <motion.div
                          key={`${emp.name}-${sortBy}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${barWidth}%` }}
                          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: idx * 0.015 }}
                          className={`h-full rounded ${
                            isAboveAvg ? 'bg-emerald-400/70' : 'bg-amber-400/70'
                          }`}
                        />
                        <div
                          className="absolute top-0 h-full w-px bg-gray-400/50"
                          style={{ left: `${avgMarker}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-gray-700 tabular-nums w-14 text-right flex-shrink-0">
                        {formatMetricDisplay(metricId, emp.value)}
                      </span>
                    </div>

                    {/* Period change: first bucket to last bucket in selected range */}
                    <div className="col-span-3 flex items-center justify-end">
                      <span className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${
                        emp.periodChange > 0
                          ? 'bg-emerald-50 text-emerald-600 ring-emerald-100'
                          : emp.periodChange < 0
                            ? 'bg-red-50 text-red-500 ring-red-100'
                            : 'bg-gray-50 text-gray-500 ring-gray-100'
                      }`}>
                        {emp.periodChange > 0 ? (
                          <ArrowUpRight className="h-3 w-3" />
                        ) : emp.periodChange < 0 ? (
                          <ArrowDownRight className="h-3 w-3" />
                        ) : (
                          <Minus className="h-3 w-3" />
                        )}
                        {formatMetricDeltaDisplay(metricId, emp.periodChange)}
                      </span>
                    </div>
                  </div>

                  {/* ── Mobile: stacked card layout ── */}
                  <div className="flex flex-col gap-2.5 sm:hidden">
                    {/* Top row: rank + name + change */}
                    <div className="flex items-center gap-2.5">
                      <span className={`text-sm font-bold tabular-nums w-6 text-center flex-shrink-0 ${
                        displayRank <= 3 ? 'text-primary-600' : 'text-gray-300'
                      }`}>
                        {displayRank}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-700 truncate">
                          {emp.name}
                        </p>
                        <p className="text-[10px] text-gray-400">{emp.role}</p>
                      </div>
                      <span className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset flex-shrink-0 ${
                        emp.periodChange > 0
                          ? 'bg-emerald-50 text-emerald-600 ring-emerald-100'
                          : emp.periodChange < 0
                            ? 'bg-red-50 text-red-500 ring-red-100'
                            : 'bg-gray-50 text-gray-500 ring-gray-100'
                      }`}>
                        {emp.periodChange > 0 ? (
                          <ArrowUpRight className="h-3 w-3" />
                        ) : emp.periodChange < 0 ? (
                          <ArrowDownRight className="h-3 w-3" />
                        ) : (
                          <Minus className="h-3 w-3" />
                        )}
                        {formatMetricDeltaDisplay(metricId, emp.periodChange)}
                      </span>
                    </div>

                    {/* Bottom row: full-width score bar */}
                    <div className="flex items-center gap-2.5 pl-8">
                      <div className="flex-1 relative h-4 overflow-hidden rounded bg-gray-100">
                        <motion.div
                          key={`${emp.name}-${sortBy}-m`}
                          initial={{ width: 0 }}
                          animate={{ width: `${barWidth}%` }}
                          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: idx * 0.015 }}
                          className={`h-full rounded ${
                            isAboveAvg ? 'bg-emerald-400/70' : 'bg-amber-400/70'
                          }`}
                        />
                        <div
                          className="absolute top-0 h-full w-px bg-gray-400/50"
                          style={{ left: `${avgMarker}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold text-gray-700 tabular-nums flex-shrink-0">
                        {formatMetricDisplay(metricId, emp.value)}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
            </AnimatePresence>
          </div>

          {/* Summary footer */}
          <div className="sticky bottom-0 z-10 flex items-center justify-between px-5 py-3 bg-gray-50/90 backdrop-blur-sm border-t border-gray-100">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="text-[10px] font-semibold text-gray-400">Above avg</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-amber-400" />
                <span className="text-[10px] font-semibold text-gray-400">Below avg</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-px w-3 bg-gray-400/50" />
                <span className="text-[10px] font-semibold text-gray-400">Global avg</span>
              </div>
            </div>
            <span className="text-[10px] font-bold text-gray-400">
              {employees.filter(e => e.value >= avg).length}/{employees.length} above average
            </span>
          </div>
        </div>
      </AnalyticsCard>
    </motion.div>
  );
}

function MetricInsightsCard({
  metricId,
  analyticsRange,
}: {
  metricId: string;
  analyticsRange: AnalyticsRangeSelection;
}) {
  const [currentPage, setCurrentPage] = useState(0);
  const [pageDirection, setPageDirection] = useState(0);
  const insights = useMemo(
    () =>
      getMetricInsights(
        metricId,
        analyticsRange,
        INDIVIDUAL_METRICS_ROSTER,
        getBaseMetricValueForEmployee,
        BRANCH_AVERAGES[metricId as keyof typeof BRANCH_AVERAGES] ?? 85,
      ),
    [metricId, analyticsRange],
  );
  const totalPages = Math.max(1, Math.ceil(insights.length / METRIC_INSIGHTS_PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages - 1);
  const pageInsights = useMemo(
    () =>
      insights.slice(
        safeCurrentPage * METRIC_INSIGHTS_PAGE_SIZE,
        (safeCurrentPage + 1) * METRIC_INSIGHTS_PAGE_SIZE,
      ),
    [insights, safeCurrentPage],
  );

  useEffect(() => {
    setCurrentPage(0);
    setPageDirection(0);
  }, [metricId, analyticsRange]);

  return (
    <motion.div custom={4} variants={cardVariants} initial="hidden" animate="visible" className="h-full">
      <AnalyticsCard
        icon={<Eye className="h-4 w-4" />}
        title="Key Insights"
        subtitle={formatInsightsPeriodSubtitle(analyticsRange)}
      >
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <AnimatePresence mode="wait" initial={false} custom={pageDirection}>
              <motion.div
                key={safeCurrentPage}
                custom={pageDirection}
                variants={keyInsightsPageVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="divide-y divide-gray-50 h-full overflow-auto"
              >
                {pageInsights.map((insight, idx) => (
                  <div
                    key={`${safeCurrentPage}-${idx}-${insight.title}`}
                    className="flex flex-col gap-2 p-4 transition-colors hover:bg-gray-50/60"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-0.5 flex-shrink-0 h-8 w-8 rounded-lg flex items-center justify-center ${
                          insight.type === 'warning'
                            ? 'bg-amber-50 text-amber-500'
                            : insight.type === 'success'
                              ? 'bg-emerald-50 text-emerald-500'
                              : 'bg-blue-50 text-blue-500'
                        }`}
                      >
                        {insight.type === 'warning' ? (
                          <AlertTriangle className="h-4 w-4" />
                        ) : insight.type === 'success' ? (
                          <TrendingUp className="h-4 w-4" />
                        ) : (
                          <Activity className="h-4 w-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold leading-none mb-1 ${
                          insight.type === 'warning' ? 'text-amber-700' : insight.type === 'success' ? 'text-emerald-700' : 'text-blue-700'
                        }`}>
                          {insight.title}
                        </p>
                        <p className="text-xs text-gray-500 leading-relaxed">{insight.message}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="px-4 pb-3">
            <CardPagination
              currentPage={safeCurrentPage}
              totalPages={totalPages}
              onPrevious={() => {
                setPageDirection(-1);
                setCurrentPage(p => Math.max(0, p - 1));
              }}
              onNext={() => {
                setPageDirection(1);
                setCurrentPage(p => Math.min(totalPages - 1, p + 1));
              }}
            />
          </div>
        </div>
      </AnalyticsCard>
    </motion.div>
  );
}

function MetricDistributionCard({
  metricId,
  analyticsRange,
}: {
  metricId: string;
  analyticsRange: AnalyticsRangeSelection;
}) {
  const metricDistribution = useMemo(
    () =>
      getMetricHeroVsGlobalDistribution(
        metricId,
        analyticsRange,
        INDIVIDUAL_METRICS_ROSTER,
        getBaseMetricValueForEmployee,
        BRANCH_AVERAGES[metricId as keyof typeof BRANCH_AVERAGES] ?? 85,
      ),
    [metricId, analyticsRange],
  );
  const { bins: distributionData, totalEmployees, dominantZone, dominantEmployeeCount, dominantSharePct, dominantBandLabel } =
    metricDistribution;

  return (
    <motion.div custom={5} variants={cardVariants} initial="hidden" animate="visible" className="h-full min-w-0 w-full">
      <AnalyticsCard
        icon={<Users className="h-4 w-4" />}
        title="Score distribution"
        subtitle={`${totalEmployees} employees · vs Global Avg ${METRIC_LABELS[metricId] ?? ''}`}
      >
        <div className="flex flex-col flex-1 gap-4 px-3 py-4 sm:p-5">
          <div className="h-[200px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distributionData} margin={{ top: 4, right: 0, left: -12, bottom: 0 }}>
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

          <div className="grid grid-cols-4 gap-1">
            {distributionData.map(d => {
              const pct = totalEmployees > 0 ? Math.round((d.count / totalEmployees) * 100) : 0;
              return (
                <div key={d.range} className="flex min-w-0 flex-col items-center gap-1">
                  <div className="h-1.5 w-full rounded-full" style={{ background: d.fill }} />
                  <span className="text-[10px] font-bold text-gray-500 tabular-nums">{pct}%</span>
                  <span className="text-[8px] sm:text-[9px] text-gray-400 font-medium text-center leading-tight px-0.5 break-words">{d.range}</span>
                </div>
              );
            })}
          </div>

          <HeroZoneDistributionSummaryPanel
            dominantEmployeeCount={dominantEmployeeCount}
            dominantSharePct={dominantSharePct}
            dominantBandLabel={dominantBandLabel}
            dominantZone={dominantZone}
            trailingAfterBand=" category — the highest concentration."
          />
        </div>
      </AnalyticsCard>
    </motion.div>
  );
}

function MetricTrendCard({
  metricId,
  analyticsRange,
}: {
  metricId: string;
  analyticsRange: AnalyticsRangeSelection;
}) {
  const trendData = useMemo(
    () =>
      getMetricTrendForRange(
        metricId,
        analyticsRange,
        BRANCH_AVERAGES[metricId as keyof typeof BRANCH_AVERAGES] ?? 85,
      ),
    [metricId, analyticsRange],
  );
  const trendTitle = useMemo(() => buildMetricTrendCardTitle(analyticsRange), [analyticsRange]);
  const trendSubtitle = buildMetricTrendCardSubtitle();
  const targetDisplay = trendData[0]?.target ?? 0;
  const trendYPadding = getMetricKind(metricId) === 'likert' ? 0.4 : 5;

  return (
    <motion.div custom={6} variants={cardVariants} initial="hidden" animate="visible" className="h-full min-w-0 w-full">
      <AnalyticsCard
        icon={<Activity className="h-4 w-4" />}
        title={trendTitle}
        subtitle={trendSubtitle}
      >
        <div className="flex items-center gap-3 px-3 sm:px-5 pt-3 pb-2 border-b border-gray-50">
          <div className="flex flex-wrap gap-1.5">
            <div
              className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-200"
              style={{ borderLeft: '3px solid #2563eb' }}
            >
              Global Average
            </div>
            <div
              className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-400 shadow-sm ring-1 ring-inset ring-gray-200"
              style={{ borderLeft: '3px solid #d1d5db' }}
            >
              Target ({formatMetricDisplay(metricId, targetDisplay)})
            </div>
          </div>
        </div>

        <div className="px-2 pb-3 pt-2 sm:p-5 flex-1">
          <div className="h-[240px] sm:h-[280px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendData} margin={{ top: 8, right: 2, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad-metric-trend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#2563eb" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis
                  dataKey="week"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 600 }}
                  dy={8}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#9ca3af', fontSize: 11, fontWeight: 600 }}
                  domain={[
                    (dataMin: number) => Math.max(0, dataMin - trendYPadding),
                    (dataMax: number) => dataMax + trendYPadding,
                  ]}
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
                  formatter={(v, name) => {
                    const num =
                      typeof v === "number"
                        ? v
                        : typeof v === "string"
                          ? Number(v)
                          : NaN;
                    const displayName = name === "value" ? "Score" : "Target";
                    if (!Number.isFinite(num)) {
                      return ["—", displayName];
                    }
                    return [
                      formatRuleMetricValue(metricId, num),
                      displayName,
                    ];
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#grad-metric-trend)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
                <Area
                  type="monotone"
                  dataKey="target"
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

// ─── View Toggle Options ──────────────────────────────────────────────────

type AnalyticsView = 'general' | 'employee' | 'metrics';

const ANALYTICS_VIEW_OPTIONS: ViewOption<AnalyticsView>[] = [
  { id: 'general', label: 'General View', icon: BarChart2 },
  { id: 'employee', label: 'Individual Employee', icon: Users },
  { id: 'metrics', label: 'Individual Metrics', icon: Target },
];

// ─── Metric Select Dropdown (mirrors SingleUserSelect style) ────────────────

const METRIC_ICONS: Record<string, React.ReactNode> = {
  'customer-service': <Users className="h-3.5 w-3.5" />,
  'workplace-relations': <Users className="h-3.5 w-3.5" />,
  'professional-conduct': <Trophy className="h-3.5 w-3.5" />,
  'attendance-rate': <Calendar className="h-3.5 w-3.5" />,
  'punctuality-rate': <Activity className="h-3.5 w-3.5" />,
  'productivity-rate': <TrendingUp className="h-3.5 w-3.5" />,
  'average-order-value': <BarChart2 className="h-3.5 w-3.5" />,
  'uniform-compliance': <Check className="h-3.5 w-3.5" />,
  'hygiene-compliance': <Check className="h-3.5 w-3.5" />,
  'sop-compliance': <Target className="h-3.5 w-3.5" />,
};

function getMetricCategory(id: string): string {
  if (['customer-service', 'workplace-relations', 'professional-conduct'].includes(id)) return 'Core Performance';
  if (['attendance-rate', 'punctuality-rate', 'productivity-rate', 'average-order-value'].includes(id)) return 'Operational';
  return 'Compliance';
}

const METRIC_CATEGORY_COLORS: Record<string, string> = {
  'Core Performance': 'bg-blue-500',
  'Operational': 'bg-violet-500',
  'Compliance': 'bg-emerald-500',
};

function MetricSelect({
  selectedMetricId,
  onSelect,
}: {
  selectedMetricId: string;
  onSelect: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedMetric = METRICS.find(m => m.id === selectedMetricId);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClick);
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const filtered = METRICS.filter(m =>
    m.label.toLowerCase().includes(search.toLowerCase()) ||
    getMetricCategory(m.id).toLowerCase().includes(search.toLowerCase())
  );

  // Group by category
  const grouped = filtered.reduce<Record<string, typeof METRICS>>((acc, m) => {
    const cat = getMetricCategory(m.id);
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(m);
    return acc;
  }, {});

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-left transition-all hover:border-blue-400 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      >
        <div className="flex-shrink-0">
          {selectedMetric ? (
            <div className="h-8 w-8 flex items-center justify-center rounded-full bg-primary-50 text-primary-600">
              {METRIC_ICONS[selectedMetricId] ?? <Target className="h-3.5 w-3.5" />}
            </div>
          ) : (
            <div className="h-8 w-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-400">
              <Target className="h-4 w-4" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {selectedMetric ? (
            <>
              <p className="text-sm font-bold text-gray-800 truncate leading-tight">{selectedMetric.label}</p>
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">{getMetricCategory(selectedMetricId)}</p>
            </>
          ) : (
            <span className="text-sm font-medium text-gray-400">Select a metric...</span>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute z-50 mt-2 w-full min-w-[320px] rounded-2xl border border-gray-100 bg-white p-2 shadow-xl ring-1 ring-black/5"
          >
            {/* Search */}
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus
                type="text"
                placeholder="Search metrics..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border-none bg-gray-50 py-2.5 pl-9 pr-4 text-sm font-medium text-gray-700 placeholder:text-gray-400 focus:bg-white focus:ring-2 focus:ring-blue-500/10"
              />
            </div>

            {/* Grouped list */}
            <div className="max-h-[360px] overflow-y-auto overflow-x-hidden p-1 space-y-3">
              {Object.keys(grouped).length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm font-medium text-gray-400">No metrics found</p>
                </div>
              ) : (
                Object.entries(grouped).map(([category, metrics]) => (
                  <div key={category}>
                    <div className="flex items-center gap-2 px-3 py-1.5">
                      <div className={`h-1.5 w-1.5 rounded-full ${METRIC_CATEGORY_COLORS[category] ?? 'bg-gray-400'}`} />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{category}</span>
                    </div>
                    <div className="space-y-0.5">
                      {metrics.map((metric) => (
                        <button
                          key={metric.id}
                          type="button"
                          onClick={() => {
                            onSelect(metric.id);
                            setIsOpen(false);
                            setSearch('');
                          }}
                          className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-all hover:bg-blue-50/50 ${
                            selectedMetricId === metric.id ? 'bg-blue-50/80' : ''
                          }`}
                        >
                          <div className={`h-8 w-8 flex flex-shrink-0 items-center justify-center rounded-full shadow-sm ${
                            selectedMetricId === metric.id ? 'bg-primary-100 text-primary-600' : 'bg-gray-50 text-gray-500'
                          }`}>
                            {METRIC_ICONS[metric.id] ?? <Target className="h-3.5 w-3.5" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-bold truncate ${selectedMetricId === metric.id ? 'text-blue-700' : 'text-gray-700'}`}>
                              {metric.label}
                            </p>
                          </div>
                          {selectedMetricId === metric.id && (
                            <Check className="h-4 w-4 text-blue-600" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Individual Metrics View Container ──────────────────────────────────────

function MetricsViewContent({
  periodLabel,
  analyticsRange,
}: {
  periodLabel: string;
  analyticsRange: AnalyticsRangeSelection;
}) {
  const [selectedMetric, setSelectedMetric] = useState(METRICS[0].id);
  const { stickyRef: metricsHeaderRef, isStuck: isMetricsHeaderStuck } = useStickyHeaderState(analyticsRange);

  return (
    <div className="space-y-6">
      {/* Metric Selector Bar */}
      <div
        ref={metricsHeaderRef}
        className={`sticky -top-4 sm:-top-6 z-20 -mx-4 sm:-mx-6 rounded-b-xl border-b border-x px-5 py-4 shadow-sm backdrop-blur-xl backdrop-saturate-150 transition-[background-color,border-color,box-shadow] duration-200 ${
          isMetricsHeaderStuck
            ? "border-primary-200/35 bg-primary-50/28 shadow-[0_1px_0_0_rgba(255,255,255,0.35)_inset]"
            : "border-white/30 bg-white/30 shadow-[0_1px_0_0_rgba(255,255,255,0.45)_inset]"
        }`}
      >
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-4 sm:flex-row sm:items-center w-full"
        >
          <div className="w-full sm:w-72">
            <MetricSelect
              selectedMetricId={selectedMetric}
              onSelect={setSelectedMetric}
            />
          </div>
          <motion.div
            key={selectedMetric}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            className="grid grid-cols-3 gap-3 sm:flex sm:items-center sm:gap-6 text-sm border-t border-gray-100 pt-3 sm:border-t-0 sm:pt-0 sm:border-l sm:border-gray-100 sm:pl-6"
          >
            {[
              { label: "Category", value: getMetricCategory(selectedMetric) },
              {
                label: "Type",
                value:
                  getMetricKind(selectedMetric) === "likert"
                    ? "Likert (1-5)"
                    : getMetricKind(selectedMetric) === "monetary"
                      ? "Currency"
                      : selectedMetric.includes("compliance")
                        ? "Pass/Fail"
                        : "Percentage",
              },
              { label: "Period", value: periodLabel },
            ].map((info) => (
              <div key={info.label} className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{info.label}</span>
                <span className="text-xs sm:text-sm font-bold text-gray-700">{info.value}</span>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>

      {/* Row 1: Summary + Top/Bottom + Benchmarks */}
      <div className="grid w-full min-w-0 gap-4 grid-cols-2 lg:grid-cols-4">
        <div className="col-span-2 sm:col-span-1">
          <MetricSummaryCard metricId={selectedMetric} analyticsRange={analyticsRange} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <MetricBenchmarkCard metricId={selectedMetric} analyticsRange={analyticsRange} />
        </div>
        <div className="col-span-2">
          <MetricTopBottomCard metricId={selectedMetric} analyticsRange={analyticsRange} />
        </div>
      </div>

      {/* Row 2: Rankings + Insights */}
      <div className="grid w-full min-w-0 gap-4 lg:grid-cols-10">
        <div className="lg:col-span-7 min-w-0">
          <MetricEmployeeRankingCard metricId={selectedMetric} analyticsRange={analyticsRange} />
        </div>
        <div className="lg:col-span-3">
          <MetricInsightsCard metricId={selectedMetric} analyticsRange={analyticsRange} />
        </div>
      </div>

      {/* Row 3: Trend + Distribution — same horizontal width as other metric rows on mobile */}
      <div className="grid w-full min-w-0 gap-4 lg:grid-cols-3">
        <div className="min-w-0 w-full lg:col-span-2">
          <MetricTrendCard metricId={selectedMetric} analyticsRange={analyticsRange} />
        </div>
        <div className="min-w-0 w-full lg:col-span-1">
          <MetricDistributionCard metricId={selectedMetric} analyticsRange={analyticsRange} />
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface EmployeeAnalyticsPageProps {
  isLoading?: boolean;
}

export function EmployeeAnalyticsPage({ isLoading = false }: EmployeeAnalyticsPageProps) {
  const [activeView, setActiveView] = useState<AnalyticsView>('general');
  const [selectedUser, setSelectedUser] = useState<UserEntry | null>(null);
  const [analyticsRange, setAnalyticsRange] = useState<AnalyticsRangeSelection>(() =>
    createDefaultRangeForGranularity("day"),
  );
  const { stickyRef: employeeHeaderRef, isStuck: isEmployeeHeaderStuck } = useStickyHeaderState(
    activeView,
    activeView === "employee",
  );

  const stats = useMemo(() => {
    if (!selectedUser) return null;
    return getPersonalizedStats(selectedUser.name);
  }, [selectedUser]);

  const analyticsPeriodLabel = useMemo(
    () => getSummaryForSelection(analyticsRange),
    [analyticsRange],
  );

  const generalViewMock = useMemo(
    () =>
      buildGeneralViewMockData(analyticsRange, {
        topPerformers: TOP_PERFORMERS,
        priorityReview: PRIORITY_REVIEW,
      }),
    [analyticsRange],
  );

  const personalEpiSeries = useMemo(() => {
    if (!selectedUser || !stats) return null;
    return buildPersonalEpiSeries(selectedUser.name, analyticsRange, stats.epi, generalViewMock.globalEpiTrend);
  }, [selectedUser, stats, analyticsRange, generalViewMock]);

  const personalRecognition = useMemo(() => {
    if (!selectedUser || !stats) return null;
    return buildPersonalRecognitionValues(selectedUser.name, analyticsRange, stats.awards, stats.violations);
  }, [selectedUser, stats, analyticsRange]);

  const personalRankInfo = useMemo(() => {
    if (!selectedUser) return null;
    const merged = [...generalViewMock.leaderboardTop, ...generalViewMock.leaderboardBottom].sort(
      (a, b) => b.epi - a.epi,
    );
    const idx = merged.findIndex((r) => r.name === selectedUser.name);
    const rank = idx === -1 ? merged.length : idx + 1;
    return { rank, total: merged.length };
  }, [selectedUser, generalViewMock]);

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
              {activeView === 'general' && 'Global Analytics'}
              {activeView === 'employee' && 'Employee Analysis'}
              {activeView === 'metrics' && 'Metrics Analysis'}
            </h1>
          </div>
          <p className="mt-1 hidden text-sm text-gray-500 sm:block">
            {activeView === 'general' && 'Workforce performance metrics, trends, and intelligence.'}
            {activeView === 'employee' && 'Deep dive into specific employee performance and growth.'}
            {activeView === 'metrics' && 'Detailed breakdown of specific organizational performance indicators.'}
          </p>
        </div>

        <AnalyticsRangePicker
          value={analyticsRange}
          onChange={setAnalyticsRange}
          className="shrink-0 self-center"
        />
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
                  <GlobalEpiCard
                    globalEpi={generalViewMock.globalEpi}
                    globalEpiDelta={generalViewMock.globalEpiDelta}
                    globalEpiTrend={generalViewMock.globalEpiTrend}
                    comparisonCaption={generalViewMock.comparisonCaption}
                    trendFooter={generalViewMock.trendFooter}
                  />
                </div>
                {/* Recognition: full-width on mobile, 1 col on lg */}
                <div className="col-span-2 sm:col-span-1">
                  <AwardsViolationsCard
                    recognitionSubtitle={generalViewMock.recognitionSubtitle}
                    awards={generalViewMock.awards}
                    violations={generalViewMock.violations}
                  />
                </div>
                {/* Leaderboard: always full-width on mobile, 2 cols on lg */}
                <div className="col-span-2">
                  <LeaderboardCard
                    topPerformers={generalViewMock.leaderboardTop}
                    priorityReview={generalViewMock.leaderboardBottom}
                  />
                </div>
              </div>

              {/* Trend + Alerts row */}
              <div className="grid gap-4 lg:grid-cols-10">
                <div className="lg:col-span-7 min-w-0">
                  <TrendAnalyticsCard
                    analyticsRange={analyticsRange}
                    comparisonSubtitle={generalViewMock.trendComparisonSubtitle}
                  />
                </div>
                <div className="lg:col-span-3">
                  <GeneralKeyInsightsCard
                    analyticsRange={analyticsRange}
                    globalEpiCurrent={
                      generalViewMock.globalEpiTrend[generalViewMock.globalEpiTrend.length - 1]?.epi ??
                      generalViewMock.globalEpi
                    }
                    globalEpiPrevious={
                      generalViewMock.globalEpiTrend[0]?.epi ??
                      generalViewMock.globalEpi
                    }
                    employeeEpi={[...generalViewMock.leaderboardTop, ...generalViewMock.leaderboardBottom]}
                  />
                </div>
              </div>

              {/* Radar + Distribution row */}
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="lg:col-span-1">
                  <PerformanceRadarCard analyticsRange={analyticsRange} />
                </div>
                <div className="lg:col-span-2">
                  <MetricsDistributionCard
                    distributionData={generalViewMock.distribution}
                    distributionDominantEmployeeCount={generalViewMock.distributionDominantEmployeeCount}
                    distributionDominantSharePct={generalViewMock.distributionDominantSharePct}
                    distributionDominantBandLabel={generalViewMock.distributionDominantBandLabel}
                    distributionSummaryDominantZone={generalViewMock.distributionSummaryDominantZone}
                  />
                </div>
              </div>
            </div>
          )}

          {activeView === 'employee' && (
            <div className="space-y-6">
              {/* Employee Selector Bar */}
              <div
                ref={employeeHeaderRef}
                className={`sticky -top-4 sm:-top-6 z-20 -mx-4 sm:-mx-6 rounded-b-xl border-b border-x px-5 py-4 shadow-sm backdrop-blur-xl backdrop-saturate-150 transition-[background-color,border-color,box-shadow] duration-200 ${
                  isEmployeeHeaderStuck
                    ? "border-primary-200/35 bg-primary-50/28 shadow-[0_1px_0_0_rgba(255,255,255,0.35)_inset]"
                    : "border-white/30 bg-white/30 shadow-[0_1px_0_0_rgba(255,255,255,0.45)_inset]"
                }`}
              >
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col gap-4 sm:flex-row sm:items-center w-full"
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
                      className="grid grid-cols-3 gap-3 sm:flex sm:items-center sm:gap-6 text-sm border-t border-gray-100 pt-3 sm:border-t-0 sm:pt-0 sm:border-l sm:border-gray-100 sm:pl-6"
                    >
                      {[
                        { label: "Department", value: "Operations" },
                        { label: "Branch", value: "Manila North" },
                        { label: "Tenure", value: "2.4 Years" },
                      ].map((info) => (
                        <div key={info.label} className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{info.label}</span>
                          <span className="text-xs sm:text-sm font-bold text-gray-700">{info.value}</span>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </motion.div>
              </div>

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
              ) : stats &&
                personalEpiSeries &&
                personalRecognition &&
                personalRankInfo ? (
                <div className="space-y-6">
                  {/* Row 1: EPI + Global Ranking + Recognition */}
                  <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                    <div className="col-span-2 sm:col-span-1">
                      <PersonalEpiCard
                        displayEpi={personalEpiSeries.displayEpi}
                        epiDelta={personalEpiSeries.epiDelta}
                        comparisonCaption={personalEpiSeries.comparisonCaption}
                        trendFooter={personalEpiSeries.trendFooter}
                        globalAvgDisplay={personalEpiSeries.globalAvgDisplay}
                        chartData={personalEpiSeries.chartData}
                      />
                    </div>
                    <div className="col-span-2">
                      <PersonalRankingCard
                        rank={personalRankInfo.rank}
                        totalPeers={personalRankInfo.total}
                        displayEpi={personalEpiSeries.displayEpi}
                        globalEpi={generalViewMock.globalEpi}
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <PersonalRecognitionCard
                        recognitionSubtitle={generalViewMock.recognitionSubtitle}
                        awards={personalRecognition.awards}
                        violations={personalRecognition.violations}
                      />
                    </div>
                  </div>

                  {/* Row 2: Trend + Insights (mirrors General View trend + alerts) */}
                  <div className="grid gap-4 lg:grid-cols-10">
                    <div className="lg:col-span-7 min-w-0">
                      <PersonalTrendCard userName={selectedUser.name} analyticsRange={analyticsRange} />
                    </div>
                    <div className="lg:col-span-3">
                      <PersonalInsightsCard analyticsRange={analyticsRange} userName={selectedUser.name} />
                    </div>
                  </div>

                  {/* Row 3: Radar + Metrics Breakdown (mirrors General View radar + distribution) */}
                  <div className="grid gap-4 lg:grid-cols-3">
                    <div className="lg:col-span-1">
                      <PersonalRadarCard userName={selectedUser.name} analyticsRange={analyticsRange} />
                    </div>
                    <div className="lg:col-span-2">
                      <PersonalMetricsBreakdownCard
                        stats={stats}
                        analyticsRange={analyticsRange}
                        userName={selectedUser.name}
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {activeView === 'metrics' && (
            <MetricsViewContent periodLabel={analyticsPeriodLabel} analyticsRange={analyticsRange} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
