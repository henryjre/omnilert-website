# Shift Summary Progress Bars — Design Spec

**Date:** 2026-04-18  
**Status:** Approved  
**Affects:** `ScheduleTab.tsx`, `EmployeeShiftsPage.tsx`

---

## Context

The Shift Summary section currently shows hours and break data as a plain 2-column grid of labels and values. This makes it hard to visually assess how much of a shift has been worked vs. allocated. Replacing static numbers with progress bars gives an immediate visual sense of progress, overflow, and breakdown — especially useful for managers reviewing multiple shifts.

---

## What Changes

Replace the 2-column stat grid in the Shift Summary section with:

1. **Two progress bars** (worked hours and break hours)
2. **One composite stacked bar** (total active hours)
3. **Keep Shift Start, Shift End, and Pending Approvals** — displayed above the bars as a compact row

Everything else in the grid (Total Active Hours row, Allocated Hours row, Allocated Breaks row, Net Worked Hours row, Total Break Hours row) is removed in favor of the bars.

---

## Data Computation

### Existing (reuse as-is)
- `effectiveAllocatedHours` — `allocated_hours - ALLOCATED_BREAK_HOURS` (max for worked bar)
- `allocatedBreakHours` — constant `ALLOCATED_BREAK_HOURS = 1` (max for breaks bar)
- `totalBreakMinutes` / `totalBreakHours` — summed from `break_end` logs via `changes.duration_minutes`
- `totalWorkedHours` — `shift.total_worked_hours`
- `netWorkedHours` — `Math.max(0, totalWorkedHours - totalBreakHours)`

### New
- `totalFieldTaskMinutes` — same pattern as `totalBreakMinutes`, filtering `field_task_end` logs:
  ```ts
  logs
    .filter((l) => l.log_type === 'field_task_end')
    .reduce((sum, l) => sum + (Number((l.changes as any)?.duration_minutes) || 0), 0)
  ```
- `totalFieldTaskHours` — `totalFieldTaskMinutes / 60`

---

## Progress Bar Components

### 1. Worked Hours Bar

- **Max:** `effectiveAllocatedHours` (or `netWorkedHours` if overflowed — see below)
- **Value:** `netWorkedHours`
- **Label:** `{netWorkedHours formatted} / {effectiveAllocatedHours formatted}`
- **Normal state:** blue fill on gray track
- **Overflow:** if `netWorkedHours > effectiveAllocatedHours`, the bar max becomes `netWorkedHours`, the fill turns red for the overflow portion, and a thin vertical line marks where `effectiveAllocatedHours` falls
- **Title:** "Worked Hours"

### 2. Break Hours Bar

- **Max:** `allocatedBreakHours` (or `totalBreakHours` if overflowed)
- **Value:** `totalBreakHours`
- **Label:** `{totalBreakHours formatted} / {allocatedBreakHours formatted}`
- **Normal state:** amber fill on gray track
- **Overflow:** same pattern — amber fill up to allocated, red fill for overflow, line marker at allocated position
- **Title:** "Break Hours"

### 3. Total Active Hours — Stacked Bar

- **Total width represents:** `totalWorkedHours` (= net worked + breaks + field tasks; they sum to this)
- **Segments (left to right):**
  1. Net Worked Hours — blue
  2. Break Hours — amber
  3. Field Task Hours — purple
- **Label:** `{totalWorkedHours formatted} total`
- **No overflow case** — segments always sum to 100% of the bar width
- **Title:** "Total Active Hours"
- **Sub-labels:** small colored dots with values shown below or beside the bar (e.g. "● 6h worked  ● 1h break  ● 0.5h field task")

---

## Layout

```
┌─────────────────────────────────────────────────────┐
│ SHIFT SUMMARY                                        │
│                                                      │
│  Shift Start    Oct 15, 8:00 AM                      │
│  Shift End      Oct 15, 5:00 PM                      │
│  ⚠ Pending Approvals: 2   (only if > 0)             │
│                                                      │
│  Worked Hours                        6h 30m / 8h    │
│  [██████████████████░░░░░░░░░░░░░░░░░░░░]           │
│                                                      │
│  Break Hours                         45m / 1h        │
│  [████████████████████████████░░░░░░░░░]            │
│                                                      │
│  Total Active Hours                  7h 15m total   │
│  [████████████████░░░░░░░░░░░░░░░░░░░░░]            │
│   ● 6h 30m worked  ● 45m break  ● 0m field task     │
└─────────────────────────────────────────────────────┘
```

---

## Shared `ShiftProgressBar` Component

Extract a reusable component in each file (or a shared location) to avoid duplication between `ScheduleTab.tsx` and `EmployeeShiftsPage.tsx`.

```tsx
interface ShiftProgressBarProps {
  label: string
  value: number        // in hours
  max: number          // in hours (allocated)
  color: 'blue' | 'amber' | 'purple'
}
```

Overflow logic lives inside this component: if `value > max`, render the overflow portion in red and draw a line marker.

For the stacked bar, a separate `ShiftStackedBar` component takes an array of `{ value, color, label }` segments.

---

## Files to Modify

Both files share identical `ShiftDetailPanel` components. Changes apply to both:

1. `apps/web/src/features/account/components/ScheduleTab.tsx`
   - Inside `ShiftDetailPanel` → Shift Summary section (lines ~1150–1220)
   - Add `totalFieldTaskMinutes` useMemo (line ~1032 area, alongside break useMemo)

2. `apps/web/src/features/employee-shifts/pages/EmployeeShiftsPage.tsx`
   - Inside `ShiftDetailPanel` → Shift Summary section (lines ~1395–1480)
   - Add `totalFieldTaskMinutes` useMemo (line ~1272 area)

---

## Verification

- Open a shift detail panel with hours data present
- Verify bars render with correct proportions and labels
- Simulate overflow: mentally verify that if net worked > allocated, bar turns red past the line
- Verify stacked bar segments sum visually to 100%
- Verify shift with no breaks / no field tasks shows empty segments gracefully (0-width segment, no visual artifact)
- Verify both `ScheduleTab` (My Account view) and `EmployeeShiftsPage` (manager view) render identically
