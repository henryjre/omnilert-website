# Underbreak Authorization

**Date:** 2026-04-18
**Status:** Draft

## Context

Accurate worked-hour tracking requires that every shift records at least 1 hour of break. When an employee checks out with less than 60 minutes of break logged in `shift_activities`, there is no automated enforcement — the discrepancy silently skews paid-hour calculations and overtime derivation.

This spec introduces `underbreak` as a new `shift_authorizations` auth type. It follows the exact same create-on-checkout / delete-on-check-in lifecycle as `early_check_out`, integrates with the existing 24-hour employee-reason expiry job, and is added to the overtime blocker set so overtime cannot be reviewed until underbreak is resolved.

---

## Section 1 — Database

### Migration: add `underbreak` to the `auth_type` constraint

The `shift_authorizations.auth_type` column has a `CHECK` constraint listing allowed values. Extend it to include `'underbreak'`.

No new columns are needed — `diff_minutes`, `needs_employee_reason`, `employee_reason`, `status`, and `shift_log_id` already cover all required fields.

---

## Section 2 — Backend: Checkout (Webhook)

**File:** `apps/api/src/services/webhook.service.ts`

At the same point where `early_check_out` is generated on checkout:

1. Sum all ended `shift_activities` rows with `activity_type = 'break'` for the shift (`duration_minutes` where `end_time IS NOT NULL`).
2. If `totalBreakMinutes < 60`:
   - `diffMinutes = 60 - totalBreakMinutes`
   - Upsert a `shift_authorizations` row:
     - `auth_type: 'underbreak'`
     - `diff_minutes: diffMinutes`
     - `needs_employee_reason: true`
     - `status: 'pending'`
     - `shift_log_id`: the current checkout log id (same field used by `early_check_out`)
   - Increment `pending_approvals` on the shift if a new row was inserted (not updated).
3. If `totalBreakMinutes >= 60`, do nothing (no underbreak auth created).

**Note:** The break sum here uses only `shift_activities` records, not the Odoo-deducted `allocated_hours - 1h` constant. Odoo sync happens separately via `syncUncalculatedBreaksToWorkEntry`.

---

## Section 3 — Backend: Check-In (Webhook)

**File:** `apps/api/src/services/webhook.service.ts`

At the same point where `deleteEarlyCheckOutAuthByShiftLogId` is called on check-in, add a parallel call:

```
deleteUnderbreakAuthByShiftId(shiftId)
```

This deletes any existing `underbreak` auth for the shift (keyed by `shift_id`, not `shift_log_id`, because the employee may have checked out from a different log). If the deleted auth was `pending`, decrement `pending_approvals` on the shift.

---

## Section 4 — Backend: Auto-Reject (24-Hour Expiry Job)

**File:** wherever the existing 24h needs-employee-reason expiry job lives

The existing expiry job targets `shift_authorizations` where `needs_employee_reason = true`, `employee_reason IS NULL`, and the auth is older than 24 hours. `underbreak` rows will be picked up automatically by this query.

**On auto-reject of an underbreak auth:**

1. Fetch the shift's date and `company_id`.
2. Query Odoo for an existing break work entry (work entry type id = 129) for that employee on that date.
   - If found and `duration < 60 min`: update duration to `60 min`.
   - If not found: create a break work entry with `duration = 60 min`.
3. Set auth status to `'rejected'`, record `resolved_at`, clear `needs_employee_reason` flag.
4. Decrement `pending_approvals` on the shift.
5. Trigger overtime reconciliation for the shift (same hook used after other blocker auths resolve).

**On manual approval of an underbreak auth:**

No Odoo action. Accept that the employee had no/insufficient break. Set status to `'approved'`, decrement `pending_approvals`, trigger overtime reconciliation.

**On manual rejection of an underbreak auth (by manager, before expiry):**

Same Odoo upsert as auto-reject (step 2 above), then same status/counter/reconciliation steps.

---

## Section 5 — Overtime Blocker Integration

**File:** `apps/api/src/services/shiftAuthorizationResolution.service.ts` (or wherever blocker types are defined)

Add `'underbreak'` to the blocker auth types list alongside `tardiness`, `early_check_out`, and `late_check_out`.

Effect: overtime cannot be approved or rejected while any `underbreak` auth on the same shift is still `pending`. The existing reconciliation flow handles the rest — once underbreak resolves, overtime recalculates and becomes actionable.

---

## Section 6 — API & Frontend

### API
No new endpoints. The existing `shift_authorizations` list responses already include all auth types. The `overtime_blocked` / `overtime_blocker_auth_types` enrichment added by the overtime spec will automatically include `underbreak` once it is in the blocker set.

### Frontend
`AuthorizationRequestsPage.tsx` maps `auth_type` to display config (label, icon, color). Add an entry for `underbreak`:
- Label: `Underbreak`
- Icon: a break/pause icon (e.g. `Coffee` from Lucide)
- Color: amber or yellow (similar to tardiness)

`EmployeeShiftsPage` and `ScheduleTab` derive overtime blocking locally from sibling auths — they will automatically include `underbreak` once the blocker type list is updated.

No new permission keys are needed. Underbreak uses the same `AUTH_REQUEST_VIEW_PUBLIC` / `AUTH_REQUEST_MANAGE_PUBLIC` permissions as other service-crew shift auths.

---

## Section 7 — Test Plan

### Backend

- Checkout with 0 min break → underbreak created with `diff_minutes = 60`
- Checkout with 45 min break → underbreak created with `diff_minutes = 15`
- Checkout with exactly 60 min break → no underbreak created
- Checkout with 70 min break → no underbreak created
- Check-in after checkout with existing underbreak → underbreak deleted, `pending_approvals` decremented
- Re-checkout after check-in with still < 60 min break → new underbreak created
- Auto-reject after 24h with no employee reason:
  - No existing break work entry → Odoo creates one at 60 min
  - Existing break work entry at 30 min → Odoo updates it to 60 min
  - Existing break work entry already at 60 min+ → no-op or idempotent upsert
- Manual approval → no Odoo call, overtime reconciliation triggered
- Manual rejection → Odoo upsert, overtime reconciliation triggered
- Overtime approve/reject blocked while underbreak is pending → 409
- Underbreak resolved → overtime becomes actionable with recalculated minutes

### Frontend

- `AuthorizationRequestsPage` renders underbreak rows with correct label/icon/color
- Overtime actions disabled when underbreak is pending sibling auth
- Overtime actions enabled after underbreak is resolved

---

## Section 8 — Assumptions

- Break time is measured exclusively from `shift_activities` rows with `activity_type = 'break'` and `end_time IS NOT NULL`. Open/ongoing breaks at checkout time are not counted.
- The 1-hour break threshold is fixed (not per-schedule or per-company configurable).
- Odoo break work entry type id = 129 is stable across environments.
- There is no concept of a "final" checkout — underbreak follows the same create/delete cycle as `early_check_out` on every check-in/checkout event.
- Historical shifts with no underbreak auth are not retroactively affected.
- Underbreak is service-crew level only (same as other shift auths).
