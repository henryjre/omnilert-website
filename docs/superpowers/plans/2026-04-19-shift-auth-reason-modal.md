# Shift Auth Reason Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow employees to submit (or view) their authorization reason directly from a notification modal, and add missing notifications for `early_check_in` and `interim_duty` auth types.

**Architecture:** New `GET /account/shift-authorizations/:id` endpoint returns auth + shift summary; `link_url` on all "reason required" notifications is updated to include `authId`; a new `ShiftAuthReasonModal` component fetches and renders auth details + reason form; TopBar and EmployeeNotificationsTab both detect `authId` in notification links and open the modal.

**Tech Stack:** Express 4 / TypeScript (API), React 18 / Tailwind CSS 3 / Framer Motion / Zustand (web), `AnimatedModal` shared component, `api.client` for HTTP.

---

## File Map

| File | Change |
|---|---|
| `apps/api/src/controllers/account.controller.ts` | Add `getShiftAuthorizationById` function |
| `apps/api/src/routes/account.routes.ts` | Register `GET /shift-authorizations/:id` |
| `apps/api/src/services/attendanceQueue.service.ts` | Add `createAndDispatchNotification` import + call after `early_check_in` auth creation; add `dispatchNotification` dep |
| `apps/api/src/services/webhook.service.ts` | Append `&authId=` to all 5 existing "reason required" `linkUrl`s; add notification for `interim_duty` auth creation |
| `apps/web/src/features/account/components/ShiftAuthReasonModal.tsx` | Create — new modal component |
| `apps/web/src/features/dashboard/components/TopBar.tsx` | Add `getAuthId` helper + `reasonModalAuthId` state + modal render |
| `apps/web/src/features/account/components/EmployeeNotificationsTab.tsx` | Add `getAuthId` helper + `reasonModalAuthId` state + "View Authorization" button + modal render |

---

## Task 1: New API endpoint — GET /account/shift-authorizations/:id

