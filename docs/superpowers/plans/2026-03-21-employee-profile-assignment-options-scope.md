# Employee Profile Assignment Options Scope Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `employee.edit_work_profile` users load assignment options from the employee profiles flow without requiring `admin.manage_users`, while keeping user management on the admin-only endpoint.

**Architecture:** Add an employee-profile-scoped assignment-options route under `/employee-profiles` guarded by `EMPLOYEE_EDIT_WORK_PROFILE`, and point the employee profiles edit panel at that route. Leave `/users/assignment-options` unchanged for `UserManagementPage`.

**Tech Stack:** Express, React, TypeScript, node:test

---

## File Map

- Modify: `apps/api/src/routes/employeeProfile.routes.ts`
- Modify: `apps/api/src/controllers/employeeProfile.controller.ts`
- Create: `apps/api/src/routes/employeeProfile.routes.test.ts`
- Modify: `apps/web/src/features/employee-profiles/pages/EmployeeProfilesPage.tsx`

## Chunk 1: Backend Route

### Task 1: Add a failing backend route regression test

**Files:**
- Create: `apps/api/src/routes/employeeProfile.routes.test.ts`

- [ ] **Step 1: Write the failing test**

Assert that `employeeProfile.routes` exposes a `GET /assignment-options` route.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec node --import tsx --test src/routes/employeeProfile.routes.test.ts`
Expected: FAIL because the route does not exist yet.

- [ ] **Step 3: Add the minimal implementation**

Add:
- `employeeProfileController.assignmentOptions`
- `GET /assignment-options` in `employeeProfile.routes.ts`
- guard it with `requirePermission(PERMISSIONS.EMPLOYEE_EDIT_WORK_PROFILE)`
- reuse the same assignment-options data source used by user management

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec node --import tsx --test src/routes/employeeProfile.routes.test.ts`
Expected: PASS

## Chunk 2: Frontend Endpoint Wiring

### Task 2: Point employee profile editing at the employee-scoped endpoint

**Files:**
- Modify: `apps/web/src/features/employee-profiles/pages/EmployeeProfilesPage.tsx`

- [ ] **Step 1: Change the edit-panel fetch**

Update `enterWorkEditMode()` to call `/employee-profiles/assignment-options` instead of `/users/assignment-options`.

- [ ] **Step 2: Preserve user management scope**

Do not change `UserManagementPage.tsx`; it should continue using `/users/assignment-options`.

- [ ] **Step 3: Build-verify the frontend**

Run: `pnpm -C apps/web build`
Expected: exit 0

## Chunk 3: Verification

### Task 3: Run focused verification

**Files:**
- Test: `apps/api/src/routes/employeeProfile.routes.test.ts`

- [ ] **Step 1: Run the backend route test**

Run: `pnpm exec node --import tsx --test src/routes/employeeProfile.routes.test.ts`
Expected: PASS

- [ ] **Step 2: Run the API build**

Run: `pnpm -C apps/api build`
Expected: exit 0

- [ ] **Step 3: Run the web build**

Run: `pnpm -C apps/web build`
Expected: exit 0
