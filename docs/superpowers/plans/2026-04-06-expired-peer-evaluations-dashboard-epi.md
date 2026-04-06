# Expired Peer Evaluations Dashboard/EPI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Count expired peer evaluations in dashboard-driven WRS/EPI flows using default `5` scores and the expiry timestamp as the effective time.

**Architecture:** Expand the peer-evaluation dataset used by dashboard, snapshot, and analytics services so expired rows participate in EPI reads without rewriting workflow state. Keep the calculator as the single source of WRS timing behavior while making service queries consistent across live and snapshot consumers.

**Tech Stack:** TypeScript, Node.js, Knex, built-in Node test runner, React dashboard consumers

---

## Chunk 1: Tests For WRS Expiry Handling

### Task 1: Extend calculator tests for expired evaluations

**Files:**
- Modify: `apps/api/src/services/epiCalculation.service.test.ts`
- Modify: `apps/api/src/services/epiCalculation.service.ts`
- Test: `apps/api/src/services/epiCalculation.service.test.ts`

- [ ] **Step 1: Write the failing tests**

Add tests that prove:

- `getWrsStatusSummary` counts an expired evaluation as an effective evaluation when `expires_at` is in-range
- `calculateKpiScoresWithQueryDeps` uses an expired peer evaluation with default score `5`

- [ ] **Step 2: Run tests to verify they fail**

Run: `rtk npm --prefix apps/api test -- src/services/epiCalculation.service.test.ts`
Expected: FAIL because expired evaluations are ignored by current logic.

- [ ] **Step 3: Write minimal implementation**

Update the peer-evaluation input type and normalization logic so expired rows can contribute `average_score = 5` at `expires_at`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `rtk npm --prefix apps/api test -- src/services/epiCalculation.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/epiCalculation.service.ts apps/api/src/services/epiCalculation.service.test.ts
git commit -m "feat: count expired peer evaluations in WRS calculations"
```

## Chunk 2: Service Query Coverage

### Task 2: Add failing coverage for query/service behavior

**Files:**
- Modify: `apps/api/src/services/epiDashboard.service.test.ts`
- Modify: `apps/api/src/services/epiSnapshotCron.service.ts`
- Modify: `apps/api/src/services/epiDashboard.service.ts`
- Modify: `apps/api/src/services/employeeAnalyticsSnapshot.service.ts`
- Modify: `apps/api/src/services/employeeAnalyticsMetrics.service.ts`

- [ ] **Step 1: Write the failing tests**

Add focused tests or source-level assertions that prove dashboard/snapshot-facing peer-evaluation reads include expired rows and emit effective timing for them.

- [ ] **Step 2: Run tests to verify they fail**

Run: `rtk npm --prefix apps/api test -- src/services/epiDashboard.service.test.ts`
Expected: FAIL because the current queries require `submitted_at IS NOT NULL`.

- [ ] **Step 3: Write minimal implementation**

Update peer-evaluation selects in dashboard, snapshot, and analytics services to:

- include expired rows
- emit `average_score = 5` for expired rows
- emit `wrs_effective_at = expires_at` for expired rows
- include `status` and `expires_at` in the shared calculator input where needed

- [ ] **Step 4: Run tests to verify they pass**

Run: `rtk npm --prefix apps/api test -- src/services/epiDashboard.service.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/epiDashboard.service.ts apps/api/src/services/epiSnapshotCron.service.ts apps/api/src/services/employeeAnalyticsSnapshot.service.ts apps/api/src/services/employeeAnalyticsMetrics.service.ts apps/api/src/services/epiDashboard.service.test.ts
git commit -m "feat: include expired peer evaluations in dashboard EPI reads"
```

## Chunk 3: End-To-End Verification

### Task 3: Verify all touched behavior together

**Files:**
- Modify: `docs/superpowers/specs/2026-04-06-expired-peer-evaluations-dashboard-epi-design.md`
- Modify: `docs/superpowers/plans/2026-04-06-expired-peer-evaluations-dashboard-epi.md`

- [ ] **Step 1: Run targeted backend tests**

Run:

`rtk npm --prefix apps/api test -- src/services/epiCalculation.service.test.ts src/services/epiDashboard.service.test.ts`

Expected: PASS

- [ ] **Step 2: Run any additional source-level regression tests affected by the query changes**

Run:

`rtk npm --prefix apps/api test -- test/cronNotificationWiring.test.mjs`

Expected: PASS or unchanged status unrelated to this feature

- [ ] **Step 3: Review diff for unintended workflow changes**

Run:

`rtk git diff -- apps/api/src/services/epiCalculation.service.ts apps/api/src/services/epiDashboard.service.ts apps/api/src/services/epiSnapshotCron.service.ts apps/api/src/services/employeeAnalyticsSnapshot.service.ts apps/api/src/services/employeeAnalyticsMetrics.service.ts`

Expected: only expired-evaluation read/calculation changes are present

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-04-06-expired-peer-evaluations-dashboard-epi-design.md docs/superpowers/plans/2026-04-06-expired-peer-evaluations-dashboard-epi.md
git commit -m "docs: plan expired peer evaluation EPI support"
```
