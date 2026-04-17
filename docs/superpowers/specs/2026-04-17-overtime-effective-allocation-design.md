# Overtime Effective Allocation Design

**Date:** 2026-04-17
**Status:** Approved

## Summary

Keep `employee_shifts.allocated_hours` as the raw scheduled duration (`shift_end - shift_start`), but treat one hour of that duration as a fixed allocated break for both business rules and detail-panel display.

This changes overtime authorization and peer evaluation eligibility to compare against:

- `netWorkedHours`
- `effectiveAllocatedHours = max(0, allocated_hours - 1)`

It also updates the shift detail panels to show:

- `Allocated Breaks: 1h`
- `Allocated Hours: shift.allocated_hours - 1h`

---

## Section 1 — Rule Changes

### Stored shift allocation

For normal scheduled shifts, `allocated_hours` continues to be calculated from:

- `shift_end - shift_start`

No database schema or stored value changes are needed.

### Allocated break

Introduce a fixed allocated break of `1 hour` for this workflow.

### Effective allocated hours

Define:

- `allocatedBreakHours = 1`
- `effectiveAllocatedHours = max(0, allocated_hours - allocatedBreakHours)`

### Net worked hours

Continue using:

- `netWorkedHours = grossWorkedHours - totalBreakHours`

where `totalBreakHours` comes from recorded completed break activity durations.

---

## Section 2 — Backend Behavior

File: `apps/api/src/services/webhook.service.ts`

Update both checkout-time eligibility checks to use the same threshold:

- Overtime authorization eligibility: `netWorkedHours > effectiveAllocatedHours`
- Peer evaluation eligibility: `netWorkedHours > effectiveAllocatedHours`

### Overtime authorization

At checkout:

1. Compute `grossWorkedHours` from the shift’s final worked-hours value.
2. Compute `totalBreakHours` from ended break activities.
3. Compute `netWorkedHours`.
4. Compute `effectiveAllocatedHours = max(0, allocated_hours - 1)`.
5. Create an overtime authorization only if:
   - one does not already exist for the same checkout log, and
   - `netWorkedHours > effectiveAllocatedHours`

### Overtime difference

Set overtime `diff_minutes` from:

- `Math.round((netWorkedHours - effectiveAllocatedHours) * 60)`

This aligns the stored overtime amount with the new threshold and with the frontend’s displayed allocated hours.

### Peer evaluation

Use the same `netWorkedHours > effectiveAllocatedHours` rule instead of comparing against the raw stored `allocated_hours - 1` inline.

---

## Section 3 — Frontend Detail Panels

Files:

- `apps/web/src/features/employee-shifts/pages/EmployeeShiftsPage.tsx`
- `apps/web/src/features/account/components/ScheduleTab.tsx`

Update the shift detail panel display to reflect the effective allocation rule:

- Add a new field: `Allocated Breaks`
- Its value is always `1h`
- Change `Allocated Hours` to display `max(0, shift.allocated_hours - 1)`

If a shift is stored with `allocated_hours = 8`, the UI should show:

- `Allocated Breaks: 1h`
- `Allocated Hours: 7h`

The existing `worked` display continues to show net worked time:

- `max(0, total_worked_hours - total_break_hours)`

---

## Section 4 — Edge Cases

- Clamp effective allocated hours with `max(0, allocated_hours - 1)` so very short shifts never display or compute negative allocation.
- Keep using recorded break totals only; no inferred break time is added.
- No API response shape changes are required because the UI can derive `Allocated Breaks` and effective `Allocated Hours` from existing fields.

---

## Section 5 — Testing

Update and extend `apps/api/src/services/webhook.service.test.ts` to cover:

- positive overtime creation when `netWorkedHours > effectiveAllocatedHours`
- positive peer evaluation eligibility when `netWorkedHours > effectiveAllocatedHours`
- no overtime authorization when gross worked hours are high enough but `netWorkedHours` is not above the effective allocation
- overtime `diff_minutes` computed from `netWorkedHours - effectiveAllocatedHours`

Frontend verification should confirm both detail panels render:

- `Allocated Breaks: 1h`
- `Allocated Hours: shift.allocated_hours - 1h`

---

## Files to Modify

### Backend

- `apps/api/src/services/webhook.service.ts` — overtime and peer evaluation threshold logic
- `apps/api/src/services/webhook.service.test.ts` — coverage for new threshold and overtime diff behavior

### Frontend

- `apps/web/src/features/employee-shifts/pages/EmployeeShiftsPage.tsx` — add `Allocated Breaks` row and show effective allocated hours
- `apps/web/src/features/account/components/ScheduleTab.tsx` — add `Allocated Breaks` row and show effective allocated hours
