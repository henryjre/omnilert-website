# Dependent Overtime Review And Disabled-State Flow

**Date:** 2026-04-18
**Status:** Approved

## Summary

Treat overtime as dependent on same-shift paid-window authorizations: `tardiness`, `early_check_out`, and `late_check_out`.

Behavior:

- Overtime may exist as a pending request before those blocker auths are resolved, but it is **not reviewable** while any blocker auth is still pending.
- Overtime minutes are recalculated from the shift's paid hours, not just raw checkout attendance:
  - start from actual `total_worked_hours`
  - subtract recorded break hours
  - apply resolved auth adjustments:
    - `tardiness approved` => add `diff_minutes`
    - `early_check_out rejected` => add `diff_minutes`
    - `late_check_out rejected` => subtract `diff_minutes`
  - compare that paid net time against `max(0, allocated_hours - 1 hour)`
- Once blocker auths are fully resolved, overtime becomes actionable with its final recalculated minutes.
- Historical stale overtime from before this rule ships is **not** auto-repaired; this change prevents new stale cases going forward.

---

## Section 1 - Backend Resolution And Enforcement

Add a shared overtime-dependency service that, for a shift, computes:

- pending blocker auth types
- current derived overtime minutes
- whether overtime is blocked

Use blocker types only:

- `tardiness`
- `early_check_out`
- `late_check_out`

Update shift-authorization approve/reject handling so:

- approving or rejecting an `overtime` auth returns `409` if any blocker auth on the same shift is still `pending`
- approving or rejecting a blocker auth triggers dependent overtime reconciliation for that shift

### Reconciliation rules

If blocker auths are still pending:

- keep any overtime auth in `pending`
- treat it as blocked for review
- allow provisional minute updates, but do not finalize it

If blocker auths are fully resolved and derived overtime minutes are `> 0`:

- create a pending overtime auth if missing
- or update the existing overtime auth's `diff_minutes`
- if an existing overtime auth was in `no_approval_needed`, move it back to `pending`

If blocker auths are fully resolved and derived overtime minutes are `<= 0`:

- set the overtime auth to `no_approval_needed`
- clear manager-resolution fields that only make sense for reviewed overtime:
  - `resolved_by`
  - `resolved_at`
  - `rejection_reason`
  - `overtime_type`

Keep employee reason data on overtime when reopening or recalculating; do not force the employee to resubmit the same reason.

Do not attempt automatic Odoo rollback for pre-existing stale overtime that was already resolved before rollout.

Leave peer-evaluation logic unchanged in this change.

---

## Section 2 - API And Interface Additions

Enrich service-crew authorization rows returned by the Authorization Requests list API with:

- `overtime_blocked: boolean`
- `overtime_blocker_auth_types: string[]`

Include the same overtime-block metadata in approve/reject responses for shift authorizations whenever the returned row is an overtime auth.

Reuse existing `no_approval_needed` status; no new authorization status is introduced.

---

## Section 3 - UI Behavior

In `EmployeeShiftsPage` and `ScheduleTab`, derive overtime blocking locally from `shift.authorizations`:

- overtime is blocked if any sibling `tardiness`, `early_check_out`, or `late_check_out` auth is still `pending`
- disable both overtime Approve and Reject actions while blocked
- show a helper message like: `Resolve Tardiness and Late Check Out before reviewing overtime.`

In `AuthorizationRequestsPage`, use backend-provided overtime-block metadata to:

- disable overtime Approve and Reject actions
- show the same blocker helper message

Keep non-overtime auth review behavior unchanged.

After approving or rejecting any service-crew auth in `AuthorizationRequestsPage`, refetch the service-crew request list so dependent overtime rows refresh even though the page does not consume shift-level sibling auth data or shift-authorization sockets.

---

## Section 4 - Test Plan

### Backend and service tests

- Case 1: no overtime at checkout, `tardiness` later approved, blocker set becomes clear, overtime auth is created for `30 min`
- Case 2: overtime exists at checkout for `30 min`, `tardiness` approved while `late_check_out` still pending keeps overtime blocked, then `late_check_out` rejected recalculates overtime to `1h` and makes it actionable
- `early_check_out rejected` increases derived overtime minutes correctly
- final derived overtime `<= 0` moves overtime to `no_approval_needed`
- direct overtime approve or reject API call while blockers are pending returns `409`

### Authorization list and controller tests

- overtime rows include `overtime_blocked` and `overtime_blocker_auth_types`
- blocker metadata changes after related auth resolution

### Web and UI tests

- `EmployeeShiftsPage` disables overtime actions and renders blocker helper text when sibling blocker auths are pending
- `ScheduleTab` does the same
- `AuthorizationRequestsPage` disables overtime actions from API metadata and refreshes dependent overtime state after blocker auth updates

---

## Section 5 - Assumptions

- Only `tardiness`, `early_check_out`, and `late_check_out` block overtime review.
- The disabled-state requirement applies on all manager review surfaces.
- This change is forward-safe: it prevents new stale overtime review orderings, but does not auto-correct already-stale historical overtime records from before rollout.
- Overtime remains a real auth row only when derived overtime is positive; there is no placeholder overtime row for shifts that still have pending blockers but currently derive `0` overtime.
