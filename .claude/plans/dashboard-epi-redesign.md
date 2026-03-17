# Dashboard EPI Redesign — Implementation Plan

## Context

The current dashboard has an inline `PerformanceIndex` component that fetches from API endpoints and displays basic EPI points, an audit ratings table, and a simple leaderboard. This redesign replaces it entirely with a rich, multi-section EPI dashboard using **static mock data** — structured so swapping to real API calls later requires only replacing the mock object.

**No backend changes. No new API endpoints. No migrations. No new npm packages.**

---

## File Structure

```
apps/web/src/features/dashboard/
├── components/epi/
│   ├── types.ts                        # All TypeScript interfaces
│   ├── mockData.ts                     # Mock data + constants (VIOLATION_DEDUCTION, AWARD_BONUS)
│   ├── epiUtils.ts                     # Zone color helpers, shared logic
│   ├── AvatarFallback.tsx              # Initials avatar (from EmployeeShiftsPage pattern)
│   ├── SvgSparkline.tsx                # Hand-rolled SVG sparkline with hover tooltips
│   ├── EpiHeroCard.tsx                 # Score + trend + sparkline
│   ├── PerformanceScoresSection.tsx    # 4 criteria cards
│   ├── OperationalMetricsSection.tsx   # 4 metric cards (rates + AOV)
│   ├── DisciplineRecognitionSection.tsx # Violations + Awards
│   ├── EpiLeaderboard.tsx             # Top 10 + own rank + expandable rows
│   └── EpiDashboard.tsx               # Orchestrator receiving data prop
└── pages/
    └── DashboardPage.tsx               # MODIFIED: remove old PerformanceIndex, wire EpiDashboard
```

All new files go under `components/epi/` to keep the feature self-contained.

---

## Implementation Order

### Step 1: Types (`components/epi/types.ts`)

Define exactly per spec:
- `EpiCriteria` — all score fields (number | null), violationCount, awardCount
- `EpiMonthEntry` — { month, score }
- `EpiDashboardData` — { epiScore, epiDelta, currentMonth, history[], criteria }
- `LeaderboardEntry` — { id, rank, firstName, lastName, avatarUrl, epiScore, isCurrentUser, criteria }

### Step 2: Mock Data (`components/epi/mockData.ts`)

- `VIOLATION_DEDUCTION = 5`, `AWARD_BONUS = 5` constants
- `MOCK_EPI_DATA` with score 108.4, delta +3.2, 6-month history, criteria with 2 null values (workplaceRelationsScore, productivityRate)
- `MOCK_LEADERBOARD` — 10 entries, current user at rank 7, varied scores (124.1 down to 97.3), all `avatarUrl: null`
- Commented-out variant with current user at rank 12 for testing separator

### Step 3: Utility Helpers (`components/epi/epiUtils.ts`)

Centralized zone color logic returning Tailwind class strings:

```ts
getEpiZoneClasses(score: number)     // green >= 100, amber 80-99, red < 80
getScoreZoneClasses(score: number)   // green >= 4, amber >= 3, red < 3
getRateZoneClasses(rate: number)     // green >= 85, amber >= 70, red < 70
getAovZoneClasses(yours: number, branchAvg: number)  // green > 1.05x, red < 0.95x, amber otherwise
```

Each returns `{ text: string; darkText: string; fill: string }` so components do `className={`${zone.text} dark:${zone.darkText}`}`.

Also: `SectionLabel` — tiny reusable component for the muted uppercase section headers (`text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3`).

### Step 4: AvatarFallback (`components/epi/AvatarFallback.tsx`)

Copy pattern from EmployeeShiftsPage — initials from firstName + lastName, circular gray background. Size prop for `w-8 h-8` variant needed by leaderboard.

### Step 5: SvgSparkline (`components/epi/SvgSparkline.tsx`)

- Props: `history: EpiMonthEntry[]`, zone color from current score
- SVG `width="160" height="48"`, `<polyline>` for line (no fill area), dot on latest point
- Invisible `<circle r="10" fill="transparent">` hit targets per data point
- `useState<number | null>(null)` for `hoveredIndex`
- Tooltip: absolutely positioned div above hovered point (`bg-gray-900 text-white text-xs rounded px-2 py-1`)
- Below sparkline: 6 monthly values as `text-xs text-gray-400`, last value in zone color
- Mobile: `onTouchStart` support

### Step 6: EpiHeroCard (`components/epi/EpiHeroCard.tsx`)

- Full-width `Card` with `className` dark mode overrides (`dark:border-gray-700 dark:bg-gray-900`)
- Left: "Employee Performance Index" label, large score (`text-5xl font-medium`) in zone color, month + zone label, trend delta with lucide `TrendingUp`/`TrendingDown`
- Right: SvgSparkline
- Responsive: `flex flex-col md:flex-row md:items-center md:justify-between gap-6`

### Step 7: PerformanceScoresSection (`components/epi/PerformanceScoresSection.tsx`)

