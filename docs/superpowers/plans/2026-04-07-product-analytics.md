# Product Analytics Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully functional `ProductAnalyticsPage` with mock data, three tab views (Chart / Table / Costing), KPI cards, asymmetric chart layouts, a sortable product table, and integrate it into the sidebar and router with a new permission.

**Architecture:** Single-file page component at `apps/web/src/features/product-analytics/pages/ProductAnalyticsPage.tsx` following the exact same inline-component pattern as `PosAnalyticsPage`. Header/KPIs rendered outside tab content so they remain stable across tab switches and range changes. Three tab views swap in/out below the `ViewToggle` strip.

**Tech Stack:** React 18, TypeScript, Recharts, Framer Motion, Tailwind CSS, `@tanstack/react-query` (not used here — mock data only), `useBranchStore`, `AnalyticsRangePicker`, `ViewToggle`.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| **Modify** | `packages/shared/src/constants/permissions.ts` | Add `ANALYTICS_VIEW_PRODUCT_ANALYTICS` permission key, category entry, description |
| **Modify** | `apps/web/src/features/dashboard/components/Sidebar.tsx` | Add "Product Analytics" nav link below POS Analytics |
| **Modify** | `apps/web/src/app/router.tsx` | Add `product-analytics` route with `PermissionGuard` |
| **Create** | `apps/web/src/features/product-analytics/pages/ProductAnalyticsPage.tsx` | Full page component |

---

## Task 1: Add Permission Constant

**Files:**
- Modify: `packages/shared/src/constants/permissions.ts`

- [ ] **Step 1: Add permission key**

In `packages/shared/src/constants/permissions.ts`, find the `// Analytics (3)` comment block (line 66–69) and update it:

```typescript
  // Analytics (4)
  ANALYTICS_VIEW_EMPLOYEE_ANALYTICS: 'analytics.view_employee_analytics',
  ANALYTICS_VIEW_PROFITABILITY_ANALYTICS: 'analytics.view_profitability_analytics',
  ANALYTICS_VIEW_POS_ANALYTICS: 'analytics.view_pos_analytics',
  ANALYTICS_VIEW_PRODUCT_ANALYTICS: 'analytics.view_product_analytics',
```

- [ ] **Step 2: Add to PERMISSION_CATEGORIES**

Find the `analytics` entry in `PERMISSION_CATEGORIES` (around line 176–183) and add the new permission:

```typescript
  analytics: {
    label: 'Analytics',
    permissions: [
      PERMISSIONS.ANALYTICS_VIEW_EMPLOYEE_ANALYTICS,
      PERMISSIONS.ANALYTICS_VIEW_PROFITABILITY_ANALYTICS,
      PERMISSIONS.ANALYTICS_VIEW_POS_ANALYTICS,
      PERMISSIONS.ANALYTICS_VIEW_PRODUCT_ANALYTICS,
    ],
  },
```

- [ ] **Step 3: Add to PERMISSION_DESCRIPTIONS**

Find the analytics section in `PERMISSION_DESCRIPTIONS` (around line 250–252) and add after the POS Analytics entry:

```typescript
  [PERMISSIONS.ANALYTICS_VIEW_PRODUCT_ANALYTICS]: 'Access the Product Analytics page and view product-level sales and costing metrics',
```

- [ ] **Step 4: Commit**

```bash
cd e:/Github/omnilert-website
rtk git add packages/shared/src/constants/permissions.ts
rtk git commit -m "feat: add ANALYTICS_VIEW_PRODUCT_ANALYTICS permission"
```

---

## Task 2: Add Sidebar Link

**Files:**
- Modify: `apps/web/src/features/dashboard/components/Sidebar.tsx`

- [ ] **Step 1: Import ShoppingBag icon**

In `Sidebar.tsx`, find the lucide-react import block (line 4–26) and add `ShoppingBag` to the list:

```typescript
import {
  LayoutDashboard,
  User,
  ShieldCheck,
  Monitor,
  Calendar,
  Users,
  Building2,
  Shield,
  LogOut,
  FileText,
  DollarSign,
  ClipboardCheck,
  ChevronDown,
  Bell,
  IdCard,
  Settings,
  Receipt,
  ClipboardList,
  TriangleAlert,
  FileWarning,
  BarChart2,
  ShoppingBag,
} from 'lucide-react';
```

- [ ] **Step 2: Add Product Analytics to the hasAnyPermission guard**

Find the `hasAnyPermission(` call for the Analytics section (line 190–194) and add the new permission:

```typescript
        {hasAnyPermission(
          PERMISSIONS.ANALYTICS_VIEW_EMPLOYEE_ANALYTICS,
          PERMISSIONS.ANALYTICS_VIEW_PROFITABILITY_ANALYTICS,
          PERMISSIONS.ANALYTICS_VIEW_POS_ANALYTICS,
          PERMISSIONS.ANALYTICS_VIEW_PRODUCT_ANALYTICS,
        ) && (
```

- [ ] **Step 3: Add nav link below Profitability Analytics**

Find the Profitability Analytics nav link block and add the Product Analytics link immediately after it:

```typescript
            {hasPermission(PERMISSIONS.ANALYTICS_VIEW_PROFITABILITY_ANALYTICS) && (
              <AnimatedNavLink to="/profitability-analytics" className={linkClass}>
                <DollarSign className="h-5 w-5" />
                Profitability Analytics
              </AnimatedNavLink>
            )}
            {hasPermission(PERMISSIONS.ANALYTICS_VIEW_PRODUCT_ANALYTICS) && (
              <AnimatedNavLink to="/product-analytics" className={linkClass}>
                <ShoppingBag className="h-5 w-5" />
                Product Analytics
              </AnimatedNavLink>
            )}
```

- [ ] **Step 4: Commit**

