# Payslips Management Page — Design Spec

**Date:** 2026-04-21  
**Author:** Henry Pineda  
**Status:** Approved

---

## Context

Finance department staff need a centralized page to:
1. View all employee payslips (pending and draft) across their assigned branches, and inspect the full payslip breakdown.
2. Submit payslip deduction requests (Damages / Penalties) against specific employees.

This is a management-facing counterpart to the existing employee self-service payslip viewer in the `account` feature. It lives under the "Accounting and Finance" sidebar section, gated by a new permission set mirroring Token Pay.

---

## Permissions

Three new permissions in `packages/shared/src/constants/permissions.ts`, mirroring the Token Pay group:

| Key | Label | Description |
|-----|-------|-------------|
| `PAYSLIPS_VIEW` | View Payslip Management *(Required)* | Access the Payslips management page |
| `PAYSLIPS_ISSUE` | Issue Payslip Adjustment | Submit deduction/issuance requests |
| `PAYSLIPS_MANAGE` | Manage Payslip Adjustments | Approve and reject deduction/issuance requests |

---

## Navigation & Routing

**Sidebar** (`apps/web/src/features/dashboard/components/Sidebar.tsx`):
- Add `/payslips` to `FINANCE_PATHS` array
- Add nav link inside the "Accounting and Finance" `SubCategory`, gated on `hasPermission(PERMISSIONS.PAYSLIPS_VIEW)`
- Icon: `FileText` (from lucide-react)

**Router** (`apps/web/src/app/router.tsx`):
- New route `payslips` alongside the `token-pay` route
- Wrapped in `<PermissionGuard permission={PERMISSIONS.PAYSLIPS_VIEW}>`
- Renders `<PayslipsManagementPage />`

---

## Feature Folder Structure

```
apps/web/src/features/payslips/
├── pages/
│   └── PayslipsManagementPage.tsx
├── components/
│   ├── PayslipsOverviewTab.tsx
│   ├── PayslipManagementCard.tsx
│   ├── PayslipManagementDetailPanel.tsx
│   └── PayslipsIssuanceTab.tsx
└── services/
    └── payslips.api.ts
```

---

## Page Shell — `PayslipsManagementPage`

Mirrors `TokenPayManagementPage` exactly:
- Header: `FileText` icon + "Payslips" title + subtitle "Manage employee payslips, deductions, and issuances."
- `ViewToggle` with two tabs: **Overview** (`LayoutGrid` icon) and **Issuance** (`Send` icon)
- Default active tab: **Overview**
- Conditionally renders `<PayslipsOverviewTab />` or `<PayslipsIssuanceTab />`

---

## Overview Tab — `PayslipsOverviewTab`

### Data Source
- Calls existing endpoint `GET /dashboard/payslips` (same as `account` feature's `PayslipPage`)
- Filters client-side to only show `status === 'pending' || status === 'draft'`
- Branch filter: reads `selectedBranchIds` from `useBranchStore`, maps to Odoo `company_id` set, filters `PayslipListItem[]` accordingly (same logic as `PayslipPage`)
- Detail fetch: `GET /dashboard/payslips/:id` on card click

### Status Sub-tabs
- Two inline tab pills above the list: **Pending** and **Draft**
- Default active: **Pending**
- Local `useState<'pending' | 'draft'>` — not a `ViewToggle` component (lighter visual weight)
- List re-filters the already-branch-filtered results by the active status pill

### List — `PayslipManagementCard`
Each card shows:
- Employee name (bold)
- Branch / company name
- Period (date_from → date_to, formatted)
- Cutoff badge (1st or 2nd)
- Status badge (amber = pending, blue = draft)
- Net pay (right-aligned, `formatPHP`, or "—" if not yet computed)

Clicking a card sets `selectedPayslipId` and opens the side panel.

### Detail Panel — `PayslipManagementDetailPanel`
- Portal + spring animation (identical pattern to `PayslipPage` in account feature)
- Panel header: employee name + period as title, close button
- Panel body: reuses the exact layout of `PayslipDetailPanel` from the account feature:
  - Attendance computation table
  - Taxable salary list
  - Non-taxable salary list
  - Deductions list
  - Net pay summary card
  - Disclaimer banner for non-completed payslips
- Loading state: `<Spinner size="lg" />` centered

---

## Issuance Tab — `PayslipsIssuanceTab`

### Form (card section at top)
Fields in order:
1. **Branch** — `<select>` populated from `useBranchStore`'s `companyBranchGroups`, filtered to branches that are currently in `selectedBranchIds`
2. **Employee** — `<select>` disabled until branch is selected; populated by mock employee list scoped to the selected branch (real endpoint `GET /api/v1/employee-profiles` wired in during backend integration)
3. **Type** — `<select>` with two options: `"Damages"` | `"Penalties"`
4. **Amount** — `<input type="number">`, min 0, placeholder "0.00"
5. **Reason** — `<textarea>`, placeholder "Enter reason..."

Submit button label: **"Submit Deduction"**

Form state is local `useState`. On submit (mock for now): reset form, show success toast.

### Records Table (below form)
Mock data: 3–4 records.  
Columns: Employee | Branch | Type | Amount | Reason | Status | Date  
Filtered by the global `BranchSelector` selection (mock filter on branch field).  
Status badge: amber (pending) / green (approved) / red (rejected).

---

## Services — `payslips.api.ts`

```typescript
// Reuses existing endpoints from account feature
export async function fetchPayslipsList(): Promise<PayslipListResponse>
export async function fetchPayslipDetail(id: string): Promise<PayslipDetailResponse>
// Stub — wired to real endpoint when backend is built
export async function submitPayslipAdjustment(payload: PayslipAdjustmentPayload): Promise<void>
```

`PayslipAdjustmentPayload`:
```typescript
interface PayslipAdjustmentPayload {
  branchId: string;
  employeeId: string;
  type: 'Damages' | 'Penalties';
  amount: number;
  reason: string;
}
```

---

## Shared Types Used

From `packages/shared/src/types/payslip.types.ts` (already exists, no changes needed):
- `PayslipListItem`
- `PayslipListResponse`
- `PayslipDetailResponse`
- `PayslipStatus`

---

## Verification

1. Start dev server (`pnpm dev` from root)
2. Navigate to `/payslips` — confirm redirect if no permission, or page renders correctly
3. Confirm "Payslips" appears in the sidebar under "Accounting and Finance"
4. Overview tab: confirm payslip list loads from real API, filters by branch selector, status pills switch between pending/draft
5. Click a card — confirm side panel slides in with correct payslip detail
6. Issuance tab: confirm branch dropdown is populated from selected branches, employee dropdown is disabled until branch chosen, form submits (mock) and shows toast, records table renders mock data filtered by branch
