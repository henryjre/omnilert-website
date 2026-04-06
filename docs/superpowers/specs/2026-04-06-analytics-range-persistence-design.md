# Analytics Range Defaults And Session Persistence Design

**Date:** 2026-04-06

## Goal

Update analytics range behavior so that:

- `EmployeeAnalyticsPage` defaults to a day-range from the current date back through 14 days ago.
- `ProfitabilityAnalyticsPage` defaults to the current month-to-date.
- Each page persists its selected analytics range in `sessionStorage`, so navigating away and back does not reset the selection during the current browser session.z

## Current State

Both pages currently initialize with `createDefaultRangeForGranularity('day')`, which yields the shared default 30-day day-range. The `AnalyticsRangePicker` is a controlled UI component and does not own persistence. There is no existing session-level storage for analytics range selections.

## Chosen Approach

Keep `AnalyticsRangePicker` generic and add a small shared persisted-range state helper used by the pages.

This keeps page-specific policy out of the picker and avoids duplicating `sessionStorage` parsing, validation, normalization, and fallback behavior in both pages.

## Default Range Rules

### Employee Analytics

Default to day granularity with an inclusive range covering today and the prior 14 days.

Example on **April 6, 2026**:

- granularity: `day`
- start: `2026-03-23`
- end: `2026-04-06`

### Profitability Analytics

Default to month granularity with an inclusive month-to-date range.

Example on **April 6, 2026**:

- granularity: `month`
- start: `2026-04-01`
- end: `2026-04-06`

## Persistence Rules

Each page will use its own `sessionStorage` key so their selections do not overwrite each other.

Proposed keys:

- `employee-analytics.range`
- `profitability-analytics.range`

On page load:

1. read the page-specific session value
2. parse and validate the stored object shape
3. normalize `rangeStartYmd` / `rangeEndYmd`
4. use the stored value if valid
5. otherwise fall back to the page-specific default

On range change:

- persist the normalized selection back into `sessionStorage`

If storage is unavailable or the value is malformed:

- fail safely and use the page default

## Proposed Code Structure

### Shared date-range helpers

Extend the shared analytics range utility area with explicit builders for:

- trailing day range covering today and the prior N days
- current month-to-date range

These helpers should accept an optional `now: Date` parameter so they are easy to test.

### Shared persisted-range helper

Add a focused helper or hook that:

- accepts a storage key and fallback selection
- restores a validated selection from `sessionStorage`
- exposes controlled state for the page
- writes updates back to `sessionStorage`

This logic belongs outside `AnalyticsRangePicker`, because it is page state policy rather than picker rendering behavior.

## Page Changes

### `EmployeeAnalyticsPage`

- replace the current shared 30-day default initializer
- use the persisted-range helper with the employee analytics storage key
- keep the existing `AnalyticsRangePicker` integration unchanged beyond the state source

### `ProfitabilityAnalyticsPage`

- replace the current shared day default initializer
- use the persisted-range helper with the profitability analytics storage key
- initialize from month-to-date instead of the generic day-range default

### `AnalyticsRangePicker`

No behavioral storage changes are required. It remains a controlled component.

## Testing Strategy

Add utility-level coverage for:

- trailing 14-day inclusive default generation
- month-to-date default generation
- stored selection parsing / validation / fallback behavior

Prefer testing the shared helper and pure utilities rather than writing large page-level tests against the full analytics pages.

## Risks And Guardrails

- Do not let one page’s saved range affect the other page.
- Do not move persistence logic into the picker.
- Do not break the picker’s existing min-date clamping behavior.
- Keep all date calculations local-calendar based to match the current analytics range utilities.
