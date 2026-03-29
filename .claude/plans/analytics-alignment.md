## Employee Analytics Semantics Alignment (Latest-Point + 30-Day Logs)

### Summary
Align Employee Analytics calculations to latest-point semantics for the selected range (example: Mar 1–7 daily uses Mar 7 as latest point), and align distributions to hero-zone % change bands with value-equivalent labels.

### Key Implementation Changes

1. General View
- Keep Global Average EPI as latest-point value (Mar 7 in example), with delta `latest - first` (Mar 7 - Mar 1).
- Keep Recognition totals as range sums (awards/violations summed across employees in selected range).
- Change EPI Score Distribution logic to:
  - Zone assignment by % change vs latest global avg EPI using bands: `<= -25%`, `-25% to 0%`, `0% to +50%`, `> +50%`.
  - Label display as equivalent EPI values (not percent text), derived from latest global avg EPI.
  - Count employees by latest EPI point in selected range.

2. Individual Employee
- Personal EPI card:
  - Big number = employee latest EPI (Mar 7).
  - Chart points = actual daily EPI points in selected range (Mar 1..Mar 7).
  - Delta = `Mar 7 - Mar 1`.
- Global Ranking:
  - Current Position = true rank from full employee roster by latest EPI (not top/bottom display slices).
  - Vs Global = `% change` using latest-point values:
    - `(employeeLatestEpi - globalLatestEpi) / globalLatestEpi * 100`
- Detailed Metrics panel:
  - `Your Score` = employee latest metric value in range.
  - `Global Avg` = global latest average metric value in range.
  - Difference badge = `yourLatest - globalLatest`.
  - Rank = real rank among all employees by latest metric value (remove synthetic rank/constant-total behavior).
- Event logs:
  - Fetch trailing 30-day logs ending at anchor date (inclusive), where anchor date is:
    - latest available snapshot date within selected range (confirmed choice).
  - Keep server pagination and existing metric-specific API mapping.

3. Individual Metrics
- Keep Global Average, Top/Bottom, and Employee Rankings based on latest-point values (or latest-first delta for “By Change”).
- Change Score Distribution to:
  - Zone assignment by % change vs latest global avg for selected metric using same hero bands.
  - Label display as equivalent metric values derived from latest global avg (not percent text).
  - For bounded metrics keep sensible caps; for AOV keep monetary ranges uncapped.

### Public Interfaces / Types
- No backend route contract changes required.
- Frontend internal analytics shaping adds/updates helpers for:
  - latest-point extraction per metric/user
  - value-equivalent hero-band label generation
  - 30-day log window derivation from in-range latest snapshot anchor
  - true full-roster ranking helpers

### Test Plan
1. General View
- With Mar 1–7 daily data, Global EPI big number equals Mar 7 global avg.
- Global EPI delta equals Mar 7 minus Mar 1.
- EPI distribution bins match hero-zone % thresholds and display value-equivalent labels.

2. Individual Employee
- Personal EPI big number equals selected employee Mar 7 value.
- Personal chart shows Mar 1..Mar 7 points.
- Personal delta equals Mar 7 minus Mar 1.
- Current Position equals full-roster rank, not limited display slices.
- Vs Global uses latest-point formula only.
- Detailed Metrics `Global Avg` equals Mar 7 global avg for selected metric.
- Detailed Metrics rank matches full-roster latest metric ranking.
- Event logs query window equals trailing 30-day window ending at in-range latest snapshot date.

3. Individual Metrics
- Score Distribution bins/labels use latest global metric avg with hero-zone thresholds.
- By-score and by-change rankings remain stable and correct with latest-point / latest-first semantics.

### Assumptions and Defaults
- “Latest date” means latest available snapshot date inside selected range.
- “Trailing 30-day logs” means 30-day window ending on that anchor date (inclusive).
- Professional Conduct remains unavailable (`N/A`) and does not request event logs.
