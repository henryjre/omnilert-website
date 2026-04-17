# Overtime Dependency & Underbreak Authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement (1) overtime review dependency on tardiness/early_check_out/late_check_out/underbreak blocker auths, and (2) a new `underbreak` shift authorization that auto-generates on checkout when break time < 60 min, auto-rejects after 24h with Odoo break work entry upsert, and blocks overtime review while pending.

**Architecture:** `underbreak` is a new `auth_type` on `shift_authorizations` following the exact create-on-checkout / delete-on-check-in lifecycle as `early_check_out`. A shared overtime-dependency service computes blocker state per shift. Overtime approve/reject enforces the blocker check via a 409. The existing 24h expiry job in `shiftAuthorizationCron.service.ts` picks up underbreak automatically; its rejection handler is extended with an Odoo break work entry upsert. Frontend surfaces block state from both local sibling auths and API-provided metadata.

**Tech Stack:** Express 4, TypeScript, Knex 3, PostgreSQL 14+, Socket.io 4, React 18, TanStack React Query 5, Zustand 5, Tailwind CSS 3, Lucide icons

**Specs:**
- `docs/superpowers/specs/2026-04-18-dependent-overtime-review-design.md`
- `docs/superpowers/specs/2026-04-18-underbreak-authorization-design.md`

---

## File Map

### Create
- `apps/api/src/migrations/031_shift_authorizations_underbreak.ts` — adds `underbreak` to `auth_type` CHECK constraint
- `apps/api/src/services/overtimeDependency.service.ts` — shared service: compute blocker types, derive overtime minutes, check blocked state

### Modify
- `apps/api/src/services/webhook.service.ts` — underbreak create-on-checkout, delete-on-check-in
- `apps/api/src/services/shiftAuthorizationResolution.service.ts` — add `underbreak` to expiry/reason sets; extend overtime reconciliation to recalculate diff_minutes; add `underbreak` to blocker types
- `apps/api/src/services/shiftAuthorizationCron.service.ts` — call Odoo break upsert on underbreak auto-reject
- `apps/api/src/controllers/shiftAuthorization.controller.ts` — 409 when overtime approve/reject while blockers pending; enrich list response with `overtime_blocked` / `overtime_blocker_auth_types`
- `packages/shared/src/constants/permissions.ts` or equivalent shared types file — add `'underbreak'` to `ShiftAuthorizationType` union if it exists
- `apps/web/src/features/authorization-requests/AuthorizationRequestsPage.tsx` — add underbreak display config; disable overtime on API metadata; refetch after blocker auth resolution
- `apps/web/src/features/employee-shifts/` (EmployeeShiftsPage and ScheduleTab) — derive overtime blocking locally from sibling auths

---

## Task 1: Migration — add `underbreak` to auth_type constraint

**Files:**
- Create: `apps/api/src/migrations/031_shift_authorizations_underbreak.ts`

- [ ] **Step 1: Create the migration file**

