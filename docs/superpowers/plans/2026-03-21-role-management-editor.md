# Role Management Editor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full right-side role editor that can update role name, color, priority, and permissions with unsaved-change protection.

**Architecture:** Keep the current left-side role list and convert the right-side card into a draft-based editor seeded from the selected role plus its permissions. Reuse the existing `PUT /roles/:id` and `PUT /roles/:id/permissions` endpoints behind one save action, and relax the backend restriction that currently blocks system-role renames.

**Tech Stack:** React, TypeScript, Express, Knex, node:test, existing shared UI components

---

## File Map

- Modify: `apps/web/src/features/roles/pages/RoleManagementPage.tsx`
  - Turn the right card into a full editor with draft state, dirty tracking, and discard confirmation.
- Create: `apps/web/src/features/roles/pages/roleEditorState.ts`
  - Hold pure helpers for draft creation, dirty detection, and save payload comparisons.
- Test: `apps/web/test/roleEditorState.web.test.ts`
  - Cover dirty tracking and field normalization.
- Modify: `apps/api/src/controllers/role.controller.ts`
  - Allow system-role metadata updates and keep delete restrictions unchanged.
- Create: `apps/api/src/controllers/roleUpdatePolicy.ts`
  - Hold pure update-policy helpers used by the controller.
- Test: `apps/api/src/controllers/roleUpdatePolicy.test.ts`
  - Cover system-role edit allowance and update payload shaping.

## Chunk 1: Backend Role Update Policy

### Task 1: Add a failing backend regression test

**Files:**
- Create: `apps/api/src/controllers/roleUpdatePolicy.test.ts`
- Create: `apps/api/src/controllers/roleUpdatePolicy.ts`

- [ ] **Step 1: Write the failing test**

Add tests for:
- system roles can now update `name`
- `color` and `priority` are preserved in the update payload when provided
- omitted fields are not added to the update payload

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec node --import tsx --test src/controllers/roleUpdatePolicy.test.ts`
Expected: FAIL because `roleUpdatePolicy.ts` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create a helper like:

```ts
export function buildRoleUpdates(body: {
  name?: string;
  description?: string | null;
  color?: string | null;
  priority?: number;
}) {
  const updates: Record<string, unknown> = { updated_at: new Date() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.color !== undefined) updates.color = body.color;
  if (body.priority !== undefined) updates.priority = body.priority;
  return updates;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec node --import tsx --test src/controllers/roleUpdatePolicy.test.ts`
Expected: PASS

### Task 2: Use the helper in the role update controller

**Files:**
- Modify: `apps/api/src/controllers/role.controller.ts`
- Create: `apps/api/src/controllers/roleUpdatePolicy.ts`
- Test: `apps/api/src/controllers/roleUpdatePolicy.test.ts`

- [ ] **Step 1: Replace inline update shaping with the helper**

Update `role.controller.ts` to import `buildRoleUpdates`.

- [ ] **Step 2: Remove the system-role rename block**

Delete the current guard:

```ts
if (existing.is_system && req.body.name) {
  throw new AppError(403, 'Cannot rename system roles');
}
```

- [ ] **Step 3: Keep delete behavior unchanged**

Do not change `remove`; system roles remain undeletable.

- [ ] **Step 4: Run targeted backend test**

Run: `pnpm exec node --import tsx --test src/controllers/roleUpdatePolicy.test.ts`
Expected: PASS

## Chunk 2: Frontend Role Editor Draft State

### Task 3: Add a failing frontend draft-state test

**Files:**
- Create: `apps/web/src/features/roles/pages/roleEditorState.ts`
- Create: `apps/web/test/roleEditorState.web.test.ts`

- [ ] **Step 1: Write the failing test**

Add tests for:
- creating an editor draft from a role and permission ids
- dirty detection when `name`, `color`, `priority`, or permissions change
- no dirty state when values differ only by array order for permission ids

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec node --import tsx --test ../web/test/roleEditorState.web.test.ts`
Working directory: `apps/api`
Expected: FAIL because `roleEditorState.ts` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create helpers like:

```ts
export function createRoleEditorDraft(role, permissionIds) { ... }
export function hasRoleEditorChanges(original, draft) { ... }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec node --import tsx --test ../web/test/roleEditorState.web.test.ts`
Working directory: `apps/api`
Expected: PASS

## Chunk 3: Right-Side Role Editor UI

### Task 4: Convert the selected-role panel into a full editor

**Files:**
- Modify: `apps/web/src/features/roles/pages/RoleManagementPage.tsx`
- Create: `apps/web/src/features/roles/pages/roleEditorState.ts`
- Test: `apps/web/test/roleEditorState.web.test.ts`

- [ ] **Step 1: Add typed local state for the editor draft**

Track:
- selected role
- original draft snapshot
- editable draft
- selected role permissions
- saving state

- [ ] **Step 2: Seed the draft when a role is selected**

When permissions load for a role, create both the original and editable draft from the selected role plus permission ids.

- [ ] **Step 3: Add unsaved-change protection on role switch**

Before selecting another role, check dirty state and use `window.confirm('Discard unsaved changes?')`.

- [ ] **Step 4: Expand the right panel fields**

Add editable inputs for:
- role name
- role color
- role priority
- permissions checklist

Keep the header save button and disable it when nothing changed or while saving.

- [ ] **Step 5: Add empty and loading states**

Show a friendly empty state when no role is selected and preserve the page spinner for initial load.

### Task 5: Save role metadata and permissions together

**Files:**
- Modify: `apps/web/src/features/roles/pages/RoleManagementPage.tsx`

- [ ] **Step 1: Compute metadata and permissions changes separately**

Use the pure helper to compare the original and draft state.

- [ ] **Step 2: Save with one user action**

From the Save button:
- call `PUT /roles/:id` only if metadata changed
- call `PUT /roles/:id/permissions` only if permissions changed

- [ ] **Step 3: Refresh and re-seed after save**

Refresh role list data, re-select the saved role, and reset dirty state.

- [ ] **Step 4: Keep create-role flow intact**

Do not break the existing create form or delete behavior.

## Chunk 4: Verification

### Task 6: Run focused verification

**Files:**
- Test: `apps/api/src/controllers/roleUpdatePolicy.test.ts`
- Test: `apps/web/test/roleEditorState.web.test.ts`

- [ ] **Step 1: Run backend targeted test**

Run: `pnpm exec node --import tsx --test src/controllers/roleUpdatePolicy.test.ts`
Working directory: `apps/api`
Expected: PASS

- [ ] **Step 2: Run frontend targeted test**

Run: `pnpm exec node --import tsx --test ../web/test/roleEditorState.web.test.ts`
Working directory: `apps/api`
Expected: PASS

- [ ] **Step 3: Run frontend build**

Run: `pnpm -C apps/web build`
Expected: exit 0

- [ ] **Step 4: Run backend build**

Run: `pnpm -C apps/api build`
Expected: exit 0
