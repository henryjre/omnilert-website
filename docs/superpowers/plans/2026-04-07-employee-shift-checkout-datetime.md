# Employee Shift Checkout Date-Time Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let managers choose a checkout date-time in the second `EmployeeShiftsPage` confirmation step and send that timestamp to Odoo checkout, while keeping `ScheduleTab` behavior unchanged.

**Architecture:** Add a focused shared `DateTimePicker` component modeled after `DateRangePicker`, thread a selected `checkOutTime` through `EmployeeShiftsPage` state and request payload, and update `employeeShift.controller.endShift` to accept an optional timestamp override with a backward-compatible fallback. Protect the behavior with focused source-level regression tests.

**Tech Stack:** React, TypeScript, Node `node:test`, Express, existing Odoo service helpers

---

## Chunk 1: Backend Checkout Timestamp Override

### Task 1: Add controller regression coverage

**Files:**
- Create: `apps/api/test/employeeShiftCheckoutTimeOverride.test.mjs`
- Modify: `apps/api/src/controllers/employeeShift.controller.ts`
- Test: `apps/api/test/employeeShiftCheckoutTimeOverride.test.mjs`

- [ ] **Step 1: Write the failing test**

```javascript
test('employee shift end controller forwards provided checkOutTime to Odoo checkout', () => {
  assert.match(
    source,
    /const requestedCheckOutTime = req\.body\?\.checkOutTime;/,
  );
  assert.match(
    source,
    /const checkOutTime = requestedCheckOutTime \? new Date\(requestedCheckOutTime\) : new Date\(\);/,
  );
  assert.match(
    source,
    /await batchCheckOutAttendances\(\[Number\(lastCheckIn\.odoo_attendance_id\)\], checkOutTime\);/,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk .\apps\api\node_modules\.bin\tsx.cmd --test apps/api/test/employeeShiftCheckoutTimeOverride.test.mjs`
Expected: FAIL because the controller still hardcodes `new Date()` and has no `checkOutTime` handling.

- [ ] **Step 3: Write minimal implementation**

```typescript
const requestedCheckOutTime = req.body?.checkOutTime;
const checkOutTime = requestedCheckOutTime ? new Date(requestedCheckOutTime) : new Date();
if (Number.isNaN(checkOutTime.getTime())) {
  throw new AppError(400, 'Invalid checkOutTime');
}
await batchCheckOutAttendances([Number(lastCheckIn.odoo_attendance_id)], checkOutTime);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk .\apps\api\node_modules\.bin\tsx.cmd --test apps/api/test/employeeShiftCheckoutTimeOverride.test.mjs apps/api/test/employeeShiftEndPermission.test.mjs`
Expected: PASS

## Chunk 2: Frontend Picker And Request Wiring

### Task 2: Add page-level regression coverage

**Files:**
- Create: `apps/web/test/employeeShiftCheckoutDateTime.web.test.ts`
- Modify: `apps/web/src/features/employee-shifts/pages/EmployeeShiftsPage.tsx`
- Create: `apps/web/src/shared/components/ui/DateTimePicker.tsx`
- Test: `apps/web/test/employeeShiftCheckoutDateTime.web.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
test('EmployeeShiftsPage seeds checkout confirmation with shift_end and posts checkOutTime on confirm', () => {
  assert.match(source, /selectedCheckOutTime/);
  assert.match(source, /setEndShiftConfirm\(\{ shiftId, step: 1, checkOutTime:/);
  assert.match(source, /<DateTimePicker[\s\S]*value=\{endShiftConfirm\.checkOutTime\}/);
  assert.match(source, /api\.post\(`\/employee-shifts\/\$\{shiftId\}\/end`, \{ checkOutTime \}\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk .\apps\api\node_modules\.bin\tsx.cmd --test apps/web/test/employeeShiftCheckoutDateTime.web.test.ts`
Expected: FAIL because the page currently has no date-time picker or request body.

- [ ] **Step 3: Write minimal implementation**

```typescript
interface EndShiftConfirmState {
  shiftId: string;
  step: 1 | 2;
  checkOutTime: string;
}

const requestEndShift = (shiftId: string, defaultCheckOutTime: string) => {
  setEndShiftConfirm({ shiftId, step: 1, checkOutTime: defaultCheckOutTime });
};

await api.post(`/employee-shifts/${shiftId}/end`, { checkOutTime });
```

Create a `DateTimePicker` component that:

```tsx
<DateTimePicker
  value={endShiftConfirm.checkOutTime}
  onChange={(next) => setEndShiftConfirm((prev) => prev ? { ...prev, checkOutTime: next } : prev)}
/>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk .\apps\api\node_modules\.bin\tsx.cmd --test apps/web/test/employeeShiftCheckoutDateTime.web.test.ts apps/web/test/scheduleCheckoutButtonPlacement.web.test.ts`
Expected: PASS

## Chunk 3: Focused Verification

### Task 3: Verify the combined flow

**Files:**
- Modify: `apps/api/src/controllers/employeeShift.controller.ts`
- Modify: `apps/web/src/features/employee-shifts/pages/EmployeeShiftsPage.tsx`
- Create: `apps/web/src/shared/components/ui/DateTimePicker.tsx`
- Create: `apps/api/test/employeeShiftCheckoutTimeOverride.test.mjs`
- Create: `apps/web/test/employeeShiftCheckoutDateTime.web.test.ts`

- [ ] **Step 1: Run focused backend and frontend verification**

Run: `rtk .\apps\api\node_modules\.bin\tsx.cmd --test apps/api/test/employeeShiftEndPermission.test.mjs apps/api/test/employeeShiftCheckoutTimeOverride.test.mjs apps/web/test/scheduleCheckoutButtonPlacement.web.test.ts apps/web/test/employeeShiftCheckoutDateTime.web.test.ts`
Expected: PASS

- [ ] **Step 2: Review diff for scope**

Run: `rtk git diff -- apps/api/src/controllers/employeeShift.controller.ts apps/api/test/employeeShiftCheckoutTimeOverride.test.mjs apps/web/src/features/employee-shifts/pages/EmployeeShiftsPage.tsx apps/web/src/shared/components/ui/DateTimePicker.tsx apps/web/test/employeeShiftCheckoutDateTime.web.test.ts`
Expected: only checkout date-time override changes plus focused tests
