# Analytics Range Persistence Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give employee analytics and profitability analytics page-specific default date ranges and persist each page's selected range in session storage.

**Architecture:** Keep `AnalyticsRangePicker` as a controlled UI component. Add shared pure utilities for the new default-range rules plus a small shared persisted-range helper that restores, validates, normalizes, and stores page-owned analytics range state with page-specific storage keys.

**Tech Stack:** React, TypeScript, sessionStorage, Node test runner, Vite app utilities

---

## Chunk 1: Range Utility Coverage

### Task 1: Add failing tests for the new default-range rules

**Files:**
- Modify: `apps/web/tests/analyticsRangeBuckets.test.ts`
- Modify: `apps/web/src/features/employee-analytics/utils/analyticsRangeBuckets.ts`
- Test: `apps/web/tests/analyticsRangeBuckets.test.ts`

- [ ] **Step 1: Write the failing test**

Add tests proving:
- employee analytics can build an inclusive trailing 14-day range ending today
- profitability analytics can build an inclusive current month-to-date range

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk .\\apps\\api\\node_modules\\.bin\\tsx.cmd --test apps/web/tests/analyticsRangeBuckets.test.ts`
Expected: FAIL because the new helpers do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Add focused helpers in `analyticsRangeBuckets.ts` for:
- trailing-day inclusive range creation
- current-month-to-date range creation

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk .\\apps\\api\\node_modules\\.bin\\tsx.cmd --test apps/web/tests/analyticsRangeBuckets.test.ts`
Expected: PASS

## Chunk 2: Persisted Range Restore Logic

### Task 2: Add failing tests for persisted range parsing and fallback behavior

**Files:**
- Create: `apps/web/tests/analyticsRangePersistence.test.ts`
- Create: `apps/web/src/features/employee-analytics/utils/analyticsRangePersistence.ts`
- Test: `apps/web/tests/analyticsRangePersistence.test.ts`

- [ ] **Step 1: Write the failing test**

Add tests proving:
- a valid stored selection is restored
- invalid JSON falls back to the supplied default
- malformed selection objects fall back to the supplied default
- restored selections are normalized before use

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk .\\apps\\api\\node_modules\\.bin\\tsx.cmd --test apps/web/tests/analyticsRangePersistence.test.ts`
Expected: FAIL because the persistence helper does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create a small utility/hook module that:
- validates the stored shape
- normalizes `rangeStartYmd` / `rangeEndYmd`
- safely reads from `sessionStorage`
- safely writes to `sessionStorage`

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk .\\apps\\api\\node_modules\\.bin\\tsx.cmd --test apps/web/tests/analyticsRangePersistence.test.ts`
Expected: PASS

## Chunk 3: Page Wiring

### Task 3: Switch both analytics pages to page-specific defaults and session persistence

**Files:**
- Modify: `apps/web/src/features/employee-analytics/pages/EmployeeAnalyticsPage.tsx`
- Modify: `apps/web/src/features/profitability-analytics/pages/ProfitabilityAnalyticsPage.tsx`
- Modify: `apps/web/src/features/employee-analytics/utils/analyticsRangePersistence.ts`

- [ ] **Step 1: Write the failing test or source assertion**

Add targeted test coverage or source-level utility coverage that proves:
- employee analytics initializes with trailing 14-day day-range fallback
- profitability analytics initializes with month-to-date fallback
- each page uses a distinct session storage key

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk .\\apps\\api\\node_modules\\.bin\\tsx.cmd --test apps/web/tests/analyticsRangeBuckets.test.ts apps/web/tests/analyticsRangePersistence.test.ts`
Expected: FAIL until the pages consume the new helper and defaults.

- [ ] **Step 3: Write minimal implementation**

Wire:
- `EmployeeAnalyticsPage` to `employee-analytics.range`
- `ProfitabilityAnalyticsPage` to `profitability-analytics.range`

Keep `AnalyticsRangePicker` controlled and unchanged beyond consuming the page state.

- [ ] **Step 4: Run tests to verify they pass**

Run: `rtk .\\apps\\api\\node_modules\\.bin\\tsx.cmd --test apps/web/tests/analyticsRangeBuckets.test.ts apps/web/tests/analyticsRangePersistence.test.ts`
Expected: PASS

## Chunk 4: Verification

### Task 4: Run focused verification

**Files:**
- Modify: `docs/superpowers/specs/2026-04-06-analytics-range-persistence-design.md`
- Modify: `docs/superpowers/plans/2026-04-06-analytics-range-persistence.md`

- [ ] **Step 1: Run the touched web tests together**

Run: `rtk .\\apps\\api\\node_modules\\.bin\\tsx.cmd --test apps/web/tests/analyticsRangeBuckets.test.ts apps/web/tests/analyticsRangePersistence.test.ts`
Expected: PASS

- [ ] **Step 2: Run TypeScript verification**

Run: `rtk .\\apps\\web\\node_modules\\.bin\\tsc.cmd -p apps/web/tsconfig.json --noEmit`
Expected: PASS

- [ ] **Step 3: Review the final diff for scope**

Run: `rtk git diff -- apps/web/src/features/employee-analytics/utils/analyticsRangeBuckets.ts apps/web/src/features/employee-analytics/utils/analyticsRangePersistence.ts apps/web/src/features/employee-analytics/pages/EmployeeAnalyticsPage.tsx apps/web/src/features/profitability-analytics/pages/ProfitabilityAnalyticsPage.tsx apps/web/tests/analyticsRangeBuckets.test.ts apps/web/tests/analyticsRangePersistence.test.ts`
Expected: only the range-default and session-persistence behavior changes
