# Clickable Metrics Card Flip — Design Spec

**Date:** 2026-03-28
**Component:** `PersonalMetricsBreakdownCard` in Employee Analytics (Individual Employee view)

## Overview

The "Detailed Metrics" card in the Employee View gains a flip interaction. Clicking any metric row flips the entire card to reveal that metric's detailed breakdown — summary stats, formula, and a paginated event log. A back button reverse-flips to the overview.

## Card States

### Front (Overview)

The existing grouped metrics view with progress bars. Changes:

- Each metric row becomes a click target (`cursor-pointer`, subtle hover highlight)
- No other visual changes to the front face

### Back (Detail)

Shows the selected metric's full breakdown. Three vertically stacked sections inside the same `AnalyticsCard` wrapper:

**Header:** Replaces "Detailed Metrics" title with:
- Left: back arrow + "Back to Overview" (clickable, triggers reverse flip)
- Right: selected metric name (e.g., "Attendance Rate")

**Summary Strip:**
Three inline stat boxes:
- **Your Score** — large, color-coded (emerald if above global avg, amber if below)
- **Global Avg** — neutral gray styling
- **Rank** — e.g., "12th / 85"

Below the boxes, a single-line formula in a subtle monospace/code style:
- e.g., `Formula: (Attended + Excused) / Total Scheduled`

**Event Log:**
Paginated table, 5 rows per page. Columns are metric-specific (see schemas below). Simple prev/next pagination with "Page X of Y" centered below the table.

## Metric Column Schemas

### Core Performance
**Applies to:** Customer Service, Workplace Relations, Professional Conduct

| Column    | Description                  |
|-----------|------------------------------|
| Date      | Date of evaluation           |
| Score     | Numeric score for that entry |
| Evaluator | Who performed the evaluation |
| Category  | Evaluation category/context  |

**Formula:** `Average of all scores in period`

### Attendance & Punctuality

**Attendance columns:**

| Column | Description              |
|--------|--------------------------|
| Date   | Shift date               |
| Shift  | Shift name/time          |
| Status | Present / Absent / Excused |
| Notes  | Reason or remarks        |

**Formula:** `(Attended + Excused) / Total Scheduled`

**Punctuality columns:**

| Column   | Description                    |
|----------|--------------------------------|
| Date     | Shift date                     |
| Shift    | Shift name/time                |
| Clock-in | Actual clock-in time           |
| Variance | Minutes early/late             |
| Status   | On-time / Late / Early         |

**Formula:** `On-time Shifts / Total Shifts`

### Productivity & SOP/Compliance
**Applies to:** Productivity, Uniform Compliance, Hygiene Compliance, SOP Compliance

| Column    | Description                     |
|-----------|---------------------------------|
| Date      | Date of check/assessment        |
| Inspector | Who performed the check         |
| Result    | Pass / Fail / numeric value     |
| Remarks   | Additional notes                |

**Formula (Productivity):** `Avg Daily Achievement %`
**Formula (Compliance metrics):** `Passed Checks / Total Checks`

## Flip Animation

- **Library:** framer-motion (already in use on the page)
- **Technique:** `rotateY` transform on front/back content containers
- **Forward flip:** front `rotateY(0 → 180deg)`, back `rotateY(-180deg → 0)`
- **Reverse flip:** back `rotateY(0 → -180deg)`, front `rotateY(180deg → 0)`
- **Spring config:** `stiffness: 300, damping: 30` (snappy, not jarring)
- **Perspective:** `1200px` on parent container for natural 3D depth
- **Height transition:** framer-motion `layout` prop to smoothly animate height difference between front (compact) and back (taller with table)
- **Backface visibility:** `hidden` on both faces to prevent content bleed-through during rotation

## Data

All data is mock/generated for now (no API). Mock data generators produce realistic entries per metric type matching the column schemas above.

## Interaction Flow

1. User views the Detailed Metrics card (front face with grouped progress bars)
2. User clicks a metric row (e.g., "Attendance")
3. Card flips forward via `rotateY` spring animation, height adjusts
4. Back face shows: summary strip (score / global avg / rank + formula) + paginated event log
5. User can paginate through event log (5 rows/page, prev/next buttons)
6. User clicks "Back to Overview" in header
7. Card reverse-flips back to the metrics overview

## Scope

- Modify `PersonalMetricsBreakdownCard` component only
- Add mock data generators for each metric schema
- No new API calls, no new files — all changes within `EmployeeAnalyticsPage.tsx`
- No changes to the front face layout beyond adding click targets and hover states
