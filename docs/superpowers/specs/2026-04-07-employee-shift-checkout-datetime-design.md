# Employee Shift Checkout Date-Time Design

**Date:** 2026-04-07
**Status:** Approved

## Goal

Update the manager checkout flow on `EmployeeShiftsPage` so the second confirmation step lets the manager choose the employee's checkout date and time, then pass that selected value through the API to Odoo instead of always using the current time.

## Current State

- `EmployeeShiftsPage` uses a 2-step checkout confirmation modal.
- On final confirm, the page posts to `/employee-shifts/:id/end` without a request body.
- `employeeShift.controller.endShift` always calls `batchCheckOutAttendances(..., new Date())`.
- `ScheduleTab` also uses the same end-shift endpoint for self-service checkout.
- `DateRangePicker` already provides the visual reference for the desired picker style, but it is built for date ranges rather than a single date-time selection.

## Chosen Approach

Add a new shared single-value date-time picker component styled like `DateRangePicker`, and use it only in the second confirmation step of `EmployeeShiftsPage`.

The API route `/employee-shifts/:id/end` will accept an optional `checkOutTime` value. When provided, the backend will parse it and pass that exact timestamp to Odoo checkout. When omitted, the route will keep the existing fallback behavior so `ScheduleTab` remains unchanged.

## UX Behavior

### EmployeeShiftsPage checkout modal

- Step 1 remains unchanged.
- Step 2 adds a date-time picker above the warning box.
- The picker defaults to the selected shift's `shift_end`.
- There are no min/max restrictions on the chosen date or time.
- The final confirm action sends the selected date-time to the backend.

### Picker behavior

- The trigger and popover styling should feel consistent with `DateRangePicker`.
- The popover supports selecting a single calendar date plus a time value.
- The trigger label should display the currently selected date-time in a readable format.
- Clearing the value is not required in this flow because the field always has a default.

## API Contract

### Request

`POST /employee-shifts/:id/end`

Optional JSON body:

```json
{
  "checkOutTime": "2026-04-07T10:30:00.000Z"
}
```

### Backend rules

- If `checkOutTime` is present, parse it into a valid `Date`.
- If parsing fails, reject the request with a `400` error.
- If `checkOutTime` is missing, keep the existing behavior and use the current time.

## Proposed Code Structure

### Shared UI

Create a focused component in `apps/web/src/shared/components/ui/` for a single date-time value. It should:

- accept a controlled ISO string or `Date`-compatible value
- expose `onChange`
- render a calendar-style popover inspired by `DateRangePicker`
- include a time input inside the popover

Keep this component separate from `DateRangePicker` so the existing range-filter behavior stays simple and unchanged.

### EmployeeShiftsPage changes

- Extend the checkout confirmation state to store the selected checkout date-time.
- Seed that state from the chosen shift's `shift_end` when opening the confirmation flow.
- Render the new picker in the step-2 modal content.
- Update the final confirm request to send `{ checkOutTime }`.

### API controller changes

In `apps/api/src/controllers/employeeShift.controller.ts`:

- read `req.body.checkOutTime`
- parse it safely when present
- pass the selected date to `batchCheckOutAttendances`
- preserve the current fallback when the field is omitted

## Scope Boundaries

Included:

- manager checkout flow in `EmployeeShiftsPage`
- shared single date-time picker for this workflow
- backend support for optional checkout timestamp override

Not included:

- changes to `ScheduleTab`
- validation rules limiting checkout to shift bounds or current time
- broader reuse of the picker in other forms

## Testing Strategy

Add targeted source-level regression coverage for:

- `EmployeeShiftsPage` wiring the checkout confirmation flow to a selected checkout timestamp
- `employeeShift.controller.endShift` forwarding a provided `checkOutTime` to Odoo checkout
- `employeeShift.controller.endShift` keeping the current-time fallback when `checkOutTime` is absent

Prefer small focused tests over large rendered integration tests.

## Risks And Guardrails

- Do not change the self-checkout flow in `ScheduleTab`.
- Do not overload `DateRangePicker` with single-date-time behavior.
- Keep the API backward compatible by making `checkOutTime` optional.
- Make invalid date input fail clearly rather than silently falling back.