```typescript
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE shift_authorizations
      DROP CONSTRAINT IF EXISTS shift_authorizations_auth_type_check;
    ALTER TABLE shift_authorizations
      ADD CONSTRAINT shift_authorizations_auth_type_check
      CHECK (
        auth_type IN (
          'early_check_in',
          'tardiness',
          'early_check_out',
          'late_check_out',
          'overtime',
          'interim_duty',
          'underbreak'
        )
      );
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE shift_authorizations
      DROP CONSTRAINT IF EXISTS shift_authorizations_auth_type_check;
    ALTER TABLE shift_authorizations
      ADD CONSTRAINT shift_authorizations_auth_type_check
      CHECK (
        auth_type IN (
          'early_check_in',
          'tardiness',
          'early_check_out',
          'late_check_out',
          'overtime',
          'interim_duty'
        )
      );
  `);
}
```

- [ ] **Step 2: Run the migration**

```bash
cd apps/api && pnpm migrate
```

Expected output: `Batch N run: 1 migrations`

- [ ] **Step 3: Verify constraint**

```bash
cd apps/api && pnpm migrate:status
```

Expected: `031_shift_authorizations_underbreak` listed as `Completed`.

- [ ] **Step 4: Commit**

```bash
rtk git add apps/api/src/migrations/031_shift_authorizations_underbreak.ts && rtk git commit -m "feat(db): add underbreak to shift_authorizations auth_type constraint"
```

---

## Task 2: Shared overtime-dependency service

**Files:**
- Create: `apps/api/src/services/overtimeDependency.service.ts`

This service encapsulates all overtime-blocker logic so controllers and the cron job share one source of truth.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/services/__tests__/overtimeDependency.service.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  OVERTIME_BLOCKER_AUTH_TYPES,
  computeOvertimeBlockerState,
  deriveOvertimeMinutes,
} from '../overtimeDependency.service';

describe('OVERTIME_BLOCKER_AUTH_TYPES', () => {
  it('includes all four blocker types', () => {
    expect(OVERTIME_BLOCKER_AUTH_TYPES).toContain('tardiness');
    expect(OVERTIME_BLOCKER_AUTH_TYPES).toContain('early_check_out');
    expect(OVERTIME_BLOCKER_AUTH_TYPES).toContain('late_check_out');
    expect(OVERTIME_BLOCKER_AUTH_TYPES).toContain('underbreak');
  });
});

describe('computeOvertimeBlockerState', () => {
  it('returns blocked=false when no blocker auths are pending', () => {
    const auths = [
      { auth_type: 'tardiness', status: 'approved' },
      { auth_type: 'overtime', status: 'pending' },
    ];
    const result = computeOvertimeBlockerState(auths);
    expect(result.blocked).toBe(false);
    expect(result.blockerAuthTypes).toEqual([]);
  });

  it('returns blocked=true with pending blocker auth types', () => {
    const auths = [
      { auth_type: 'tardiness', status: 'pending' },
      { auth_type: 'underbreak', status: 'pending' },
      { auth_type: 'overtime', status: 'pending' },
    ];
    const result = computeOvertimeBlockerState(auths);
    expect(result.blocked).toBe(true);
    expect(result.blockerAuthTypes).toContain('tardiness');
    expect(result.blockerAuthTypes).toContain('underbreak');
  });
});

describe('deriveOvertimeMinutes', () => {
  it('returns 0 when net worked equals effective allocated', () => {
    // netWorkedHours = 8h, effectiveAllocated = 8h
    const minutes = deriveOvertimeMinutes({
      totalWorkedHours: 9,
      totalBreakHours: 1,
      allocatedHours: 9,
      resolvedAdjustments: [],
    });
    expect(minutes).toBe(0);
  });

  it('adds diff_minutes for approved tardiness', () => {
    // netWorked=8h, effectiveAllocated=7h (allocated=8, -1 break), tardiness approved +30min
    // paid = 8*60 + 30 = 510. effectiveAllocated=7*60=420. overtime=90min
    const minutes = deriveOvertimeMinutes({
      totalWorkedHours: 8,
      totalBreakHours: 0,
      allocatedHours: 8,
      resolvedAdjustments: [{ auth_type: 'tardiness', status: 'approved', diff_minutes: 30 }],
    });
    expect(minutes).toBe(90);
  });

  it('adds diff_minutes for rejected early_check_out', () => {
    const minutes = deriveOvertimeMinutes({
      totalWorkedHours: 9,
      totalBreakHours: 1,
      allocatedHours: 9,
      resolvedAdjustments: [{ auth_type: 'early_check_out', status: 'rejected', diff_minutes: 30 }],
    });
    // netWorked=8h=480min, effectiveAllocated=(9-1)*60=480. early_check_out rejected +30 => paid=510 => overtime=30
    expect(minutes).toBe(30);
  });

  it('subtracts diff_minutes for rejected late_check_out', () => {
    const minutes = deriveOvertimeMinutes({
      totalWorkedHours: 10,
      totalBreakHours: 1,
      allocatedHours: 9,
      resolvedAdjustments: [{ auth_type: 'late_check_out', status: 'rejected', diff_minutes: 30 }],
    });
    // netWorked=9h=540min, effectiveAllocated=8*60=480. late_check_out rejected -30 => paid=510 => overtime=30
    expect(minutes).toBe(30);
  });

  it('returns 0 when derived overtime is negative', () => {
    const minutes = deriveOvertimeMinutes({
      totalWorkedHours: 7,
      totalBreakHours: 1,
      allocatedHours: 9,
      resolvedAdjustments: [],
    });
    expect(minutes).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && pnpm vitest run src/services/__tests__/overtimeDependency.service.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

Create `apps/api/src/services/overtimeDependency.service.ts`:

```typescript
export const OVERTIME_BLOCKER_AUTH_TYPES = new Set([
  'tardiness',
  'early_check_out',
  'late_check_out',
  'underbreak',
] as const);

