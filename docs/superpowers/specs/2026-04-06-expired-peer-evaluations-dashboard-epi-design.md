# Expired Peer Evaluations Dashboard/EPI Design

**Date:** 2026-04-06

**Goal:** Make expired peer evaluations appear in dashboard-driven WRS/EPI data and count toward EPI calculations using a default score of `5` for all peer-evaluation questions when the evaluation expires without being submitted.

## Context

Today, the dashboard, EPI snapshot pipeline, and employee analytics services only load peer evaluations with `submitted_at` present. Expired peer evaluations remain visible in schedule/activity history, but they are excluded from WRS status, projected dashboard EPI, and snapshot-based EPI calculations.

The requested behavior is:

- Expired peer evaluations must count toward WRS/EPI.
- Expired peer evaluations must behave as if all three peer-evaluation scores are `5`.
- The effective timestamp for those defaulted evaluations should be the expiry timestamp.
- The underlying workflow state should remain `expired` rather than rewriting the row as if it were user-submitted.

## Chosen Approach

Use read-time normalization for EPI-related consumers.

For all services that feed dashboard, snapshots, and employee analytics, widen peer-evaluation reads to include:

- submitted evaluations, using their stored average score and `wrs_effective_at` / `submitted_at`
- expired evaluations, using a synthetic average score of `5` and `expires_at` as the effective timestamp

This keeps the source row semantically accurate while making downstream KPI logic consistent.

## Design Details

### 1. Shared EPI input shape

The EPI calculation path currently expects each peer-evaluation record to contain:

- `average_score`
- `submitted_at`
- `wrs_effective_at`

To support expired evaluations without mutating stored submission fields, the EPI input shape should be extended to also carry:

- `status`
- `expires_at`

The calculation layer will then normalize timing and score rules based on those fields.

### 2. Query behavior

The peer-evaluation queries used by these services should include both:

- rows with `submitted_at IS NOT NULL`
- rows with `status = 'expired'`

For expired rows, the SQL select should emit:

- `average_score = 5`
- `submitted_at = NULL`
- `wrs_effective_at = expires_at`

This keeps the calculator simple and makes dashboard/snapshot/analytics feeds consistent.

### 3. Calculation behavior

WRS summary and WRS score calculation should treat expired rows as effective evaluations when their effective timestamp falls within the requested window.

That means:

- an expired row in-range increments `effectiveCount`
- an expired row contributes score `5` to WRS averaging
- expired rows should not count as delayed, because they are effective at expiry time

Completed/submitted evaluations keep their existing delayed/effective semantics.

### 4. Dashboard behavior

Once expired evaluations are included in the live EPI input:

- `Workplace Relations Score` on the dashboard can show a real score instead of `No effective evaluations yet`
- projected EPI delta will reflect those defaulted expired evaluations
- snapshot-backed historical calculations will also include them once the snapshot job runs

No separate dashboard-only UI change is required if the backend payload already carries the updated WRS/EPI values.

## Risks And Guardrails

- Do not overwrite expired rows to look submitted; preserve auditability.
- Do not affect the pending peer-evaluation inbox behavior.
- Do not change successfully submitted evaluation behavior.
- Keep employee analytics aligned with dashboard/snapshot logic so WRS reporting does not drift.

## Testing Strategy

Add tests first for:

- WRS summary counting expired evaluations as effective
- WRS calculation using default score `5` for expired evaluations
- dashboard/snapshot query paths including expired evaluations in peer-evaluation datasets

Then implement the minimum production changes to satisfy those tests.