**Files:**
- Modify: `apps/api/src/controllers/account.controller.ts`
- Modify: `apps/api/src/routes/account.routes.ts`

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/controllers/account.controller.test.ts` (or create it if absent — check with `ls apps/api/src/controllers/`). The test uses the existing test DB setup pattern in the project (look at `shiftAuthorization.controller.test.ts` for the pattern).

```typescript
// In the relevant describe block for account controller
describe('GET /account/shift-authorizations/:id', () => {
  it('returns 404 when auth does not exist', async () => {
    const res = await request(app)
      .get('/api/v1/account/shift-authorizations/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(res.status).toBe(404);
  });

  it('returns 403 when auth belongs to another user', async () => {
    // otherUserAuthId is an auth belonging to a different user
    const res = await request(app)
      .get(`/api/v1/account/shift-authorizations/${otherUserAuthId}`)
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(res.status).toBe(403);
  });

  it('returns auth + shift for the owning employee', async () => {
    const res = await request(app)
      .get(`/api/v1/account/shift-authorizations/${ownAuthId}`)
      .set('Authorization', `Bearer ${employeeToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: ownAuthId,
      auth_type: expect.any(String),
      shift: {
        id: expect.any(String),
        shift_start: expect.any(String),
        shift_end: expect.any(String),
        branch_name: expect.any(String),
      },
    });
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/api && pnpm test -- --testPathPattern="account.controller"
```

Expected: failing — route does not exist yet.

- [ ] **Step 3: Add the controller function**

In `apps/api/src/controllers/account.controller.ts`, add at the bottom (before the final export if any):

```typescript
export async function getShiftAuthorizationById(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const { id } = req.params;
    const tenantDb = db.getDb();

    const auth = await tenantDb('shift_authorizations').where({ id }).first();
    if (!auth) throw new AppError(404, 'Authorization not found');
    if (auth.user_id !== userId) throw new AppError(403, 'Not your authorization');

    const shift = await tenantDb('employee_shifts as es')
      .leftJoin('branches as b', 'b.id', 'es.branch_id')
      .where({ 'es.id': auth.shift_id })
      .select(
        'es.id',
        'es.shift_start',
        'es.shift_end',
        'es.status',
        'es.duty_type',
        'es.duty_color',
        'es.employee_name',
        'es.employee_avatar_url',
        'es.pending_approvals',
        'es.total_worked_hours',
        'b.name as branch_name',
      )
      .first();

    const resolvedByName: string | null = auth.resolved_by
      ? await tenantDb('users')
          .where({ id: auth.resolved_by })
          .select(tenantDb.raw("CONCAT(first_name, ' ', last_name) as name"))
          .first()
          .then((u: any) => u?.name ?? null)
      : null;

    res.json({
      success: true,
      data: {
        id: auth.id,
        auth_type: auth.auth_type,
        diff_minutes: auth.diff_minutes,
        status: auth.status,
        employee_reason: auth.employee_reason ?? null,
        needs_employee_reason: auth.needs_employee_reason,
        rejection_reason: auth.rejection_reason ?? null,
        created_at: auth.created_at,
        resolved_at: auth.resolved_at ?? null,
        resolved_by_name: resolvedByName,
        shift: shift ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
}
```

- [ ] **Step 4: Register the route**

In `apps/api/src/routes/account.routes.ts`, add after the notifications block (before `export default`):

```typescript
router.get(
  '/shift-authorizations/:id',
  requirePermission(PERMISSIONS.ACCOUNT_MANAGE_SCHEDULE),
  accountController.getShiftAuthorizationById,
);
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd apps/api && pnpm test -- --testPathPattern="account.controller"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add apps/api/src/controllers/account.controller.ts apps/api/src/routes/account.routes.ts
rtk git commit -m "feat: add GET /account/shift-authorizations/:id endpoint"
```

---

## Task 2: Add missing early_check_in notification

**Files:**
- Modify: `apps/api/src/services/attendanceQueue.service.ts`

- [ ] **Step 1: Write the failing test**

In `apps/api/src/services/attendanceQueue.service.test.ts`, find or add a test for the job processor. Look for the describe block around `createEarlyCheckInJobProcessor`. Add:

```typescript
it('dispatches a notification after creating the authorization', async () => {
  const dispatchNotification = jest.fn().mockResolvedValue(undefined);

  const processor = createEarlyCheckInJobProcessor({
    findShiftById: async () => ({
      id: 'shift-1',
      shift_start: new Date(Date.now() + 3_600_000).toISOString(),
      user_id: 'user-1',
    }),
    findShiftLogById: async () => ({ id: 'log-1', event_time: new Date().toISOString() }),
    findExistingAuthorization: async () => null,
    createShiftAuthorization: async () => ({ id: 'auth-1', shift_id: 'shift-1' }),
    incrementShiftPendingApprovals: jest.fn().mockResolvedValue(undefined),
    emitSocketEvent: jest.fn(),
    logInfo: jest.fn(),
    dispatchNotification,
  });

  await processor({
    id: 'job-1',
    data: {
      companyId: 'company-1',
      branchId: 'branch-1',
      shiftId: 'shift-1',
      shiftLogId: 'log-1',
      userId: 'user-1',
      checkInEventTime: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    },
  });

  expect(dispatchNotification).toHaveBeenCalledWith(
    expect.objectContaining({
      userId: 'user-1',
      title: 'Early Check In - Reason Required',
      type: 'warning',
    }),
  );
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/api && pnpm test -- --testPathPattern="attendanceQueue"
```

Expected: failing — `dispatchNotification` dep does not exist yet.

- [ ] **Step 3: Add dispatchNotification to the deps interface and implementation**

In `apps/api/src/services/attendanceQueue.service.ts`:

1. Add import at top:
```typescript
import { createAndDispatchNotification } from './notification.service.js';
```

2. Add to `EarlyCheckInJobProcessorDeps` interface:
```typescript
  dispatchNotification: (input: {
    userId: string;
    title: string;
    message: string;
    type: 'info' | 'success' | 'danger' | 'warning';
    linkUrl: string;
  }) => Promise<void>;
```

3. Add to `defaultEarlyCheckInJobProcessorDeps`:
```typescript
  dispatchNotification: async (input) => {
    await createAndDispatchNotification(input);
  },
```

4. After `deps.emitSocketEvent('shift:authorization-new', auth);` in the processor, add:

```typescript
    if (payload.userId) {
      await deps.dispatchNotification({
        userId: payload.userId,
        title: 'Early Check In - Reason Required',
        message: `You checked in early for your shift. Please submit a reason in the Authorization Requests tab.`,
        type: 'warning',
        linkUrl: `/account/schedule?shiftId=${String(auth.shift_id)}&authId=${String(auth.id)}`,
      });
    }
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/api && pnpm test -- --testPathPattern="attendanceQueue"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/api/src/services/attendanceQueue.service.ts
rtk git commit -m "feat: add notification dispatch for early_check_in authorization"
```

---

## Task 3: Update webhook notifications — add authId to linkUrl + interim_duty notification

**Files:**
- Modify: `apps/api/src/services/webhook.service.ts`

- [ ] **Step 1: Write the failing test**

In `apps/api/src/services/webhook.service.test.ts`, find the test covering the `interim_duty` authorization creation path. Add an assertion that a notification is dispatched:

```typescript
it('dispatches a notification when interim_duty authorization is created', async () => {
  // Find the test that covers interim duty check-in. Add this assertion after the auth creation:
  expect(deps.createAndDispatchNotification).toHaveBeenCalledWith(
    expect.objectContaining({
      title: 'Interim Duty - Reason Required',
      type: 'warning',
    }),
  );
});
```

Also add/update tests for the existing "reason required" notifications to assert `linkUrl` contains `authId`:

```typescript
it('includes authId in linkUrl for tardiness notification', async () => {
  expect(deps.createAndDispatchNotification).toHaveBeenCalledWith(
    expect.objectContaining({
      title: 'Tardiness Authorization Required',
      linkUrl: expect.stringMatching(/authId=/),
    }),
  );
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/api && pnpm test -- --testPathPattern="webhook.service"
```

Expected: failing on `authId` assertions.

- [ ] **Step 3: Update tardiness notification linkUrl**

Find this block in `webhook.service.ts` (~line 1877):
```typescript
await deps.createAndDispatchNotification({
  userId: shift.user_id as string,
  title: 'Tardiness Authorization Required',
  message: `You checked in ${formatDiffMinutes(absDiff)} late for your shift. Please submit a reason in the Authorization Requests tab.`,
  type: 'warning',
  linkUrl: '/account/schedule',
});
```

Replace with:
```typescript
await deps.createAndDispatchNotification({
  userId: shift.user_id as string,
  title: 'Tardiness Authorization Required',
  message: `You checked in ${formatDiffMinutes(absDiff)} late for your shift. Please submit a reason in the Authorization Requests tab.`,
  type: 'warning',
  linkUrl: `/account/schedule?shiftId=${String(shift.id)}&authId=${String((auth as any).id)}`,
});
```

- [ ] **Step 4: Update early_check_out notification linkUrl**

Find (~line 1906):
```typescript
await deps.createAndDispatchNotification({
  userId: shift.user_id as string,
  title: 'Early Check Out - Reason Required',
  message: `You checked out ${formatDiffMinutes(diffMinutes)} before your scheduled shift end. Please submit a reason in the Authorization Requests tab.`,
  type: 'warning',
  linkUrl: '/account/schedule',
});
```

Replace with:
```typescript
await deps.createAndDispatchNotification({
  userId: shift.user_id as string,
  title: 'Early Check Out - Reason Required',
  message: `You checked out ${formatDiffMinutes(diffMinutes)} before your scheduled shift end. Please submit a reason in the Authorization Requests tab.`,
  type: 'warning',
  linkUrl: `/account/schedule?shiftId=${String(shift.id)}&authId=${String((auth as any).id)}`,
});
```

- [ ] **Step 5: Update late_check_out notification linkUrl**

Find (~line 1930):
```typescript
await deps.createAndDispatchNotification({
  userId: shift.user_id as string,
  title: 'Late Check Out - Reason Required',
  message: `You checked out ${formatDiffMinutes(absDiff)} after your scheduled shift end. Please submit a reason in the Authorization Requests tab.`,
  type: 'warning',
  linkUrl: '/account/schedule',
});
```

Replace with:
```typescript
await deps.createAndDispatchNotification({
  userId: shift.user_id as string,
  title: 'Late Check Out - Reason Required',
  message: `You checked out ${formatDiffMinutes(absDiff)} after your scheduled shift end. Please submit a reason in the Authorization Requests tab.`,
  type: 'warning',
  linkUrl: `/account/schedule?shiftId=${String(shift.id)}&authId=${String((auth as any).id)}`,
});
```

- [ ] **Step 6: Update underbreak notification linkUrl**

Find (~line 1962):
```typescript
await deps.createAndDispatchNotification({
  userId: shift.user_id as string,
  title: 'Underbreak - Reason Required',
  message: `Your recorded break time is ${totalBreakMinutes} min, which is less than the required 1 hour. Please submit a reason in the Authorization Requests tab.`,
  type: 'warning',
  linkUrl: '/account/schedule',
});
```

Replace with:
```typescript
await deps.createAndDispatchNotification({
  userId: shift.user_id as string,
  title: 'Underbreak - Reason Required',
  message: `Your recorded break time is ${totalBreakMinutes} min, which is less than the required 1 hour. Please submit a reason in the Authorization Requests tab.`,
  type: 'warning',
  linkUrl: `/account/schedule?shiftId=${String(shift.id)}&authId=${String((underbreakAuth as any).id)}`,
});
```

- [ ] **Step 7: Add interim_duty notification**

Find the block where `interimDutyAuth` is created (~line 1683). After `deps.emitSocketEvent('shift:authorization-new', interimDutyAuth as Record<string, unknown>);`, add:

```typescript
if (interimShift.user_id) {
  await deps.createAndDispatchNotification({
    userId: interimShift.user_id as string,
    title: 'Interim Duty - Reason Required',
    message: `You have been assigned an interim duty shift. Please submit a reason in the Authorization Requests tab.`,
    type: 'warning',
    linkUrl: `/account/schedule?shiftId=${String(interimShift.id)}&authId=${String((interimDutyAuth as any).id)}`,
  });
}
```

- [ ] **Step 8: Run tests to confirm they pass**

```bash
cd apps/api && pnpm test -- --testPathPattern="webhook.service"
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
rtk git add apps/api/src/services/webhook.service.ts
rtk git commit -m "feat: add authId to notification linkUrls and interim_duty notification"
```

---

## Task 4: ShiftAuthReasonModal component

**Files:**
- Create: `apps/web/src/features/account/components/ShiftAuthReasonModal.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { AnimatedModal } from '@/shared/components/ui/AnimatedModal';
import { Spinner } from '@/shared/components/ui/Spinner';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { api } from '@/shared/services/api.client';
import { MapPin, X } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShiftAuthData {
  id: string;
  auth_type: string;
  diff_minutes: number;
  status: string;
  employee_reason: string | null;
  needs_employee_reason: boolean;
  rejection_reason: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by_name: string | null;
  shift: {
    id: string;
    shift_start: string;
    shift_end: string;
    status: string;
    duty_type: string | null;
    duty_color: number | null;
    branch_name: string | null;
    employee_name: string | null;
    employee_avatar_url: string | null;
    pending_approvals: number;
  } | null;
}

interface ShiftAuthReasonModalProps {
  authId: string;
  onClose: () => void;
  onReasonSubmitted?: (updatedAuth: any) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DUTY_COLORS: Record<number, string> = {
  1: '#FF9C9C',
  2: '#F7C698',
  7: '#89E1DB',
  8: '#97A6F9',
};

const AUTH_TYPE_LABELS: Record<string, string> = {
  early_check_in: 'Early Check In',
  tardiness: 'Tardiness',
  early_check_out: 'Early Check Out',
  late_check_out: 'Late Check Out',
  overtime: 'Overtime',
  interim_duty: 'Interim Duty',
  underbreak: 'Underbreak',
};

const STATUS_VARIANT: Record<string, 'success' | 'danger' | 'warning'> = {
  approved: 'success',
  rejected: 'danger',
  pending: 'warning',
};

function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

function fmtDiff(authType: string, minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const duration = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
  switch (authType) {
    case 'tardiness': return `${duration} late`;
    case 'early_check_in': return `${duration} early`;
    case 'early_check_out': return `${duration} before shift end`;
    case 'late_check_out': return `${duration} after shift end`;
    case 'underbreak': return `${minutes}m break (${minutes}m short of 1h)`;
    default: return `${duration}`;
  }
}

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ShiftAuthReasonModal({ authId, onClose, onReasonSubmitted }: ShiftAuthReasonModalProps) {
  const [data, setData] = useState<ShiftAuthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setFetchError(null);
    api
      .get(`/account/shift-authorizations/${authId}`)
      .then((res) => setData(res.data.data))
      .catch((err: any) => {
        setFetchError(
          err?.response?.data?.error ??
          err?.response?.data?.message ??
          'Failed to load authorization details.',
        );
      })
      .finally(() => setLoading(false));
  }, [authId]);

  const handleSubmit = async () => {
    if (!reason.trim() || !data) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await api.post(`/shift-authorizations/${authId}/reason`, { reason: reason.trim() });
      const updated = res.data.data;
      setData((prev) => prev ? { ...prev, employee_reason: updated.employee_reason } : prev);
      onReasonSubmitted?.(updated);
    } catch (err: any) {
      setSubmitError(
        err?.response?.data?.error ??
        err?.response?.data?.message ??
        'Failed to submit reason.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const authLabel = data ? (AUTH_TYPE_LABELS[data.auth_type] ?? data.auth_type) : '';
  const isReadOnly = Boolean(data?.employee_reason);
  const shift = data?.shift ?? null;
  const dutyColor = shift?.duty_color ? (DUTY_COLORS[shift.duty_color] ?? '#e5e7eb') : '#e5e7eb';

  return (
    <AnimatedModal onBackdropClick={onClose} maxWidth="max-w-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            {loading ? 'Authorization' : authLabel}
          </h2>
          {data && (
            <p className="text-xs text-gray-500 mt-0.5">
              {fmtDiff(data.auth_type, data.diff_minutes)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <Badge variant={STATUS_VARIANT[data.status] ?? 'warning'}>
              {data.status.charAt(0).toUpperCase() + data.status.slice(1)}
            </Badge>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="max-h-[70vh] overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : fetchError ? (
          <div className="px-5 py-8 text-center text-sm text-red-600">{fetchError}</div>
        ) : data ? (
          <div className="space-y-4 px-5 py-4">
            {/* Shift Summary */}
            {shift && (
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                  <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Shift Summary
                  </span>
                </div>
                <div className="px-4 py-3">
                  {/* Employee row */}
                  <div className="flex items-center gap-3 mb-3">
                    {shift.employee_avatar_url && !avatarError ? (
                      <img
                        src={shift.employee_avatar_url}
                        alt={shift.employee_name ?? ''}
                        className="h-10 w-10 rounded-full object-cover shrink-0"
                        onError={() => setAvatarError(true)}
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-600 shrink-0">
                        {getInitials(shift.employee_name)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {shift.employee_name ?? '—'}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        {shift.duty_type && (
                          <span
                            className="rounded-full px-2 py-0.5 text-xs font-medium text-gray-800"
                            style={{ backgroundColor: dutyColor }}
                          >
                            {shift.duty_type}
                          </span>
                        )}
                        {shift.branch_name && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <MapPin className="h-3 w-3" />
                            {shift.branch_name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Times */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">Shift Start</p>
                      <p className="mt-0.5 font-medium text-gray-800">{fmtDateTime(shift.shift_start)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">Shift End</p>
                      <p className="mt-0.5 font-medium text-gray-800">{fmtDateTime(shift.shift_end)}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Authorization details */}
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  Authorization
                </span>
              </div>
              <div className="px-4 py-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Type</span>
                  <span className="font-medium text-gray-900">{authLabel}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Variance</span>
                  <span className="font-medium text-gray-900">{fmtDiff(data.auth_type, data.diff_minutes)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Submitted</span>
                  <span className="text-gray-700">{fmtDateTime(data.created_at)}</span>
                </div>
                {data.resolved_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">
                      {data.status === 'rejected' ? 'Rejected' : 'Approved'} by
                    </span>
                    <span className="text-gray-700">
                      {data.resolved_by_name ?? '—'}
                    </span>
                  </div>
                )}
                {data.rejection_reason && (
                  <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                    <span className="font-semibold">Rejection reason: </span>
                    {data.rejection_reason}
                  </div>
                )}
              </div>
            </div>

            {/* Reason section */}
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  Your Reason
                </span>
              </div>
              <div className="px-4 py-3">
                {isReadOnly ? (
                  <p className="text-sm text-gray-700 whitespace-pre-wrap rounded-md bg-gray-50 border border-gray-200 px-3 py-2">
                    {data.employee_reason}
                  </p>
                ) : (
                  <div className="space-y-2">
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Explain the reason for this authorization…"
                      rows={3}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-200 resize-none"
                    />
                    {submitError && (
                      <p className="text-xs text-red-600">{submitError}</p>
                    )}
                    <Button
                      variant="primary"
                      className="w-full"
                      disabled={!reason.trim() || submitting}
                      onClick={handleSubmit}
                    >
                      {submitting ? 'Submitting…' : 'Submit Reason'}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AnimatedModal>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && pnpm exec tsc --noEmit 2>&1 | head -40
```

Expected: no errors in `ShiftAuthReasonModal.tsx`.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/web/src/features/account/components/ShiftAuthReasonModal.tsx
rtk git commit -m "feat: add ShiftAuthReasonModal component"
```

---

## Task 5: Wire modal into TopBar

**Files:**
- Modify: `apps/web/src/features/dashboard/components/TopBar.tsx`

- [ ] **Step 1: Add getAuthId helper, state, and modal**

In `TopBar.tsx`:

1. After the existing `getShiftExchangeId` helper (~line 26), add:

```typescript
function getAuthId(linkUrl: string | null | undefined): string | null {
  if (!linkUrl) return null;
  const match = linkUrl.match(/[?&]authId=([0-9a-f-]{36})/i);
  return match?.[1] ?? null;
}
```

2. Add import at the top of the file with other imports:

```typescript
import { ShiftAuthReasonModal } from '@/features/account/components/ShiftAuthReasonModal';
```

3. Inside the `TopBar` function, after the existing `useState` declarations (~line 63), add:

```typescript
const [reasonModalAuthId, setReasonModalAuthId] = useState<string | null>(null);
```

4. In `handleClickNotification`, before the existing `shiftId` check, add:

```typescript
const authId = getAuthId(n.link_url);
if (authId) {
  setOpen(false);
  setReasonModalAuthId(authId);
  return;
}
```

5. At the bottom of the `TopBar` return JSX, just before the closing `</header>` tag, add:

```tsx
<AnimatePresence>
  {reasonModalAuthId && (
    <ShiftAuthReasonModal
      authId={reasonModalAuthId}
      onClose={() => setReasonModalAuthId(null)}
    />
  )}
</AnimatePresence>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && pnpm exec tsc --noEmit 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/web/src/features/dashboard/components/TopBar.tsx
rtk git commit -m "feat: open ShiftAuthReasonModal from TopBar notification bell"
```

---

## Task 6: Wire modal into EmployeeNotificationsTab

**Files:**
- Modify: `apps/web/src/features/account/components/EmployeeNotificationsTab.tsx`

- [ ] **Step 1: Add getAuthId helper, import, state, button, and modal**

In `EmployeeNotificationsTab.tsx`:

1. After the existing `getPeerEvaluationId` helper (~line 90), add:

```typescript
function getAuthId(linkUrl: string | null | undefined): string | null {
  if (!linkUrl) return null;
  const match = linkUrl.match(/[?&]authId=([0-9a-f-]{36})/i);
  return match?.[1] ?? null;
}
```

2. Add import at the top with other imports:

```typescript
import { ShiftAuthReasonModal } from './ShiftAuthReasonModal';
```

3. Inside `EmployeeNotificationsTab`, after `const [peerEvalId, setPeerEvalId] = useState<string | null>(null);`, add:

```typescript
const [reasonModalAuthId, setReasonModalAuthId] = useState<string | null>(null);
```

4. In the notification card map block, after the `const shiftId = getShiftId(n.link_url);` line (~line 336), add:

```typescript
const authId = getAuthId(n.link_url);
```

5. In the action buttons section, after the `{shiftId && (` block and before the `{requestId && (` block, add:

```tsx
{authId && (
  <Button
    variant="secondary"
    size="sm"
    onClick={() => {
      if (!n.is_read) { void markAsRead(n.id); }
      setReasonModalAuthId(authId);
    }}
    className="text-xs"
  >
    View Authorization
  </Button>
)}
```

6. Also update the existing `{shiftId && (` button to only show when there is NO `authId` (so we don't show two buttons for the same notification):

```tsx
{shiftId && !authId && (
  <Button
    variant="secondary"
    size="sm"
    onClick={() => {
      if (!n.is_read) { void markAsRead(n.id); }
      navigate(n.link_url ?? `/account/schedule?shiftId=${shiftId}`);
    }}
    className="text-xs"
  >
    View Shift
  </Button>
)}
```

7. At the bottom of the component, before the closing `</div>`, after the `<PeerEvaluationModal>` block, add:

```tsx
<AnimatePresence>
  {reasonModalAuthId && (
    <ShiftAuthReasonModal
      authId={reasonModalAuthId}
      onClose={() => setReasonModalAuthId(null)}
    />
  )}
</AnimatePresence>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && pnpm exec tsc --noEmit 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/web/src/features/account/components/EmployeeNotificationsTab.tsx
rtk git commit -m "feat: open ShiftAuthReasonModal from EmployeeNotificationsTab"
```

---

## Task 7: Manual smoke test

- [ ] **Step 1: Start dev servers**

```bash
pnpm up:dev
```

- [ ] **Step 2: Trigger a tardiness authorization**

Check in to a shift late via Odoo or simulate via a direct DB insert, confirm a notification arrives in the TopBar bell with `linkUrl` containing `authId`.

- [ ] **Step 3: Click the notification in the TopBar bell**

Expected: dropdown closes, `ShiftAuthReasonModal` opens showing shift summary + auth details + reason textarea.

- [ ] **Step 4: Submit a reason**

Type a reason and click "Submit Reason". Expected: textarea replaced by read-only reason display, no navigation change.

- [ ] **Step 5: Re-open the modal**

Navigate to `/account/notifications`, find the same notification, click "View Authorization". Expected: modal opens in read-only mode (reason already filled).

- [ ] **Step 6: Commit if any fixes were needed**

```bash
rtk git add -p
rtk git commit -m "fix: smoke test corrections for shift auth reason modal"
```

---

## Self-Review Notes

- All 6 auth types covered: 4 existing in webhook (tardiness, early_check_out, late_check_out, underbreak) + interim_duty (new notification) + early_check_in (attendanceQueue).
- `getAuthId` helper is duplicated in TopBar and EmployeeNotificationsTab — acceptable since they're in separate files with no shared utility layer for this pattern (consistent with `getShiftId` / `getShiftExchangeId` being duplicated in those same two files today).
- The `shiftId && !authId` guard in EmployeeNotificationsTab prevents two action buttons on the same notification card.
- `resolved_by_name` lookup in the new endpoint does a single extra query only when `resolved_by` is not null — acceptable for an employee-facing detail endpoint with no pagination concern.
- `fmtDiff` for `underbreak` in the modal shows the raw shortfall minutes; matches the notification message wording.