- SectionLabel: "Performance scores"
- `grid grid-cols-2 md:grid-cols-4 gap-4`
- Each tile: `bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4`
- Score display with `/5`, zone-colored progress bar (`h-1.5`), EPI contribution, source label
- Null state: dash, no bar, no contribution, "No data this period" italic

### Step 8: OperationalMetricsSection (`components/epi/OperationalMetricsSection.tsx`)

- SectionLabel: "Operational metrics"
- Same grid and tile style
- Cards 1-3: percentage rates with zone coloring and progress bars (0-100%)
- Card 4 (AOV): `"₱XXX"` value, comparison bar with two overlaid layers (branch avg at 40% opacity, your value in zone color), `"vs ₱XXX branch avg"` subtitle

### Step 9: DisciplineRecognitionSection (`components/epi/DisciplineRecognitionSection.tsx`)

- SectionLabel: "Discipline & recognition"
- `grid grid-cols-2 gap-4`
- Each tile: flex layout with icon box + content
- Violations: lucide `AlertCircle`, red theme, `"-{count * 5} pts to EPI"` or "No impact" if 0
- Awards: lucide `Star`, amber theme, `"+{count * 5} pts to EPI"` or "No bonus yet" if 0

### Step 10: EpiLeaderboard (`components/epi/EpiLeaderboard.tsx`)

- SectionLabel: "Global leaderboard"
- Wrapped in `Card` with dark mode overrides
- Header: "Top 10 this month" + "Tap a row to see breakdown"
- `expandedId` state (string | null), toggle on row click
- Top 10 rows, each with: rank badge (gold/silver/bronze colors for 1-3), AvatarFallback, name (truncated), EPI score in zone color, ChevronDown with rotation
- Current user row: highlighted with `bg-primary-50 border border-primary-200 dark:bg-primary-900/20 dark:border-primary-800`
- If user outside top 10: `<hr>` separator + "Your rank" label + user row
- Expanded panel via framer-motion `AnimatePresence` + `motion.div` (height 0→auto, opacity 0→1, 0.2s easeInOut)
- Expanded content: 2-col grid — left "Performance scores" (4 rows: score/5), right "Operational & other" (6 rows: rates, AOV, violations, awards)
- Mini bars (`w-16 h-1`) for applicable values, null shows dash + no bar

### Step 11: EpiDashboard Orchestrator (`components/epi/EpiDashboard.tsx`)

```tsx
export function EpiDashboard({ data, leaderboard }: Props) {
  return (
    <div className="space-y-6">
      <EpiHeroCard data={data} />
      <PerformanceScoresSection criteria={data.criteria} />
      <OperationalMetricsSection criteria={data.criteria} />
      <DisciplineRecognitionSection criteria={data.criteria} />
      <EpiLeaderboard entries={leaderboard} />
    </div>
  );
}
```

### Step 12: Modify DashboardPage.tsx

- Remove: `PerformanceIndex` function (lines 31-240), `LoadingCard` function (lines 242-253)
- Remove unused imports: `useState`, `useEffect`, `Spinner`, `Button`, `api`, `CardHeader`, `CardBody`
- Keep: `useAuthStore`, `usePermission`, `PERMISSIONS`
- Add: import `EpiDashboard` + `MOCK_EPI_DATA` + `MOCK_LEADERBOARD`
- Add `dark:text-white` to greeting `<h1>`
- Replace `<PerformanceIndex />` with `<EpiDashboard data={MOCK_EPI_DATA} leaderboard={MOCK_LEADERBOARD} />`

---

## Dark Mode Strategy

The shared `Card` component is NOT modified. Dark mode applied via `className` prop overrides at each usage:
```tsx
<Card className="dark:border-gray-700 dark:bg-gray-900">
```

All new elements use paired light/dark classes throughout.

---

## Key Reusable Patterns

| Pattern | Source | Usage |
|---------|--------|-------|
| `Card` + `CardBody` | `@/shared/components/ui/Card` | Hero card, Leaderboard wrapper |
| `useAuthStore` | `@/features/auth/store/authSlice` | firstName for greeting |
| `usePermission` + `PERMISSIONS` | `@/shared/hooks/usePermission` + `@omnilert/shared` | Gate entire EPI section |
| AvatarFallback initials logic | EmployeeShiftsPage (line 72) | Leaderboard rows |
| framer-motion AnimatePresence | Already in use in case-reports | Leaderboard expand |

---

## Verification

1. `pnpm dev` from root — dashboard loads without errors
2. Visit `/dashboard` as a user with `DASHBOARD_VIEW_PERFORMANCE_INDEX` permission
3. Verify greeting shows correct time-of-day + first name
4. Verify all 5 sections render with mock data
5. Verify null states show dashes (workplaceRelations, productivity)
6. Hover sparkline points — tooltips appear with month + score
7. Click leaderboard rows — expand/collapse animation works, only one expanded at a time
8. Current user row (rank 7) is highlighted
9. Toggle dark mode — all elements render correctly
10. Resize to mobile — grids collapse to 2-col/1-col appropriately
11. Swap mock data comment to rank-12 variant — separator + "Your rank" row appears
12. No TypeScript errors: `pnpm --filter web tsc --noEmit`
