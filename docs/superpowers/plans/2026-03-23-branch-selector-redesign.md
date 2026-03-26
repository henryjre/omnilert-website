# Branch Selector Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current flat branch dropdown with a grouped, responsive branch selector that defaults to `All Branches` and is ready for future all-company backend hydration.

**Architecture:** Keep the existing branch store contract for the rest of the app, but extend it with grouped company branch data and a pure selector-state helper module. Rebuild `BranchSelector.tsx` around the grouped model with desktop dropdown and mobile sheet variants using Framer Motion.

**Tech Stack:** React, TypeScript, Zustand, Framer Motion, Tailwind CSS, node:test, existing Axios API client

---

## File Map

- Modify: `apps/web/src/shared/store/branchStore.ts`
  - Extend the store with grouped company branch data while preserving the existing flat branch list and selection API.
- Create: `apps/web/src/shared/components/branchSelectorState.ts`
  - Hold pure helpers for grouping, selection, and closed-label behavior.
- Modify: `apps/web/src/shared/components/BranchSelector.tsx`
  - Replace the flat dropdown with grouped desktop/mobile selector UI.
- Modify: `apps/web/src/features/dashboard/components/TopBar.tsx`
  - Keep the selector placement intact and preserve the current fetch/init flow.
- Create: `apps/web/test/branchSelectorState.web.test.ts`
  - Cover selection label and `All Branches` fallback behavior.

## Task 1: Add failing selector-state tests

**Files:**
- Create: `apps/web/test/branchSelectorState.web.test.ts`
- Create: `apps/web/src/shared/components/branchSelectorState.ts`

- [ ] **Step 1: Write the failing test**

Add tests for:
- selecting all visible branch ids from grouped company data
- unchecking `All Branches` falling back to the first branch in rendered order
- preventing the last remaining branch from being deselected
- formatting the closed label as `All Branches` or `First Branch +N`

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec node --import tsx --test apps/web/test/branchSelectorState.web.test.ts`
Expected: FAIL because `branchSelectorState.ts` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create helpers such as:

```ts
export function flattenCompanyBranchIds(groups) { ... }
export function toggleGroupedBranchSelection(selectedIds, branchId, orderedIds) { ... }
export function clearAllBranchesToFirst(orderedIds) { ... }
export function formatBranchSelectionLabel(groups, selectedIds) { ... }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec node --import tsx --test apps/web/test/branchSelectorState.web.test.ts`
Expected: PASS

## Task 2: Extend the branch store for grouped branch data

**Files:**
- Modify: `apps/web/src/shared/store/branchStore.ts`
- Create: `apps/web/src/shared/components/branchSelectorState.ts`
- Test: `apps/web/test/branchSelectorState.web.test.ts`

- [ ] **Step 1: Add grouped company branch types to the store**

Keep `branches` for current consumers and add grouped selector data for the new UI.

- [ ] **Step 2: Build a real-data adapter with current frontend-safe sources**

Use the current branch list plus available company/profile context to shape grouped branch data now, while keeping the store ready for a future dedicated all-company branch feed.

- [ ] **Step 3: Sanitize selection against the grouped branch ids**

When branch data refreshes:
- remove stale selections
- auto-select all visible branch ids when nothing valid remains

- [ ] **Step 4: Preserve existing selection mutators**

Keep `setSelectedBranchIds`, `toggleBranch`, and `selectAll` compatible with existing pages.

## Task 3: Rebuild the selector UI

**Files:**
- Modify: `apps/web/src/shared/components/BranchSelector.tsx`
- Modify: `apps/web/src/shared/store/branchStore.ts`
- Create: `apps/web/src/shared/components/branchSelectorState.ts`

- [ ] **Step 1: Replace the trigger label logic**

Use the pure helper to show `All Branches` or `First Branch +N`.

- [ ] **Step 2: Add the grouped desktop dropdown**

Render:
- sticky `All Branches` row
- company headers with separators
- checkbox rows for branches
- capped scroll area

- [ ] **Step 3: Add the mobile sheet variant**

Reuse the app’s overlay pattern for small screens with larger touch targets and a dedicated header.

- [ ] **Step 4: Add subtle motion**

Use Framer Motion for:
- panel fade/scale
- chevron rotation
- grouped content reveal

- [ ] **Step 5: Preserve outside-click and escape-to-close behavior**

Keep the selector easy to dismiss on both desktop and mobile.

## Task 4: Keep the top-bar integration stable

**Files:**
- Modify: `apps/web/src/features/dashboard/components/TopBar.tsx`
- Modify: `apps/web/src/shared/store/branchStore.ts`

- [ ] **Step 1: Keep existing fetch-on-mount behavior**

Do not move the selector out of the top bar.

- [ ] **Step 2: Preserve current active-shift branch override logic**

Do not break the existing `setSelectedBranchIds([branchId])` flows used after check-in and company assignment updates.

- [ ] **Step 3: Avoid sidebar company-switch changes**

Keep company switching out of scope for this implementation.

## Task 5: Run focused verification

**Files:**
- Test: `apps/web/test/branchSelectorState.web.test.ts`
- Modify: `apps/web/src/shared/components/BranchSelector.tsx`
- Modify: `apps/web/src/shared/store/branchStore.ts`

- [ ] **Step 1: Run selector-state tests**

Run: `pnpm exec node --import tsx --test apps/web/test/branchSelectorState.web.test.ts`
Expected: PASS

- [ ] **Step 2: Run the frontend build**

Run: `pnpm -C apps/web build`
Expected: exit 0

- [ ] **Step 3: Review the implementation against the approved UX**

Check:
- `All Branches` defaults correctly
- closed label follows the approved format
- company separators are visible
- mobile/desktop layouts compile cleanly
