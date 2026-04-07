# Product Analytics Page — Design Spec

**Date:** 2026-04-07  
**Status:** Approved  
**Author:** Henry

---

## Context

The analytics section already has Employee Analytics, POS Analytics, and Profitability Analytics. This page adds product-level visibility: which products sell, which are slow-moving, what they cost, and how margins are trending. All data is mock for now; the page will be wired to real Odoo POS order line + product cost data in a future iteration.

---

## File Locations

| File | Path |
|------|------|
| New page | `apps/web/src/features/product-analytics/pages/ProductAnalyticsPage.tsx` |
| Sidebar | `apps/web/src/features/dashboard/components/Sidebar.tsx` |
| Router | `apps/web/src/app/router.tsx` |
| Permissions | `packages/shared/src/constants/permissions.ts` |
| BranchSelector | `apps/web/src/shared/components/BranchSelector.tsx` |
| AnalyticsRangePicker | `apps/web/src/features/employee-analytics/components/AnalyticsRangePicker.tsx` |
| PosAnalyticsPage (reference) | `apps/web/src/features/pos-analytics/pages/PosAnalyticsPage.tsx` |
| ProfitabilityAnalyticsPage (reference) | `apps/web/src/features/profitability-analytics/pages/ProfitabilityAnalyticsPage.tsx` |

---

## Sidebar & Routing

- Add `ANALYTICS_VIEW_PRODUCT_ANALYTICS: 'analytics.view_product_analytics'` to permissions constants
- Add nav link in Sidebar below "POS Analytics" entry, guarded by this permission
- Add route `product-analytics` in router.tsx wrapped in `PermissionGuard`
- Icon: `ShoppingBag` from lucide-react

---

## Component Patterns to Reuse

All of the following are defined inline (not shared) in the existing analytics pages — copy the same pattern:

| Pattern | Source |
|---------|--------|
| `AnalyticsCard` wrapper | `PosAnalyticsPage.tsx` lines 207–232 |
| `KpiCard` with delta | `ProfitabilityAnalyticsPage.tsx` |
| `SelectedBranchesStrip` | `PosAnalyticsPage.tsx` lines 276–328 |
| `KPI_COLOR_MAP` | `ProfitabilityAnalyticsPage.tsx` |
| Loading skeleton state | `PosAnalyticsPage.tsx` — "Loading POS analytics data..." pattern |
| `VIEW_OPTIONS` / `ViewToggle` tab strip | `PosAnalyticsPage.tsx` |
| `useBranchStore` | `@/shared/store/branchStore` |
| `usePersistedAnalyticsRange` | from `AnalyticsRangePicker` |
| `getSummaryForSelection` | from `AnalyticsRangePicker` |

Charts: use **Recharts** (already a dependency). Import `BarChart`, `LineChart`, `PieChart`, `ResponsiveContainer`, `Tooltip`, `Legend`, `Cell`, etc.

---

## Page Architecture

```
ProductAnalyticsPage
├── Page Header (never re-renders on tab/range change)
│   ├── Title + Subtitle
│   └── AnalyticsRangePicker (Daily/Weekly/Monthly only — no Year)
├── SelectedBranchesStrip
├── KPI Cards Row (5 cards — outside tab content, stable)
├── ViewToggle tab strip [Chart View | Table View | Costing Analysis]
└── Tab Content (only this re-renders on tab switch)
    ├── ChartViewTab
    ├── TableViewTab
    └── CostingTab
```

**Important:** The header, SelectedBranchesStrip, and KPI cards are rendered **outside** the tab content area. Tab switching only swaps the content below the ViewToggle strip. Range picker and branch selector changes update the mock data state but do not unmount/remount header components.

---

## Mock Data

Define a top-level `MOCK_PRODUCTS` array with ~10–12 products. Each product has:

```typescript
type MockProduct = {
  id: string;
  name: string;
  revenue: number;          // current period
  prevRevenue: number;      // prior period
  qtySold: number;
  costPerUnit: number;
  prevCostPerUnit: number;
  // derived fields computed from above
};
```

Derive all computed fields (grossProfit, margin, growthRate, costChange, rank, contribution, classification) at render time from this base data — do not store derived fields in mock data.

Simulate a loading state with `useState(true)` and `useEffect` that sets it to `false` after a 600ms delay (matches the feel of a real fetch).

---

## KPI Cards (5 cards)

Responsive row: 5-col on desktop (`grid-cols-5`), 2-col on mobile (`grid-cols-2`), with last card centered if odd.

| # | Label | Value | Color |
|---|-------|-------|-------|
| 1 | Total Product Sales | Sum of all revenue | `blue` |
| 2 | Total Qty Sold | Sum of all qtySold | `emerald` |
| 3 | Top Product | Name of highest-revenue product | `amber` |
| 4 | Gross Profit | Total Sales − Total Cost | `emerald` if positive, `rose` if negative |
| 5 | Gross Margin % | (Gross Profit ÷ Total Sales) × 100 | `emerald` if ≥ 20%, `rose` if < 0%, `amber` otherwise |

---

## Chart View Tab

Asymmetric grid layout — sections have intentionally different widths:

### Row 1: Best Sellers (60% / 40% split)
Two `AnalyticsCard` panels side by side:
- **Left (60%)** — "Best Sellers by Revenue" — horizontal `BarChart`, top 8 products ranked by revenue
- **Right (40%)** — "Best Sellers by Quantity Sold" — horizontal `BarChart`, top 8 products ranked by qtySold

### Row 2: Top Products (65% / 35% split)
- **Left (65%)** — "Top Performing Products" — vertical `BarChart` with two bars per product (Revenue + Qty Sold, dual Y-axis)
- **Right (35%)** — "Sales Contribution" — `PieChart` / donut showing each product's % share of total revenue