export type OvertimeBlockerAuthType = 'tardiness' | 'early_check_out' | 'late_check_out' | 'underbreak';

export interface OvertimeBlockerState {
  blocked: boolean;
  blockerAuthTypes: OvertimeBlockerAuthType[];
}

export function computeOvertimeBlockerState(
  auths: Array<{ auth_type: string; status: string }>,
): OvertimeBlockerState {
  const pendingBlockers = auths.filter(
    (a) => OVERTIME_BLOCKER_AUTH_TYPES.has(a.auth_type as OvertimeBlockerAuthType) && a.status === 'pending',
  );
  return {
    blocked: pendingBlockers.length > 0,
    blockerAuthTypes: pendingBlockers.map((a) => a.auth_type as OvertimeBlockerAuthType),
  };
}

interface ResolvedAdjustment {
  auth_type: string;
  status: string;
  diff_minutes: number;
}

export function deriveOvertimeMinutes(input: {
  totalWorkedHours: number;
  totalBreakHours: number;
  allocatedHours: number;
  resolvedAdjustments: ResolvedAdjustment[];
}): number {
  const ALLOCATED_BREAK_HOURS = 1;
  const netWorkedMinutes = Math.max(0, input.totalWorkedHours - input.totalBreakHours) * 60;
  const effectiveAllocatedMinutes = Math.max(0, input.allocatedHours - ALLOCATED_BREAK_HOURS) * 60;

  let paidMinutes = netWorkedMinutes;
  for (const adj of input.resolvedAdjustments) {
    if (adj.auth_type === 'tardiness' && adj.status === 'approved') {
      paidMinutes += adj.diff_minutes;
    } else if (adj.auth_type === 'early_check_out' && adj.status === 'rejected') {
      paidMinutes += adj.diff_minutes;
    } else if (adj.auth_type === 'late_check_out' && adj.status === 'rejected') {
      paidMinutes -= adj.diff_minutes;
    }
  }

  return Math.max(0, paidMinutes - effectiveAllocatedMinutes);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api && pnpm vitest run src/services/__tests__/overtimeDependency.service.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/api/src/services/overtimeDependency.service.ts apps/api/src/services/__tests__/overtimeDependency.service.test.ts && rtk git commit -m "feat(overtime): add overtime dependency service with blocker state and minute derivation"
```

---

## Task 3: Update shiftAuthorizationResolution.service.ts — add underbreak to reason/expiry sets and overtime reconciliation

**Files:**
- Modify: `apps/api/src/services/shiftAuthorizationResolution.service.ts`

- [ ] **Step 1: Read the current sets at lines 18-31**

Open `apps/api/src/services/shiftAuthorizationResolution.service.ts` and locate:
- `MANUAL_REJECT_REQUIRES_EMPLOYEE_REASON_AUTH_TYPES` (line ~18)
- `EXPIRING_EMPLOYEE_REASON_AUTH_TYPES` (line ~24)

- [ ] **Step 2: Add `underbreak` to both sets**

In `MANUAL_REJECT_REQUIRES_EMPLOYEE_REASON_AUTH_TYPES`, add `'underbreak'`:

```typescript
export const MANUAL_REJECT_REQUIRES_EMPLOYEE_REASON_AUTH_TYPES = new Set([
  'early_check_in',
  'early_check_out',
  'overtime',
  INTERIM_DUTY_AUTH_TYPE,
  'underbreak',
]);
```

In `EXPIRING_EMPLOYEE_REASON_AUTH_TYPES`, add `'underbreak'`:

```typescript
export const EXPIRING_EMPLOYEE_REASON_AUTH_TYPES = new Set([
  'early_check_in',
  'early_check_out',
  'overtime',
  INTERIM_DUTY_AUTH_TYPE,
  'tardiness',
  'late_check_out',
  'underbreak',
]);
```

- [ ] **Step 3: Find the overtime reconciliation function (resolveOvertimeDependency or similar) and replace its hardcoded blocker list with OVERTIME_BLOCKER_AUTH_TYPES from overtimeDependency.service.ts**

Import at top of file:
```typescript
import { OVERTIME_BLOCKER_AUTH_TYPES, computeOvertimeBlockerState, deriveOvertimeMinutes } from './overtimeDependency.service';
```

Locate every place in this file that references a hardcoded array/set of `['tardiness', 'early_check_out', 'late_check_out']` and replace with `OVERTIME_BLOCKER_AUTH_TYPES`.

- [ ] **Step 4: Verify TypeScript compiles with no errors**

```bash
cd apps/api && pnpm tsc --noEmit
```

Expected: no errors related to this file.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/api/src/services/shiftAuthorizationResolution.service.ts && rtk git commit -m "feat(overtime): add underbreak to reason/expiry sets; use shared blocker type list"
```

---

## Task 4: Overtime reconciliation — derive and persist recalculated diff_minutes

**Files:**
- Modify: `apps/api/src/services/shiftAuthorizationResolution.service.ts`

This task extends the post-blocker-resolution reconciliation to recalculate overtime `diff_minutes` using `deriveOvertimeMinutes` from the shared service.

- [ ] **Step 1: Locate the overtime reconciliation block in shiftAuthorizationResolution.service.ts**

Find the function that runs after a blocker auth is approved/rejected — it creates/updates/clears the overtime auth. It likely queries `shift_authorizations` for the shift and calls `upsert` or `update` on the overtime row.

- [ ] **Step 2: Replace any manual overtime minute calculation with `deriveOvertimeMinutes`**

The reconciliation should:
1. Fetch the shift row to get `total_worked_hours` and `allocated_hours`.
2. Fetch all ended `shift_activities` break rows for the shift to get `totalBreakHours`.
3. Fetch all non-overtime `shift_authorizations` for the shift (any status) to build `resolvedAdjustments`.
4. Call `deriveOvertimeMinutes({ totalWorkedHours, totalBreakHours, allocatedHours, resolvedAdjustments })`.
5. If blockers are still pending: update `diff_minutes` provisionally but do NOT change status (leave overtime in `pending`, do not make it actionable yet).
6. If blockers are fully resolved and result > 0: upsert overtime auth with `diff_minutes = result`, status `pending` (move back from `no_approval_needed` if needed). Preserve existing `employee_reason` — do NOT null it out when reopening.
7. If blockers are fully resolved and result <= 0: set overtime auth to `no_approval_needed`, clear `resolved_by`, `resolved_at`, `rejection_reason`, `overtime_type`. Preserve `employee_reason`.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/api && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
rtk git add apps/api/src/services/shiftAuthorizationResolution.service.ts && rtk git commit -m "feat(overtime): recalculate diff_minutes from shift data on blocker resolution"
```

---

## Task 5: Overtime approve/reject — enforce 409 on blocked state

**Files:**
- Modify: `apps/api/src/controllers/shiftAuthorization.controller.ts`

- [ ] **Step 1: Locate the approve and reject handlers in shiftAuthorization.controller.ts**

Find `approveShiftAuthorization` and `rejectShiftAuthorization` (or equivalent).

- [ ] **Step 2: Add blocker check before processing overtime auths**

Import at top:
```typescript
import { computeOvertimeBlockerState } from '../services/overtimeDependency.service';
```

In both approve and reject handlers, after loading the auth row and confirming `auth.auth_type === 'overtime'`, add:

```typescript
// Fetch all sibling shift_authorizations for the same shift
const siblingAuths = await db.getDb()('shift_authorizations')
  .where({ shift_id: auth.shift_id })
  .whereNot({ id: auth.id })
  .select('auth_type', 'status');

const { blocked, blockerAuthTypes } = computeOvertimeBlockerState(siblingAuths);
if (blocked) {
  return res.status(409).json({
    success: false,
    error: 'overtime_blocked',
    message: `Resolve ${blockerAuthTypes.join(', ')} before reviewing overtime.`,
    data: { overtime_blocked: true, overtime_blocker_auth_types: blockerAuthTypes },
  });
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/api && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
rtk git add apps/api/src/controllers/shiftAuthorization.controller.ts && rtk git commit -m "feat(overtime): return 409 when overtime approve/reject attempted while blockers pending"
```

---

## Task 6: Enrich service-crew list response with overtime block metadata

**Files:**
- Modify: `apps/api/src/controllers/shiftAuthorization.controller.ts` (or the list query in `authorizationRequest.controller.ts`)

- [ ] **Step 1: Locate where service-crew authorization rows are fetched for the list endpoint**

Find the query/service that returns shift authorization rows for `AuthorizationRequestsPage` — likely in `authorizationRequest.controller.ts` `list()` or a service it calls.

- [ ] **Step 2: Add `overtime_blocked` and `overtime_blocker_auth_types` to overtime rows**

Import:
```typescript
import { computeOvertimeBlockerState } from '../services/overtimeDependency.service';
```

After fetching all shift auths grouped by shift, for each overtime auth row:

```typescript
// For each row where auth_type === 'overtime':
const siblingAuths = allAuthsForShift.filter((a) => a.id !== overtimeRow.id);
const { blocked, blockerAuthTypes } = computeOvertimeBlockerState(siblingAuths);
overtimeRow.overtime_blocked = blocked;
overtimeRow.overtime_blocker_auth_types = blockerAuthTypes;
```

For non-overtime rows, set both fields to their defaults (`false`, `[]`).

- [ ] **Step 3: Include these fields in approve/reject response bodies for overtime auths**

In the approve and reject handlers (after the 409 guard from Task 5), when the auth being processed is overtime, append to the response body:
```typescript
data: {
  ...resolvedAuth,
  overtime_blocked: false,
  overtime_blocker_auth_types: [],
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd apps/api && pnpm tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
rtk git add apps/api/src/controllers/shiftAuthorization.controller.ts apps/api/src/controllers/authorizationRequest.controller.ts && rtk git commit -m "feat(overtime): enrich service-crew list and action responses with overtime block metadata"
```

---

## Task 7: Webhook — underbreak create on checkout

**Files:**
- Modify: `apps/api/src/services/webhook.service.ts`

- [ ] **Step 1: Locate the early_check_out creation block (lines ~1883-1909)**

In `webhook.service.ts`, find the block that creates `early_check_out` auth. The underbreak creation goes immediately after it (still within the same checkout handling block).

- [ ] **Step 2: Add the underbreak dep function to webhook deps interface**

Find the `AttendanceProcessorDeps` interface (or equivalent). Add:

```typescript
deleteUnderbreakAuthByShiftId: (shiftId: string) => Promise<boolean>;
```

- [ ] **Step 3: Add the deleteUnderbreakAuthByShiftId implementation to the default deps**

In the default deps object (near `deleteEarlyCheckOutAuthByShiftLogId` around line 1163):

```typescript
deleteUnderbreakAuthByShiftId: async (shiftId) => {
  const tenantDb = db.getDb();
  const auth = (await tenantDb('shift_authorizations')
    .where({ shift_id: shiftId, auth_type: 'underbreak' })
    .first()) as AttendanceShiftAuthorizationRow | null;
  if (!auth) {
    return false;
  }
  await tenantDb('shift_authorizations').where({ id: auth.id }).delete();
  if (auth.status === 'pending' && typeof auth.shift_id === 'string' && auth.shift_id.trim()) {
    await tenantDb('employee_shifts')
      .where({ id: auth.shift_id })
      .decrement('pending_approvals', 1);
  }
  return true;
},
```

- [ ] **Step 4: Add underbreak creation after the early_check_out block**

After the `early_check_out` auth creation block (after the socket emit at line ~1909), add:

```typescript
// Underbreak: generate if total ended break time < 60 minutes
const breakActivities = await deps.listEndedBreakActivitiesByShiftId(shift.id as string);
const totalBreakMinutes = breakActivities.reduce(
  (sum, a) => sum + (Number(a.duration_minutes) || 0),
  0,
);
if (totalBreakMinutes < 60) {
  const underbreakDiffMinutes = 60 - totalBreakMinutes;
  const underbreakAuth = await deps.createShiftAuthorization({
    company_id: branch.company_id,
    shift_id: shift.id as string,
    shift_log_id: log.id,
    branch_id: branch.id,
    user_id: (shift.user_id as string) ?? null,
    auth_type: 'underbreak',
    diff_minutes: underbreakDiffMinutes,
    needs_employee_reason: true,
    status: 'pending',
  });
  await deps.incrementShiftPendingApprovals(shift.id as string);
  if (shift.user_id) {
    await deps.createAndDispatchNotification({
      userId: shift.user_id as string,
      title: 'Underbreak - Reason Required',
      message: `Your recorded break time is ${totalBreakMinutes} min, which is less than the required 1 hour. Please submit a reason in the Authorization Requests tab.`,
      type: 'warning',
      linkUrl: '/account/schedule',
    });
  }
  deps.emitSocketEvent('shift:authorization-new', underbreakAuth as Record<string, unknown>);
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd apps/api && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
rtk git add apps/api/src/services/webhook.service.ts && rtk git commit -m "feat(underbreak): create underbreak auth on checkout when break < 60 min"
```

---

## Task 8: Webhook — delete underbreak on check-in

**Files:**
- Modify: `apps/api/src/services/webhook.service.ts`

- [ ] **Step 1: Locate the check-in block that calls deleteEarlyCheckOutAuthByShiftLogId (lines ~1816-1839)**

Find the block with the comment `"Retroactively void any early_check_out authorization created for the previous attendance's checkout"`.

- [ ] **Step 2: Add deleteUnderbreakAuthByShiftId call immediately after the early_check_out void block**

```typescript
// Void any underbreak auth from the previous checkout — employee is back, more breaks may occur
if (shift?.id) {
  const voidedUnderbreak = await deps.deleteUnderbreakAuthByShiftId(shift.id as string);
  if (voidedUnderbreak) {
    logger.info(
      { attendanceId: payload.id, shiftId: shift.id },
      'Voided underbreak authorization on re-check-in',
    );
    deps.emitSocketEvent('shift:authorization-voided', {
      shift_id: shift.id,
      branch_id: branch.id,
    });
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/api && pnpm tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
rtk git add apps/api/src/services/webhook.service.ts && rtk git commit -m "feat(underbreak): void underbreak auth on re-check-in"
```

---

## Task 9: Cron job — Odoo break work entry upsert on underbreak rejection

**Files:**
- Modify: `apps/api/src/services/shiftAuthorizationCron.service.ts`

- [ ] **Step 1: Read the current auto-reject handler in shiftAuthorizationCron.service.ts**

Open the file. Find `createShiftAuthorizationExpiryRunner`. Locate the loop that processes each expired auth and calls reject. Note where it calls the resolver.

- [ ] **Step 2: Add Odoo upsert call for underbreak rejections**

The existing job calls a resolver for each expired auth. Add a branch for `auth_type === 'underbreak'`:

```typescript
import { upsertBreakWorkEntry } from './odoo.service';

// Inside the per-auth processing loop, after the auth is auto-rejected:
if (auth.auth_type === 'underbreak') {
  // Resolve the employee's Odoo employee_id from the shift
  const shift = await db.getDb()('employee_shifts')
    .where({ id: auth.shift_id })
    .join('users', 'users.id', 'employee_shifts.user_id')
    .select('employee_shifts.started_at', 'users.odoo_employee_id')
    .first() as { started_at: Date; odoo_employee_id: number } | null;

  if (shift?.odoo_employee_id && shift.started_at) {
    const shiftDate = shift.started_at.toISOString().split('T')[0];
    await upsertBreakWorkEntry({
      employeeId: shift.odoo_employee_id,
      date: shiftDate,
      durationMinutes: 60,
    });
  }
}
```

Note: `upsertBreakWorkEntry` already handles the find-or-create logic and uses `BREAK_WORK_ENTRY_TYPE_ID = 129` internally. If an existing break entry is < 60 min, it updates it; if none exists, it creates one at 60 min; if already >= 60 min, the upsert is effectively a no-op (it won't reduce duration below what's already there — verify this matches `upsertBreakWorkEntry` implementation at lines 1291-1362 of `odoo.service.ts` and adjust if needed).

- [ ] **Step 3: Apply the same Odoo upsert for manual rejection of underbreak**

In `shiftAuthorizationResolution.service.ts`, in the reject resolver, add the same `upsertBreakWorkEntry` call after rejecting an `underbreak` auth (same code as above).

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd apps/api && pnpm tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
rtk git add apps/api/src/services/shiftAuthorizationCron.service.ts apps/api/src/services/shiftAuthorizationResolution.service.ts && rtk git commit -m "feat(underbreak): upsert Odoo break work entry to 60 min on underbreak rejection"
```

---

## Task 10: Shared types — add `underbreak` to ShiftAuthorizationType

**Files:**
- Modify: `packages/shared/src/` — find where `ShiftAuthorizationType` or `auth_type` union is defined

- [ ] **Step 1: Search for the type definition**

```bash
cd packages/shared && grep -r "early_check_out" src/ --include="*.ts" -l
```

- [ ] **Step 2: Add `'underbreak'` to the union**

Find the type (e.g. `type ShiftAuthorizationType = 'early_check_in' | 'tardiness' | ...`) and add `| 'underbreak'`.

- [ ] **Step 3: Verify shared package compiles**

```bash
cd packages/shared && pnpm tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
rtk git add packages/shared/src/ && rtk git commit -m "feat(shared): add underbreak to ShiftAuthorizationType"
```

---

## Task 11: Frontend — AuthorizationRequestsPage underbreak display config

**Files:**
- Modify: `apps/web/src/features/authorization-requests/AuthorizationRequestsPage.tsx`

- [ ] **Step 1: Locate the auth type config map in AuthorizationRequestsPage.tsx**

Find the object/map that defines label, icon, and color per `auth_type` (e.g. `AUTH_TYPE_CONFIG` or inline object). It currently has entries for `early_check_in`, `tardiness`, `early_check_out`, `late_check_out`, `overtime`, `interim_duty`.

- [ ] **Step 2: Add underbreak entry**

```typescript
underbreak: {
  label: 'Underbreak',
  icon: Coffee, // import Coffee from 'lucide-react'
  color: 'text-amber-600',
  bgColor: 'bg-amber-50',
  borderColor: 'border-amber-200',
},
```

Add `import { Coffee } from 'lucide-react';` if not already imported.

- [ ] **Step 3: Disable overtime Approve/Reject when overtime_blocked is true from API metadata**

Find the section that renders overtime auth action buttons. Add the disabled condition:

```typescript
const isOvertimeBlocked = auth.auth_type === 'overtime' && auth.overtime_blocked === true;
// Pass isOvertimeBlocked to the approve/reject button disabled prop
// Show helper text when blocked:
// auth.overtime_blocker_auth_types.map(t => AUTH_TYPE_CONFIG[t]?.label).join(', ')
```

Display message: `Resolve {blocker labels} before reviewing overtime.`

- [ ] **Step 4: Refetch service-crew list after any blocker auth is resolved**

Find the mutation/handler for approving/rejecting a service-crew auth. After a successful resolve, trigger a refetch of the service-crew request list so dependent overtime rows refresh.

In React Query terms:
```typescript
queryClient.invalidateQueries({ queryKey: ['authorization-requests', 'service-crew'] });
```

(Use whatever query key the service-crew list uses in this page.)

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd apps/web && pnpm tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
rtk git add apps/web/src/features/authorization-requests/AuthorizationRequestsPage.tsx && rtk git commit -m "feat(frontend): add underbreak display config; disable overtime when blocked via API metadata"
```

---

## Task 12: Frontend — EmployeeShiftsPage and ScheduleTab local overtime blocking

**Files:**
- Modify: `apps/web/src/features/employee-shifts/` — find EmployeeShiftsPage and ScheduleTab files

- [ ] **Step 1: Locate EmployeeShiftsPage and ScheduleTab**

```bash
find apps/web/src/features/employee-shifts -name "*.tsx" | head -20
```

- [ ] **Step 2: Add local overtime blocker derivation utility**

In both files (or extract to a shared util if both use it), derive overtime block state from local sibling auths:

```typescript
function isOvertimeBlocked(auths: Array<{ auth_type: string; status: string }>): {
  blocked: boolean;
  blockerLabels: string[];
} {
  const BLOCKER_TYPES = new Set(['tardiness', 'early_check_out', 'late_check_out', 'underbreak']);
  const AUTH_LABELS: Record<string, string> = {
    tardiness: 'Tardiness',
    early_check_out: 'Early Check Out',
    late_check_out: 'Late Check Out',
    underbreak: 'Underbreak',
  };
  const pendingBlockers = auths.filter(
    (a) => BLOCKER_TYPES.has(a.auth_type) && a.status === 'pending',
  );
  return {
    blocked: pendingBlockers.length > 0,
    blockerLabels: pendingBlockers.map((a) => AUTH_LABELS[a.auth_type] ?? a.auth_type),
  };
}
```

- [ ] **Step 3: Apply to overtime auth rows in EmployeeShiftsPage**

For each shift displayed, when rendering its overtime auth row:
```typescript
const shift = ...; // current shift with its authorizations array
const { blocked, blockerLabels } = isOvertimeBlocked(shift.authorizations ?? []);
// Disable Approve/Reject buttons when blocked
// Show: `Resolve ${blockerLabels.join(' and ')} before reviewing overtime.`
```

- [ ] **Step 4: Apply the same to ScheduleTab**

Same pattern as Step 3 for the ScheduleTab component.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd apps/web && pnpm tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
rtk git add apps/web/src/features/employee-shifts/ && rtk git commit -m "feat(frontend): derive overtime blocked state locally from sibling auths in EmployeeShiftsPage and ScheduleTab"
```

---

## Task 13: End-to-end verification

- [ ] **Step 1: Start the dev servers**

```bash
cd /home/phaeton/Projects/omnilert-website && pnpm up:dev
```

- [ ] **Step 2: Checkout scenario — break < 60 min**

Using a test employee shift where the employee has < 60 min of break in `shift_activities`:
1. Trigger checkout via Odoo or the endShift endpoint.
2. Confirm `shift_authorizations` has a new row with `auth_type = 'underbreak'`, `needs_employee_reason = true`, `status = 'pending'`.
3. Confirm the shift's `pending_approvals` incremented.

- [ ] **Step 3: Check-in after checkout**

Trigger a re-check-in on the same shift.
1. Confirm the `underbreak` auth row is deleted.
2. Confirm `pending_approvals` decremented.

- [ ] **Step 4: Re-checkout with still < 60 min break**

Trigger checkout again without logging a full hour of break.
1. Confirm a new `underbreak` auth is created.

- [ ] **Step 5: Overtime blocked by underbreak**

With a shift that has both a pending `underbreak` and a pending `overtime` auth:
1. Attempt `POST /api/v1/shift-authorizations/:id/approve` on the overtime auth.
2. Confirm `409` response with `overtime_blocker_auth_types` including `'underbreak'`.

- [ ] **Step 6: Resolve underbreak — approve path**

Approve the underbreak auth manually.
1. Confirm overtime becomes actionable (no 409).
2. Confirm no Odoo break work entry was created.

- [ ] **Step 7: Resolve underbreak — reject path**

Reject the underbreak auth manually (or wait for cron).
1. Confirm Odoo break work entry for type 129 on that date is at 60 min.
2. Confirm overtime reconciliation ran and `diff_minutes` is updated.

- [ ] **Step 8: AuthorizationRequestsPage UI**

1. Open the Authorization Requests page.
2. Confirm underbreak rows render with the Coffee icon and amber color.
3. Confirm overtime rows show Approve/Reject disabled with blocker message when sibling underbreak is pending.
4. Approve/reject a blocker auth, confirm overtime row refreshes automatically.

- [ ] **Step 9: EmployeeShiftsPage and ScheduleTab UI**

1. Navigate to a shift with pending underbreak and pending overtime.
2. Confirm overtime actions are disabled with the correct blocker helper text.
3. After resolving underbreak, confirm overtime becomes actionable.
