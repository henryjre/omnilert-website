# Plan: Employee Profiles — Company/Branch Assignment in Work Information Editor

## Context

The "Edit Work Information" panel in Employee Profiles currently only lets an admin change department, position, status, resident branch (from existing assignments), and date started. There is no way to assign a user to a new company or branch from this panel — that can only be done from User Management.

The request is to add a full company/branch assignment picker (identical UI to User Management's "Company Access and Odoo Employee Branch Targets") inside the Work Information editor. When the admin saves with new branch assignments, the system should:

1. Sync Odoo `hr.employee` records (reuse existing PIN, create if missing)
2. Update master `user_company_access` and `user_company_branches` tables
3. Before saving, show a confirmation modal warning that Odoo accounts will be created for any branches where the employee doesn't already have one

This reuses the existing `assignGlobalCompanyBranches` service path (PUT /users/:id/branches) rather than duplicating the logic.

---

## Files to Modify

### Backend

1. `packages/shared/src/validation/employeeProfile.schema.ts`
   - Add optional `companyAssignments` field to `updateEmployeeWorkInformationSchema`

2. `apps/api/src/services/employeeProfile.service.ts`
   - Remove the `user_company_branches` pre-existence check from `updateEmployeeWorkInformation` (currently blocks setting a resident branch that isn't yet assigned)
   - Add `companyAssignments` to the input type
   - Call `assignGlobalCompanyBranches` when `companyAssignments` is provided, before the resident branch transaction

3. `apps/api/src/controllers/employeeProfile.controller.ts`
   - Forward `req.body.companyAssignments` into the service call

### Frontend

4. `apps/web/src/features/employee-profiles/pages/EmployeeProfilesPage.tsx`
   - Add `AssignmentOptionCompany` and `CompanyAssignmentForm` types
   - Add `assignmentOptions`, `editCompanyAssignments`, and `showOdooConfirm` state
   - Add `toggleCompany` / `toggleBranch` helpers (copy from `UserManagementPage.tsx`)
   - Fetch `GET /users/assignment-options` lazily when entering work edit mode
   - Initialize `editCompanyAssignments` from the user's current branch assignments when edit mode opens
   - Add company/branch picker UI inside the work edit form (below existing fields, above Save/Cancel)
   - Gate save behind an Odoo confirmation modal when new branches are detected
   - Pass `companyAssignments` in the PATCH body
   - Drive the resident branch dropdowns from `editCompanyAssignments` instead of `branch_options`

---

## Implementation Detail

### 1. Shared schema — `packages/shared/src/validation/employeeProfile.schema.ts`

Add to `updateEmployeeWorkInformationSchema`:

```typescript
companyAssignments: z.array(z.object({
  companyId: uuid,
  branchIds: z.array(uuid).min(1),
})).optional(),
```

---

### 2. Backend service — `employeeProfile.service.ts`

**Remove the resident branch pre-existence check** (currently ~lines 463–472):

```typescript
// DELETE this block — resident branch will be valid after assignGlobalCompanyBranches runs:
const residentRow = await masterDb('user_company_branches')
  .where({ user_id: input.userId, company_id: ..., branch_id: ... })
  .first('id');
if (!residentRow) {
  throw new AppError(400, 'Selected resident branch is not assigned to this user');
}
```

**Add `companyAssignments` handling before the existing transaction:**

```typescript
if (input.companyAssignments && input.companyAssignments.length > 0) {
  await assignGlobalCompanyBranches({
    userId: input.userId,
    companyAssignments: input.companyAssignments,
  });
}
// Then proceed with the existing transaction (dept/status/resident branch update)
```

Import `assignGlobalCompanyBranches` from `./globalUserManagement.service.js`.

---

### 3. Backend controller — `employeeProfile.controller.ts`

Add to the `updateWorkInformation` service call:

```typescript
companyAssignments: req.body.companyAssignments,
```

---

### 4. Frontend — `EmployeeProfilesPage.tsx`

**New types:**

```typescript
type AssignmentOptionCompany = {
  id: string;
  name: string;
  branches: Array<{ id: string; name: string; odoo_branch_id: string }>;
};
type CompanyAssignmentForm = { companyId: string; branchIds: string[] };
```

**New state:**

```typescript
const [assignmentOptions, setAssignmentOptions] = useState<AssignmentOptionCompany[]>([]);
const [editCompanyAssignments, setEditCompanyAssignments] = useState<CompanyAssignmentForm[]>([]);
const [showOdooConfirm, setShowOdooConfirm] = useState(false);
```

**Enter edit mode — fetch options and initialize assignments:**

```typescript
const enterWorkEditMode = async () => {
  const optionsRes = await api.get('/users/assignment-options');
  setAssignmentOptions(optionsRes.data.data?.companies || []);
  // Group user's current branch_options by company_id
  const map = new Map<string, string[]>();
  for (const b of detail.work_information.branch_options) {
    const current = map.get(b.company_id) ?? [];
    current.push(b.branch_id);
    map.set(b.company_id, current);
  }
  setEditCompanyAssignments(
    Array.from(map.entries()).map(([companyId, branchIds]) => ({ companyId, branchIds }))
  );
  setWorkEditMode(true);
};
```

Replace the existing `setWorkEditMode(true)` call with `enterWorkEditMode()`.

**Toggle helpers** (copy from `UserManagementPage.tsx`):

```typescript
const toggleCompany = (companyId: string) => {
  setEditCompanyAssignments((current) => {
    const exists = current.find((item) => item.companyId === companyId);
    if (exists) return current.filter((item) => item.companyId !== companyId);
    return [...current, { companyId, branchIds: [] }];
  });
};

const toggleBranch = (companyId: string, branchId: string) => {
  setEditCompanyAssignments((current) =>
    current.map((item) => {
      if (item.companyId !== companyId) return item;
      return {
        ...item,
        branchIds: item.branchIds.includes(branchId)
          ? item.branchIds.filter((id) => id !== branchId)
          : [...item.branchIds, branchId],
      };
    })
  );
};
```

**Company/branch picker UI** (add below the existing form fields, above Save/Cancel):

```tsx
<div>
  <label className="mb-1 block text-sm font-medium text-gray-700">
    Company Access and Odoo Employee Branch Targets
  </label>
  <div className="space-y-2">
    {assignmentOptions.map((company) => {
      const selected = editCompanyAssignments.find((a) => a.companyId === company.id);
      return (
        <div key={company.id} className="rounded-lg border border-gray-200 p-3">
          <button
            type="button"
            onClick={() => toggleCompany(company.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              selected ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {company.name}
          </button>
          {selected && (
            <div className="mt-2 flex flex-wrap gap-2">
              {company.branches.map((branch) => (
                <button
                  key={branch.id}
                  type="button"
                  onClick={() => toggleBranch(company.id, branch.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    selected.branchIds.includes(branch.id)
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {branch.name}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    })}
  </div>
</div>
```

**Gate save behind Odoo confirmation modal when new branches are detected:**

```typescript
const handleSaveWorkInformation = () => {
  const currentBranchIds = new Set(
    detail.work_information.branch_options.map((b) => b.branch_id)
  );
  const hasNewBranches = editCompanyAssignments.some((a) =>
    a.branchIds.some((id) => !currentBranchIds.has(id))
  );
  if (hasNewBranches) {
    setShowOdooConfirm(true);
  } else {
    saveWorkInformation();
  }
};
```

Replace the Save button's `onClick` with `handleSaveWorkInformation`.

**Odoo confirmation modal JSX** (same `z-[60]` inline pattern used throughout the app):

```tsx
{showOdooConfirm && (
  <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
    <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
      <div className="border-b border-gray-200 px-5 py-4">
        <p className="font-semibold text-gray-900">Confirm Branch Assignment</p>
      </div>
      <div className="px-5 py-4">
        <p className="text-sm text-gray-700">
          This employee will be assigned to new branch(es). An Odoo employee account will be
          created for any branch where one does not already exist, using the same PIN code.
          Do you want to continue?
        </p>
      </div>
      <div className="flex gap-3 border-t border-gray-200 px-5 py-4">
        <Button
          type="button"
          className="flex-1"
          variant="standard"
          disabled={savingWork}
          onClick={() => { setShowOdooConfirm(false); saveWorkInformation(); }}
        >
          Yes, Save Changes
        </Button>
        <Button
          type="button"
          className="flex-1"
          variant="secondary"
          disabled={savingWork}
          onClick={() => setShowOdooConfirm(false)}
        >
          Cancel
        </Button>
      </div>
    </div>
  </div>
)}
```

**Update `saveWorkInformation`** to include `companyAssignments` in the PATCH body:

```typescript
companyAssignments: editCompanyAssignments.length > 0 ? editCompanyAssignments : undefined,
```

**Update the resident branch dropdowns** — drive options from `editCompanyAssignments` + `assignmentOptions` instead of `detail.work_information.branch_options`, so the resident branch picker reflects newly selected branches immediately:

- Resident company `<select>` options: companies present in `editCompanyAssignments` (look up name from `assignmentOptions`)
- Resident branch `<select>` options: branches in `editCompanyAssignments` for the selected company (look up name from `assignmentOptions`)

---

## Key Design Notes

- `assignGlobalCompanyBranches` is called **before** the resident branch transaction in `updateEmployeeWorkInformation`. This ensures new branches exist in `user_company_branches` before the resident update runs.
- The existing resident branch pre-existence validation is removed — it is no longer needed since `assignGlobalCompanyBranches` populates the table first.
- `companyAssignments` is optional in both schema and service — if omitted, the existing flow is unchanged.
- The Odoo confirmation modal only appears when the new selection includes branches not in the user's current `branch_options`. Saving with no new branches (or only removals) proceeds directly.
- `assignmentOptions` is fetched lazily on entering edit mode, not on page load, to avoid loading all companies/branches for every profile card.
- `writeCompanyAccessAndBranchSnapshots` (called inside `assignGlobalCompanyBranches`) deletes and rewrites `user_company_branches`, so removed branches are handled automatically.

---

## Verification

1. Open Employee Profiles → select a user → click "Edit Work Information".
2. Confirm the company/branch picker appears with all active companies and their branches, with the user's current assignments pre-selected.
3. Add a new branch → click Save → confirm the Odoo confirmation modal appears.
4. Confirm → profile reloads with the new branch in assignments.
5. Check Odoo: `hr.employee` exists for the new branch with the same PIN as existing branches.
6. Remove a branch → save → confirm no Odoo modal, branch removed from assignments.
7. Change only department/status → save → no Odoo modal, saves immediately.
8. Confirm the resident branch dropdown updates in real-time as branches are toggled.