### Row 3: Slow-Moving Products (full width)
- `AnalyticsCard` full width — ranked table/list of bottom 5 products by revenue
- Columns: Rank, Product Name, Revenue, Qty Sold, Margin %
- Apply `rose` row tinting for products with margin < 5%

### Row 4: Product Sales Trend (full width)
- `AnalyticsCard` full width — multi-line `LineChart`, one line per product
- X-axis: time periods per selected granularity (Daily/Weekly/Monthly)
- Product selector: checkbox or multi-select pill group above the chart to toggle which product lines are shown (default: top 5 by revenue)
- Trend direction indicator per product: small ↑↓ badge next to legend label

### Row 5: Product Growth (60% / 40% split)
- **Left (60%)** — "Growth Rate by Product" — vertical grouped `BarChart`
  - Two bar groups per product: Current Period vs Previous Period revenue
  - Color code bars: green if current > previous, red if current < previous
- **Right (40%)** — "Growth Summary" — small summary card
  - List top 3 fastest-growing and top 3 fastest-declining products
  - Show growth % with ↑↓ colored indicators

---

## Table View Tab

Full sortable table. Default sort: by Product Sales descending.

| # | Column | Format | Conditional |
|---|--------|--------|-------------|
| 1 | Product Name | Text | — |
| 2 | Product Sales (Revenue) | Currency | — |
| 3 | Quantity Sold | Number | — |
| 4 | Product Ranking | #1, #2… | — |
| 5 | Sales Contribution (%) | % | — |
| 6 | Growth Rate (%) | % | Green if positive, red if negative, ↑↓ arrow |
| 7 | Cost per Unit | Currency | — |
| 8 | Total Cost | Currency | — |
| 9 | Gross Profit | Currency | Green if positive, red if negative |
| 10 | Gross Margin (%) | % | Green ≥ 20%, amber 5–19%, red < 5% |
| 11 | Cost Change | Currency | Green if ↓, red if ↑, with arrow |
| 12 | Cost Change % | % | Green if ↓, red if ↑ |
| 13 | Classification | Badge | See classification table below |

**Classification logic:**

Priority order — apply the first matching rule per product:

| Badge | Label | Criteria |
|-------|-------|----------|
| ⚠️ | Cost Risk | `costChange > 0` (cost increased vs prior period) — checked first, takes priority |
| 🟢 | High Profit | Rank ≤ N/2 (top half by revenue) AND margin ≥ 20% |
| 💰 | Volume Driver | Rank ≤ N/2 (top half by revenue) AND margin < 20% |
| ❌ | Low Performer | Rank > N/2 (bottom half by revenue) AND margin < 5% |

If none of the above match (bottom half, margin ≥ 5%, no cost increase), show no badge. N = total product count.

Sorting: clicking column header toggles asc/desc. Show sort indicator (chevron) on active column.

---

## Costing Analysis Tab

Four independent `AnalyticsCard` sections, asymmetric layout:

### Row 1: Product Cost Overview (full width)
Table per product:
- Columns: Product Name, Cost per Unit, Total Cost, Gross Profit, Gross Margin %
- Color-code Gross Margin % same thresholds as Table View

### Row 2: Cost Change Analysis (60% / 40% split)
- **Left (60%)** — `BarChart` — products on X-axis, bar height = absolute cost change
  - Green bars for cost decrease, red bars for cost increase
- **Right (40%)** — Summary card
  - "Highest cost increase": product name + Δ amount
  - "Highest cost decrease": product name + Δ amount
  - "Avg cost change across all products": Δ %

### Row 3: Cost Trend per Product (full width)
- Multi-line `LineChart` — one line per product tracking `costPerUnit` over time periods
- Same product selector pill group as Sales Trend chart (top 5 default)
- Annotate any period where cost changed with a dot marker

### Row 4: Margin Impact Analysis (50% / 50% split)
- **Left (50%)** — `BarChart` — Gross Profit per product
- **Right (50%)** — `BarChart` — Gross Margin % per product
- Both charts include a small inline indicator per bar: "Cost ↑ → Margin ↓" or "Cost ↓ → Margin ↑" where cost changed vs prior period

---

## Loading State

Copy the loading pattern from `PosAnalyticsPage`:
- `isLoading` state, set to `true` initially, resolved after 600ms `useEffect`
- While loading: render a centered loading indicator with text "Loading product analytics data..."
- Skeleton cards for KPI row (5 grey placeholder boxes, same dimensions as real cards)
- Tab content area shows a single grey skeleton block while loading

---

## AnalyticsRangePicker Configuration

The `AnalyticsRangePicker` component supports a `granularities` prop (or equivalent) to restrict available options. Check the component's actual prop API and pass only `['day', 'week', 'month']` — excluding `'year'`. Verify the exact prop name from the component source before implementing.

---

## Verification

1. Navigate to `/product-analytics` — page renders with correct title and description
2. `BranchSelector` dropdown opens and selecting branches updates `SelectedBranchesStrip` without reloading the page header
3. `AnalyticsRangePicker` shows only Daily / Weekly / Monthly tabs — Year tab is absent
4. Switching tabs (Chart View → Table View → Costing Analysis) swaps content only; KPI cards and header remain stable
5. Table View: clicking each column header sorts ascending then descending; sort indicator updates
6. Classification badges appear on every row in the table
7. Chart View Row 5 (Product Growth): bars are green for positive growth, red for negative
8. Costing Tab Row 2: cost change bars are green for decrease, red for increase
9. Loading state appears for ~600ms on initial render, then resolves to content
10. Sidebar shows "Product Analytics" link below "POS Analytics" and is permission-guarded