```bash
rtk git add apps/web/src/features/dashboard/components/Sidebar.tsx
rtk git commit -m "feat: add Product Analytics sidebar link"
```

---

## Task 3: Add Route

**Files:**
- Modify: `apps/web/src/app/router.tsx`

- [ ] **Step 1: Add import for ProductAnalyticsPage**

Find the existing analytics page imports (around lines 30–32) and add:

```typescript
import { EmployeeAnalyticsPage } from '@/features/employee-analytics/pages/EmployeeAnalyticsPage';
import { ProfitabilityAnalyticsPage } from '@/features/profitability-analytics/pages/ProfitabilityAnalyticsPage';
import { PosAnalyticsPage } from '@/features/pos-analytics/pages/PosAnalyticsPage';
import { ProductAnalyticsPage } from '@/features/product-analytics/pages/ProductAnalyticsPage';
```

- [ ] **Step 2: Add route entry**

Find the `pos-analytics` route block (lines 184–190) and add the product analytics route immediately after it:

```typescript
          {
            path: 'pos-analytics',
            element: (
              <PermissionGuard permission={PERMISSIONS.ANALYTICS_VIEW_POS_ANALYTICS}>
                <PosAnalyticsPage />
              </PermissionGuard>
            ),
          },
          {
            path: 'product-analytics',
            element: (
              <PermissionGuard permission={PERMISSIONS.ANALYTICS_VIEW_PRODUCT_ANALYTICS}>
                <ProductAnalyticsPage />
              </PermissionGuard>
            ),
          },
```

- [ ] **Step 3: Commit**

```bash
rtk git add apps/web/src/app/router.tsx
rtk git commit -m "feat: add /product-analytics route"
```

---

## Task 4: Create ProductAnalyticsPage — Scaffold, Types, Mock Data, Utilities

**Files:**
- Create: `apps/web/src/features/product-analytics/pages/ProductAnalyticsPage.tsx`

- [ ] **Step 1: Create the file with imports, types, constants, and mock data**

Create `apps/web/src/features/product-analytics/pages/ProductAnalyticsPage.tsx` with the following content:

```typescript
import { useEffect, useMemo, useState, useSyncExternalStore, type ElementType, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  GitBranch,
  Minus,
  Package,
  ShoppingBag,
  TableProperties,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Hash,
  Star,
  PieChartIcon,
  Wallet,
  AlertTriangle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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

/* ─── Types ─────────────────────────────────────────────────────────────── */

type ProductView = 'chart' | 'table' | 'costing';
type KpiColor = 'blue' | 'emerald' | 'rose' | 'amber';
type SortKey = 'name' | 'revenue' | 'qtySold' | 'rank' | 'contribution' | 'growthRate' | 'costPerUnit' | 'totalCost' | 'grossProfit' | 'margin' | 'costChange' | 'costChangePct';
type SortDir = 'asc' | 'desc';

type MockProduct = {
  id: string;
  name: string;
  revenue: number;
  prevRevenue: number;
  qtySold: number;
  costPerUnit: number;
  prevCostPerUnit: number;
};

type DerivedProduct = MockProduct & {
  totalCost: number;
  grossProfit: number;
  margin: number;
  growthRate: number;
  costChange: number;
  costChangePct: number;
  rank: number;
  contribution: number;
  classification: Classification | null;
};

type Classification = 'high_profit' | 'volume_driver' | 'cost_risk' | 'low_performer';

/* ─── Constants ──────────────────────────────────────────────────────────── */

const VIEW_OPTIONS: ViewOption<ProductView>[] = [
  { id: 'chart', label: 'Chart View', icon: BarChart3 },
  { id: 'table', label: 'Table View', icon: TableProperties },
  { id: 'costing', label: 'Costing Analysis', icon: DollarSign },
];

const KPI_COLOR_MAP: Record<KpiColor, { bg: string; text: string; icon: string }> = {
  blue: { bg: 'bg-primary-50', text: 'text-primary-600', icon: 'text-primary-500' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', icon: 'text-emerald-500' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-600', icon: 'text-rose-500' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600', icon: 'text-amber-500' },
};

const PIE_COLORS = [
  '#2563eb', '#059669', '#f59e0b', '#e11d48',
  '#7c3aed', '#0891b2', '#65a30d', '#c2410c',
  '#db2777', '#ea580c', '#16a34a', '#4f46e5',
];

const MOCK_PRODUCTS: MockProduct[] = [
  { id: '1', name: 'Yum Burger',          revenue: 248000, prevRevenue: 210000, qtySold: 3200, costPerUnit: 42,  prevCostPerUnit: 38  },
  { id: '2', name: 'Crispy Fries (L)',    revenue: 187500, prevRevenue: 195000, qtySold: 6250, costPerUnit: 18,  prevCostPerUnit: 18  },
  { id: '3', name: 'Chicken Sandwich',    revenue: 163200, prevRevenue: 140000, qtySold: 2040, costPerUnit: 55,  prevCostPerUnit: 50  },
  { id: '4', name: 'Iced Coffee',         revenue: 142000, prevRevenue: 138000, qtySold: 4733, costPerUnit: 22,  prevCostPerUnit: 20  },
  { id: '5', name: 'Value Meal A',        revenue: 128400, prevRevenue: 115000, qtySold: 1605, costPerUnit: 68,  prevCostPerUnit: 65  },
  { id: '6', name: 'Banana Shake',        revenue: 96000,  prevRevenue: 88000,  qtySold: 3200, costPerUnit: 19,  prevCostPerUnit: 22  },
  { id: '7', name: 'Spicy Wings (6pc)',   revenue: 84000,  prevRevenue: 91000,  qtySold: 840,  costPerUnit: 72,  prevCostPerUnit: 68  },
  { id: '8', name: 'Onion Rings',         revenue: 72000,  prevRevenue: 65000,  qtySold: 3600, costPerUnit: 12,  prevCostPerUnit: 14  },
  { id: '9', name: 'Bottled Water',       revenue: 31200,  prevRevenue: 34000,  qtySold: 5200, costPerUnit: 4,   prevCostPerUnit: 4   },
  { id: '10', name: 'Sundae Cup',         revenue: 27500,  prevRevenue: 20000,  qtySold: 1375, costPerUnit: 11,  prevCostPerUnit: 9   },
  { id: '11', name: 'Kids Meal',          revenue: 22400,  prevRevenue: 26000,  qtySold: 320,  costPerUnit: 52,  prevCostPerUnit: 52  },
  { id: '12', name: 'Seasonal Promo Set', revenue: 15600,  prevRevenue: 0,      qtySold: 195,  costPerUnit: 58,  prevCostPerUnit: 0   },
];

/* ─── Mock time-series data (12 periods) ─────────────────────────────────── */

const TREND_PERIODS = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'];

function buildTrendData(products: MockProduct[]) {
  const multipliers = [0.72, 0.85, 0.91, 0.96, 0.99, 1.0];
  return TREND_PERIODS.map((period, i) => {
    const point: Record<string, number | string> = { period };
    for (const p of products) {
      point[p.id] = Math.round(p.revenue * multipliers[i]);
    }
    return point;
  });
}

function buildCostTrendData(products: MockProduct[]) {
  const costMultipliers = [0.88, 0.90, 0.93, 0.96, 0.99, 1.0];
  return TREND_PERIODS.map((period, i) => {
    const point: Record<string, number | string> = { period };
    for (const p of products) {
      point[p.id] = +(p.costPerUnit * costMultipliers[i]).toFixed(2);
    }
    return point;
  });
}

/* ─── Derived data helpers ────────────────────────────────────────────────── */

function deriveProducts(products: MockProduct[]): DerivedProduct[] {
  const totalRevenue = products.reduce((sum, p) => sum + p.revenue, 0);
  const sorted = [...products].sort((a, b) => b.revenue - a.revenue);
  const n = sorted.length;

  return sorted.map((p, idx) => {
    const totalCost = p.costPerUnit * p.qtySold;
    const grossProfit = p.revenue - totalCost;
    const margin = p.revenue > 0 ? (grossProfit / p.revenue) * 100 : 0;
    const growthRate = p.prevRevenue > 0 ? ((p.revenue - p.prevRevenue) / p.prevRevenue) * 100 : 0;
    const costChange = p.costPerUnit - p.prevCostPerUnit;
    const costChangePct = p.prevCostPerUnit > 0 ? (costChange / p.prevCostPerUnit) * 100 : 0;
    const rank = idx + 1;
    const contribution = totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0;
    const isTopHalf = rank <= Math.ceil(n / 2);

    let classification: Classification | null = null;
    if (costChange > 0) {
      classification = 'cost_risk';
    } else if (isTopHalf && margin >= 20) {
      classification = 'high_profit';
    } else if (isTopHalf && margin < 20) {
      classification = 'volume_driver';
    } else if (!isTopHalf && margin < 5) {
      classification = 'low_performer';
    }

    return { ...p, totalCost, grossProfit, margin, growthRate, costChange, costChangePct, rank, contribution, classification };
  });
}

/* ─── Formatters ─────────────────────────────────────────────────────────── */

function formatCurrency(value: number, compact = false): string {
  if (compact) {
    if (Math.abs(value) >= 1_000_000) return `PHP ${(value / 1_000_000).toFixed(2)}M`;
    if (Math.abs(value) >= 1_000) return `PHP ${(value / 1_000).toFixed(1)}K`;
    return `PHP ${value.toLocaleString('en-PH')}`;
  }
  return `PHP ${value.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatPercent(value: number, showSign = true): string {
  const sign = showSign && value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function formatTooltipCurrency(
  value: number | string | ReadonlyArray<string | number> | undefined,
  name: string | number | undefined,
): [string, string] {
  const resolved = Array.isArray(value) ? value[0] : value;
  const n = typeof resolved === 'number' ? resolved : Number(resolved ?? 0);
  return [formatCurrency(Number.isFinite(n) ? n : 0), String(name ?? '')];
}

const mobileQuery = window.matchMedia('(max-width: 639px)');
function subscribeMobile(cb: () => void) {
  mobileQuery.addEventListener('change', cb);
  return () => mobileQuery.removeEventListener('change', cb);
}
function useIsMobile() {
  return useSyncExternalStore(subscribeMobile, () => mobileQuery.matches, () => false);
}

/* ─── Shared sub-components ──────────────────────────────────────────────── */

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
    const allBranches = companyBranchGroups.flatMap((g) => g.branches);
    return selectedBranchIds
      .map((id) => allBranches.find((b) => b.id === id)?.name)
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
        {shouldCollapse && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-xs font-medium text-gray-500 transition-colors hover:border-primary-200 hover:bg-primary-50 hover:text-primary-600"
          >
            {expanded ? 'Show less' : `+${hiddenCount} more`}
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Classification badge ───────────────────────────────────────────────── */

const CLASSIFICATION_CONFIG: Record<Classification, { label: string; className: string }> = {
  high_profit:    { label: '🟢 High Profit',    className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  volume_driver:  { label: '💰 Volume Driver',  className: 'bg-blue-50 text-blue-700 border-blue-200' },
  cost_risk:      { label: '⚠️ Cost Risk',       className: 'bg-amber-50 text-amber-700 border-amber-200' },
  low_performer:  { label: '❌ Low Performer',   className: 'bg-rose-50 text-rose-700 border-rose-200' },
};

function ClassificationBadge({ classification }: { classification: Classification | null }) {
  if (!classification) return null;
  const cfg = CLASSIFICATION_CONFIG[classification];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

/* ─── Margin color helper ────────────────────────────────────────────────── */

function marginColor(margin: number): string {
  if (margin >= 20) return 'text-emerald-600';
  if (margin >= 5) return 'text-amber-600';
  return 'text-rose-600';
}
```

- [ ] **Step 2: Commit scaffold**

```bash
rtk git add apps/web/src/features/product-analytics/pages/ProductAnalyticsPage.tsx
rtk git commit -m "feat: scaffold ProductAnalyticsPage with types, mock data, and shared sub-components"
```

---

## Task 5: Chart View Tab — Best Sellers & Top Products

**Files:**
- Modify: `apps/web/src/features/product-analytics/pages/ProductAnalyticsPage.tsx`

- [ ] **Step 1: Add BestSellersRow component**

Append the following to the page file (before the export):

```typescript
function BestSellersRow({ products }: { products: DerivedProduct[] }) {
  const isMobile = useIsMobile();
  const byRevenue = [...products].sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  const byQty = [...products].sort((a, b) => b.qtySold - a.qtySold).slice(0, 8);

  const revenueData = byRevenue.map((p) => ({ name: p.name.length > 14 ? p.name.slice(0, 13) + '…' : p.name, value: p.revenue }));
  const qtyData = byQty.map((p) => ({ name: p.name.length > 14 ? p.name.slice(0, 13) + '…' : p.name, value: p.qtySold }));

  const chartH = isMobile ? 220 : 300;

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="lg:col-span-3">
        <AnalyticsCard icon={BarChart3} title="Best Sellers by Revenue" description="Top products ranked by total sales value">
          <div className="px-4 py-4" style={{ height: chartH }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueData} layout="vertical" margin={{ top: 0, right: 16, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => formatCurrency(v, true)} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={formatTooltipCurrency} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Bar dataKey="value" name="Revenue" radius={[0, 4, 4, 0]} fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AnalyticsCard>
      </div>
      <div className="lg:col-span-2">
        <AnalyticsCard icon={Hash} title="Best Sellers by Quantity" description="Top products ranked by units sold">
          <div className="px-4 py-4" style={{ height: chartH }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={qtyData} layout="vertical" margin={{ top: 0, right: 16, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Bar dataKey="value" name="Qty Sold" radius={[0, 4, 4, 0]} fill="#059669" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AnalyticsCard>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add TopProductsRow component**

```typescript
function TopProductsRow({ products }: { products: DerivedProduct[] }) {
  const isMobile = useIsMobile();
  const top8 = products.slice(0, 8);
  const barData = top8.map((p) => ({
    name: p.name.length > 12 ? p.name.slice(0, 11) + '…' : p.name,
    Revenue: p.revenue,
    Qty: p.qtySold,
  }));
  const pieData = top8.map((p) => ({ name: p.name, value: +(p.contribution.toFixed(1)) }));
  const chartH = isMobile ? 200 : 280;

  return (
    <div className="grid gap-4 lg:grid-cols-[65%_35%]" style={{ gridTemplateColumns: undefined }}>
      <div className="lg:col-span-1" style={{ flex: '0 0 65%' }}>
        <AnalyticsCard icon={TrendingUp} title="Top Performing Products" description="Revenue and quantity for top products">
          <div className="px-4 py-4" style={{ height: chartH }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => formatCurrency(v, true)} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={formatTooltipCurrency} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="left" dataKey="Revenue" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="right" dataKey="Qty" fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AnalyticsCard>
      </div>
      <div className="flex-1">
        <AnalyticsCard icon={PieChartIcon} title="Sales Contribution" description="Each product's share of total revenue">
          <div className="flex flex-col items-center px-4 py-4" style={{ height: chartH }}>
            <ResponsiveContainer width="100%" height="75%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius="50%" outerRadius="80%" dataKey="value" paddingAngle={2}>
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, 'Share']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="w-full space-y-1 overflow-y-auto" style={{ maxHeight: '30%' }}>
              {pieData.map((p, i) => (
                <div key={p.name} className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="min-w-0 flex-1 truncate text-xs text-gray-600">{p.name}</span>
                  <span className="text-xs font-medium tabular-nums text-gray-700">{p.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </AnalyticsCard>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
rtk git add apps/web/src/features/product-analytics/pages/ProductAnalyticsPage.tsx
rtk git commit -m "feat: add BestSellersRow and TopProductsRow chart components"
```

---

## Task 6: Chart View Tab — Slow-Moving, Sales Trend, Product Growth

**Files:**
- Modify: `apps/web/src/features/product-analytics/pages/ProductAnalyticsPage.tsx`

- [ ] **Step 1: Add SlowMovingCard component**

```typescript
function SlowMovingCard({ products }: { products: DerivedProduct[] }) {
  const bottom5 = [...products].sort((a, b) => a.revenue - b.revenue).slice(0, 5);

  return (
    <AnalyticsCard icon={AlertTriangle} title="Slow-Moving Products" description="Bottom 5 products by revenue — candidates for review or promotion">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              {['Rank', 'Product', 'Revenue', 'Qty Sold', 'Margin %'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bottom5.map((p, i) => (
              <tr key={p.id} className={`border-b border-gray-50 transition-colors hover:bg-gray-50 ${p.margin < 5 ? 'bg-rose-50/40' : ''}`}>
                <td className="px-4 py-3 text-xs font-bold text-gray-400">#{products.length - i}</td>
                <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                <td className="px-4 py-3 tabular-nums text-gray-700">{formatCurrency(p.revenue, true)}</td>
                <td className="px-4 py-3 tabular-nums text-gray-700">{p.qtySold.toLocaleString('en-PH')}</td>
                <td className={`px-4 py-3 tabular-nums font-semibold ${marginColor(p.margin)}`}>{formatPercent(p.margin, false)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AnalyticsCard>
  );
}
```

- [ ] **Step 2: Add SalesTrendCard component**

```typescript
function SalesTrendCard({ products }: { products: DerivedProduct[] }) {
  const isMobile = useIsMobile();
  const top5 = products.slice(0, 5);
  const [visible, setVisible] = useState<Set<string>>(() => new Set(top5.map((p) => p.id)));
  const trendData = useMemo(() => buildTrendData(products), [products]);

  const toggleProduct = (id: string) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { if (next.size > 1) next.delete(id); }
      else next.add(id);
      return next;
    });
  };

  const LINE_COLORS = ['#2563eb', '#059669', '#f59e0b', '#e11d48', '#7c3aed', '#0891b2', '#65a30d', '#c2410c'];

  return (
    <AnalyticsCard icon={TrendingUp} title="Product Sales Trend" description="Sales value over time per product — select products to compare">
      <div className="px-5 pb-2 pt-3">
        <div className="flex flex-wrap gap-2">
          {top5.map((p, i) => {
            const isVisible = visible.has(p.id);
            const currentLast = trendData[trendData.length - 1]?.[p.id] as number ?? 0;
            const currentFirst = trendData[0]?.[p.id] as number ?? 0;
            const trending = currentLast >= currentFirst;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggleProduct(p.id)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                  isVisible ? 'border-transparent text-white shadow-sm' : 'border-gray-200 bg-white text-gray-500'
                }`}
                style={isVisible ? { backgroundColor: LINE_COLORS[i % LINE_COLORS.length] } : {}}
              >
                {p.name}
                {isVisible && (trending ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />)}
              </button>
            );
          })}
        </div>
      </div>
      <div className="px-4 pb-4 pt-2" style={{ height: isMobile ? 200 : 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trendData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => formatCurrency(v, true)} axisLine={false} tickLine={false} />
            <Tooltip formatter={formatTooltipCurrency} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
            {top5.map((p, i) =>
              visible.has(p.id) ? (
                <Line key={p.id} type="monotone" dataKey={p.id} name={p.name} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2} dot={false} />
              ) : null
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </AnalyticsCard>
  );
}
```

- [ ] **Step 3: Add ProductGrowthRow component**

```typescript
function ProductGrowthRow({ products }: { products: DerivedProduct[] }) {
  const isMobile = useIsMobile();
  const barData = products.map((p) => ({
    name: p.name.length > 12 ? p.name.slice(0, 11) + '…' : p.name,
    Current: p.revenue,
    Previous: p.prevRevenue,
    id: p.id,
  }));

  const sorted = [...products].sort((a, b) => b.growthRate - a.growthRate);
  const top3 = sorted.slice(0, 3);
  const bottom3 = [...sorted].reverse().slice(0, 3);

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="lg:col-span-3">
        <AnalyticsCard icon={TrendingUp} title="Growth Rate by Product" description="Current period vs previous period revenue">
          <div className="px-4 py-4" style={{ height: isMobile ? 200 : 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => formatCurrency(v, true)} axisLine={false} tickLine={false} />
                <Tooltip formatter={formatTooltipCurrency} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Current" name="Current Period" radius={[4, 4, 0, 0]}>
                  {barData.map((entry) => {
                    const product = products.find((p) => p.id === entry.id);
                    return <Cell key={entry.id} fill={product && product.revenue >= product.prevRevenue ? '#059669' : '#e11d48'} />;
                  })}
                </Bar>
                <Bar dataKey="Previous" name="Previous Period" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AnalyticsCard>
      </div>
      <div className="lg:col-span-2">
        <AnalyticsCard icon={TrendingDown} title="Growth Summary" description="Fastest growing and declining products">
          <div className="divide-y divide-gray-50 px-5 py-4">
            <div className="pb-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-600">Top Growing</p>
              <div className="space-y-2">
                {top3.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{p.name}</span>
                    <span className="flex items-center gap-0.5 text-xs font-semibold text-emerald-600">
                      <ArrowUpRight className="h-3 w-3" />
                      {formatPercent(p.growthRate)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-600">Declining</p>
              <div className="space-y-2">
                {bottom3.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{p.name}</span>
                    <span className="flex items-center gap-0.5 text-xs font-semibold text-rose-600">
                      <ArrowDownRight className="h-3 w-3" />
                      {formatPercent(p.growthRate)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </AnalyticsCard>
      </div>
    </div>
  );
}

function ChartViewTab({ products }: { products: DerivedProduct[] }) {
  return (
    <div className="space-y-4">
      <BestSellersRow products={products} />
      <TopProductsRow products={products} />
      <SlowMovingCard products={products} />
      <SalesTrendCard products={products} />
      <ProductGrowthRow products={products} />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
rtk git add apps/web/src/features/product-analytics/pages/ProductAnalyticsPage.tsx
rtk git commit -m "feat: add SlowMovingCard, SalesTrendCard, ProductGrowthRow, ChartViewTab"
```

---

## Task 7: Table View Tab

**Files:**
- Modify: `apps/web/src/features/product-analytics/pages/ProductAnalyticsPage.tsx`

- [ ] **Step 1: Add TableViewTab component**

```typescript
const TABLE_COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: 'rank',          label: 'Rank',                  className: 'w-12' },
  { key: 'name',          label: 'Product',               className: 'min-w-[160px]' },
  { key: 'revenue',       label: 'Sales (Revenue)',        className: 'text-right' },
  { key: 'qtySold',       label: 'Qty Sold',              className: 'text-right' },
  { key: 'contribution',  label: 'Contribution %',        className: 'text-right' },
  { key: 'growthRate',    label: 'Growth %',              className: 'text-right' },
  { key: 'costPerUnit',   label: 'Cost / Unit',           className: 'text-right' },
  { key: 'totalCost',     label: 'Total Cost',            className: 'text-right' },
  { key: 'grossProfit',   label: 'Gross Profit',          className: 'text-right' },
  { key: 'margin',        label: 'Margin %',              className: 'text-right' },
  { key: 'costChange',    label: 'Cost Change',           className: 'text-right' },
  { key: 'costChangePct', label: 'Cost Chg %',            className: 'text-right' },
];

function TableViewTab({ products }: { products: DerivedProduct[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    return [...products].sort((a, b) => {
      const av = a[sortKey] as string | number;
      const bv = b[sortKey] as string | number;
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [products, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (col !== sortKey) return <span className="ml-1 text-gray-300">↕</span>;
    return <span className="ml-1 text-primary-500">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50/50 px-5 py-4">
        <TableProperties className="h-4 w-4 shrink-0 text-gray-400" />
        <div>
          <p className="text-sm font-semibold text-gray-900">Product Performance Table</p>
          <p className="mt-0.5 text-xs text-gray-500">Click column headers to sort. All metrics for the selected period and branches.</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              {TABLE_COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`cursor-pointer select-none px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700 ${col.className ?? ''}`}
                >
                  {col.label}<SortIcon col={col.key} />
                </th>
              ))}
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Classification</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id} className="border-b border-gray-50 transition-colors hover:bg-gray-50">
                <td className="px-4 py-3 text-xs font-bold text-gray-400">#{p.rank}</td>
                <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-700">{formatCurrency(p.revenue, true)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-700">{p.qtySold.toLocaleString('en-PH')}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-700">{p.contribution.toFixed(1)}%</td>
                <td className={`px-4 py-3 text-right tabular-nums font-semibold ${p.growthRate >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {p.growthRate >= 0 ? '↑' : '↓'} {formatPercent(p.growthRate)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-700">{formatCurrency(p.costPerUnit)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-700">{formatCurrency(p.totalCost, true)}</td>
                <td className={`px-4 py-3 text-right tabular-nums font-semibold ${p.grossProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {formatCurrency(p.grossProfit, true)}
                </td>
                <td className={`px-4 py-3 text-right tabular-nums font-semibold ${marginColor(p.margin)}`}>
                  {formatPercent(p.margin, false)}
                </td>
                <td className={`px-4 py-3 text-right tabular-nums font-semibold ${p.costChange > 0 ? 'text-rose-600' : p.costChange < 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                  {p.costChange > 0 ? '↑' : p.costChange < 0 ? '↓' : ''} {formatCurrency(Math.abs(p.costChange))}
                </td>
                <td className={`px-4 py-3 text-right tabular-nums font-semibold ${p.costChangePct > 0 ? 'text-rose-600' : p.costChangePct < 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                  {formatPercent(p.costChangePct)}
                </td>
                <td className="px-4 py-3">
                  <ClassificationBadge classification={p.classification} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
rtk git add apps/web/src/features/product-analytics/pages/ProductAnalyticsPage.tsx
rtk git commit -m "feat: add TableViewTab with sortable columns and classification badges"
```

---

## Task 8: Costing Analysis Tab

**Files:**
- Modify: `apps/web/src/features/product-analytics/pages/ProductAnalyticsPage.tsx`

- [ ] **Step 1: Add CostOverviewCard**

```typescript
function CostOverviewCard({ products }: { products: DerivedProduct[] }) {
  return (
    <AnalyticsCard icon={Wallet} title="Product Cost Overview" description="Cost, profit, and margin per product for the selected period">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              {['Product', 'Cost / Unit', 'Total Cost', 'Gross Profit', 'Margin %'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-gray-50 transition-colors hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                <td className="px-4 py-3 tabular-nums text-gray-700">{formatCurrency(p.costPerUnit)}</td>
                <td className="px-4 py-3 tabular-nums text-gray-700">{formatCurrency(p.totalCost, true)}</td>
                <td className={`px-4 py-3 tabular-nums font-semibold ${p.grossProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {formatCurrency(p.grossProfit, true)}
                </td>
                <td className={`px-4 py-3 tabular-nums font-semibold ${marginColor(p.margin)}`}>
                  {formatPercent(p.margin, false)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AnalyticsCard>
  );
}
```

- [ ] **Step 2: Add CostChangeRow**

```typescript
function CostChangeRow({ products }: { products: DerivedProduct[] }) {
  const isMobile = useIsMobile();
  const barData = products.map((p) => ({
    name: p.name.length > 12 ? p.name.slice(0, 11) + '…' : p.name,
    costChange: p.costChange,
    id: p.id,
  }));

  const maxIncrease = [...products].sort((a, b) => b.costChange - a.costChange)[0];
  const maxDecrease = [...products].sort((a, b) => a.costChange - b.costChange)[0];
  const avgChangePct = products.reduce((s, p) => s + p.costChangePct, 0) / products.length;

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="lg:col-span-3">
        <AnalyticsCard icon={TrendingUp} title="Cost Change Analysis" description="Absolute cost change vs previous period per product">
          <div className="px-4 py-4" style={{ height: isMobile ? 200 : 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => `PHP ${v}`} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), 'Cost Change']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
                <Bar dataKey="costChange" name="Cost Change" radius={[4, 4, 0, 0]}>
                  {barData.map((entry) => (
                    <Cell key={entry.id} fill={entry.costChange > 0 ? '#e11d48' : entry.costChange < 0 ? '#059669' : '#cbd5e1'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AnalyticsCard>
      </div>
      <div className="lg:col-span-2">
        <AnalyticsCard icon={AlertTriangle} title="Cost Change Summary" description="Highlights of cost movement across products">
          <div className="divide-y divide-gray-50 px-5 py-4">
            <div className="pb-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-rose-500">Highest Increase</p>
              <p className="font-medium text-gray-900">{maxIncrease?.name ?? '—'}</p>
              <p className="text-sm text-rose-600">{maxIncrease ? `+${formatCurrency(maxIncrease.costChange)}` : '—'}</p>
            </div>
            <div className="py-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-500">Highest Decrease</p>
              <p className="font-medium text-gray-900">{maxDecrease?.name ?? '—'}</p>
              <p className="text-sm text-emerald-600">{maxDecrease ? `${formatCurrency(maxDecrease.costChange)}` : '—'}</p>
            </div>
            <div className="pt-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Avg Cost Change</p>
              <p className={`text-lg font-bold tabular-nums ${avgChangePct > 0 ? 'text-rose-600' : avgChangePct < 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                {formatPercent(avgChangePct)}
              </p>
            </div>
          </div>
        </AnalyticsCard>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add CostTrendCard**

```typescript
function CostTrendCard({ products }: { products: DerivedProduct[] }) {
  const isMobile = useIsMobile();
  const top5 = products.slice(0, 5);
  const [visible, setVisible] = useState<Set<string>>(() => new Set(top5.map((p) => p.id)));
  const costTrendData = useMemo(() => buildCostTrendData(products), [products]);
  const LINE_COLORS = ['#2563eb', '#059669', '#f59e0b', '#e11d48', '#7c3aed'];

  const toggleProduct = (id: string) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { if (next.size > 1) next.delete(id); }
      else next.add(id);
      return next;
    });
  };

  return (
    <AnalyticsCard icon={TrendingUp} title="Cost Trend per Product" description="Cost per unit movement over time — select products to compare">
      <div className="px-5 pb-2 pt-3">
        <div className="flex flex-wrap gap-2">
          {top5.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => toggleProduct(p.id)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                visible.has(p.id) ? 'border-transparent text-white shadow-sm' : 'border-gray-200 bg-white text-gray-500'
              }`}
              style={visible.has(p.id) ? { backgroundColor: LINE_COLORS[i % LINE_COLORS.length] } : {}}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>
      <div className="px-4 pb-4 pt-2" style={{ height: isMobile ? 200 : 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={costTrendData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => `PHP ${v}`} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v: number) => [formatCurrency(v), 'Cost / Unit']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
            {top5.map((p, i) =>
              visible.has(p.id) ? (
                <Line key={p.id} type="monotone" dataKey={p.id} name={p.name} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2} dot={{ r: 3, fill: LINE_COLORS[i % LINE_COLORS.length] }} />
              ) : null
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </AnalyticsCard>
  );
}
```

- [ ] **Step 4: Add MarginImpactRow**

```typescript
function MarginImpactRow({ products }: { products: DerivedProduct[] }) {
  const isMobile = useIsMobile();
  const barData = products.map((p) => ({
    name: p.name.length > 10 ? p.name.slice(0, 9) + '…' : p.name,
    profit: p.grossProfit,
    margin: +p.margin.toFixed(1),
    costDir: p.costChange > 0 ? 'up' : p.costChange < 0 ? 'down' : 'flat',
  }));

  const CustomBarLabel = ({ x, y, value, costDir }: { x?: number; y?: number; value?: number; costDir?: string }) => {
    if (!costDir || costDir === 'flat') return null;
    const label = costDir === 'up' ? '↑' : '↓';
    const color = costDir === 'up' ? '#e11d48' : '#059669';
    return <text x={(x ?? 0) + 8} y={(y ?? 0) - 4} fill={color} fontSize={10} fontWeight="bold">{label}</text>;
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <AnalyticsCard icon={DollarSign} title="Gross Profit per Product" description="Gross profit — cost ↑ compresses margin, cost ↓ expands it">
        <div className="px-4 py-4" style={{ height: isMobile ? 200 : 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 16, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => formatCurrency(v, true)} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: number) => [formatCurrency(v), 'Gross Profit']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
              <Bar dataKey="profit" name="Gross Profit" radius={[4, 4, 0, 0]}>
                {barData.map((entry, i) => (
                  <Cell key={i} fill={entry.profit >= 0 ? '#2563eb' : '#e11d48'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </AnalyticsCard>
      <AnalyticsCard icon={TrendingUp} title="Gross Margin % per Product" description="Margin percentage — arrows indicate cost direction">
        <div className="px-4 py-4" style={{ height: isMobile ? 200 : 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 16, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, 'Margin']} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
              <Bar dataKey="margin" name="Margin %" radius={[4, 4, 0, 0]} label={<CustomBarLabel />}>
                {barData.map((entry, i) => (
                  <Cell key={i} fill={entry.margin >= 20 ? '#059669' : entry.margin >= 5 ? '#f59e0b' : '#e11d48'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </AnalyticsCard>
    </div>
  );
}

function CostingTab({ products }: { products: DerivedProduct[] }) {
  return (
    <div className="space-y-4">
      <CostOverviewCard products={products} />
      <CostChangeRow products={products} />
      <CostTrendCard products={products} />
      <MarginImpactRow products={products} />
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
rtk git add apps/web/src/features/product-analytics/pages/ProductAnalyticsPage.tsx
rtk git commit -m "feat: add CostOverviewCard, CostChangeRow, CostTrendCard, MarginImpactRow, CostingTab"
```

---

## Task 9: Main Page Export

**Files:**
- Modify: `apps/web/src/features/product-analytics/pages/ProductAnalyticsPage.tsx`

- [ ] **Step 1: Add the main ProductAnalyticsPage export**

```typescript
const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.2, 0, 0, 1] as const, delay },
  }),
};

export function ProductAnalyticsPage() {
  const [view, setView] = useState<ProductView>('chart');
  const [isLoading, setIsLoading] = useState(true);
  const [rangeSelection, setRangeSelection] = usePersistedAnalyticsRange(
    'product-analytics',
    createCurrentMonthToDateRangeSelection,
  );

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 600);
    return () => clearTimeout(timer);
  }, []);

  const derived = useMemo(() => deriveProducts(MOCK_PRODUCTS), []);

  const totalRevenue = derived.reduce((s, p) => s + p.revenue, 0);
  const prevTotalRevenue = MOCK_PRODUCTS.reduce((s, p) => s + p.prevRevenue, 0);
  const totalQty = derived.reduce((s, p) => s + p.qtySold, 0);
  const totalCost = derived.reduce((s, p) => s + p.totalCost, 0);
  const grossProfit = totalRevenue - totalCost;
  const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
  const topProduct = derived[0];
  const revenueDelta = prevTotalRevenue > 0 ? ((totalRevenue - prevTotalRevenue) / prevTotalRevenue) * 100 : 0;

  const rangeSummary = getSummaryForSelection(rangeSelection);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-6">
      {/* ── Page header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="h-5 w-5 text-primary-600" />
            <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Product Analytics</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            Detailed insights into product-level performance, including sales, demand trends, and costing analysis.
          </p>
        </div>
        <div className="shrink-0">
          <AnalyticsRangePicker
            value={rangeSelection}
            onChange={setRangeSelection}
            excludeGranularities={['year']}
          />
        </div>
      </div>

      {/* ── Selected branches strip ── */}
      <SelectedBranchesStrip />

      {/* ── KPI cards — stable, outside tab content ── */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-gray-100 bg-gray-100" />
          ))}
        </div>
      ) : (
        <motion.div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
          initial="hidden"
          animate="visible"
        >
          {[
            {
              icon: ShoppingBag, label: 'Total Product Sales',
              value: formatCurrency(totalRevenue, true),
              deltaPercent: revenueDelta, deltaCaption: 'vs prior', color: 'blue' as KpiColor,
            },
            {
              icon: Hash, label: 'Total Qty Sold',
              value: totalQty.toLocaleString('en-PH'),
              deltaPercent: 0, deltaCaption: 'vs prior', color: 'emerald' as KpiColor,
            },
            {
              icon: Star, label: 'Top Product',
              value: topProduct?.name ?? '—',
              deltaPercent: topProduct?.growthRate ?? 0, deltaCaption: 'growth', color: 'amber' as KpiColor,
            },
            {
              icon: Wallet, label: 'Gross Profit',
              value: formatCurrency(grossProfit, true),
              deltaPercent: 0, deltaCaption: 'vs prior', color: (grossProfit >= 0 ? 'emerald' : 'rose') as KpiColor,
            },
            {
              icon: TrendingUp, label: 'Gross Margin %',
              value: `${grossMargin.toFixed(1)}%`,
              deltaPercent: 0, deltaCaption: 'vs prior',
              color: (grossMargin >= 20 ? 'emerald' : grossMargin < 0 ? 'rose' : 'amber') as KpiColor,
            },
          ].map((kpi, i) => (
            <motion.div key={kpi.label} variants={fadeUp} custom={i * 0.05}>
              <KpiCard {...kpi} />
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* ── View toggle ── */}
      <ViewToggle options={VIEW_OPTIONS} value={view} onChange={setView} />

      {/* ── Tab content ── */}
      {isLoading ? (
        <div className="h-64 animate-pulse rounded-xl border border-gray-100 bg-gray-100">
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-gray-400">Loading product analytics data...</p>
          </div>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {view === 'chart' && <ChartViewTab products={derived} />}
            {view === 'table' && <TableViewTab products={derived} />}
            {view === 'costing' && <CostingTab products={derived} />}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
rtk git add apps/web/src/features/product-analytics/pages/ProductAnalyticsPage.tsx
rtk git commit -m "feat: add ProductAnalyticsPage main export with header, KPIs, tab switching, and loading state"
```

---

## Task 10: Verify End-to-End

- [ ] **Step 1: Run the dev server**

```bash
cd e:/Github/omnilert-website
pnpm dev
```

- [ ] **Step 2: Navigate and verify**

Check each item:
1. Sidebar shows "Product Analytics" link below "POS Analytics"
2. Navigate to `/product-analytics` — page title and subtitle render correctly
3. `AnalyticsRangePicker` shows only Day / Week / Month tabs — no Year tab
4. `SelectedBranchesStrip` shows branch pills and updates when branches are changed
5. KPI cards show 5 cards on desktop, 2-col on mobile
6. Switching between Chart View / Table View / Costing Analysis — only the tab content changes; header and KPI cards do not remount
7. Chart View: Best Sellers charts show horizontal bars; Top Products shows paired bars + donut; Slow-Moving table applies rose background to margin < 5% rows; Sales Trend product selector pills toggle lines; Growth bars are green/red based on current vs previous
8. Table View: clicking each column header toggles sort asc/desc with arrow indicator; Classification badge appears per row
9. Costing Analysis: Cost Change bars are red for increase, green for decrease; Cost Trend product pills toggle lines; Margin Impact bars use green/amber/red by margin threshold
10. Loading skeleton shows for ~600ms then resolves

- [ ] **Step 3: Fix any TypeScript errors**

```bash
cd e:/Github/omnilert-website
rtk tsc --noEmit -p apps/web/tsconfig.json
```

Fix any errors, then:

```bash
rtk git add -A
rtk git commit -m "fix: resolve TypeScript errors in ProductAnalyticsPage"
```
