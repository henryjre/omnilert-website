# Employee Verifications Page — Layout Redesign

**File:** `apps/web/src/features/employee-verifications/pages/EmployeeVerificationsPage.tsx`

**Goal:** Align the page with the established design system used across Authorization Requests, Audit Results, and Account tabs — without touching any business logic, API calls, socket handling, or approval/rejection workflows.

---

## Design Decisions

### Dual-tab hierarchy (the core challenge)
The page has two levels of tabs: **category tabs** (Registration / Personal Information / Employment Requirements / Bank Information) and a **status filter** (All / Pending / Approved / Rejected).

Both levels use the `border-b-2` underline style. Visual hierarchy is achieved by making the status sub-tabs **smaller** (`text-xs`, `px-3 py-1.5`) vs the category tabs (`text-sm`, `px-4 py-2`), so the eye reads category as primary and status as secondary. No extra prose label is needed.

### BranchSelector
Not integrated — data is global (not branch-scoped).

---

## Section 1 — Page Header

```
[Users icon h-6 w-6 text-primary-600]  Employee Verifications  [●N pending]
Review and act on employee verification submissions.   ← hidden on mobile (sm:block)
[active category name]                                 ← mobile only (sm:hidden), text-primary-600
```

- Pending bubble: total across all four categories combined (already computed as `pendingCount`)
- Structure: outer `div`, inner `div.flex.items-center.gap-3` for icon + h1 + bubble, then `<p>` sibling for subtitle

---

## Section 2 — Category Tabs (primary)

Keep existing `border-b-2` underline implementation. Only additions:

- Add a per-category pending count badge inline after each label (small `rounded-full bg-primary-600 text-white` bubble, `text-[10px]`)
- Each category's count: `data[category].filter(r => r.status === 'pending').length`
- Only show bubble when count > 0
- Tabs: Registration (`UserRoundPlus`), Personal Information (`IdCard`), Employment Requirements (`ClipboardCheck`), Bank Information (`Landmark`)

---

## Section 3 — Status Sub-tabs (secondary)

Replace the pill segmented control (`bg-gray-100 rounded-lg p-1`) with a compact `border-b-2` underline strip:

```tsx
<div className="flex w-full gap-1 border-b border-gray-200">
  {STATUS_TABS.map(tab => (
    <button
      key={tab.key}
      type="button"
      onClick={() => { setStatusFilter(tab.key); setPage(1); }}
      className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-1.5 text-xs font-medium transition-colors sm:flex-none ${
        statusFilter === tab.key
          ? 'border-primary-600 text-primary-600'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      <tab.Icon className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{tab.label}</span>
    </button>
  ))}
</div>
```

STATUS_TABS constant:
```ts
const STATUS_TABS = [
  { key: 'all',      label: 'All',      Icon: LayoutGrid  },
  { key: 'pending',  label: 'Pending',  Icon: Clock       },
  { key: 'approved', label: 'Approved', Icon: CheckCircle },
  { key: 'rejected', label: 'Rejected', Icon: XCircle     },
] as const;
```

---

## Section 4 — Card List

### TypeCard → VerificationCard

Replace `div > Card > CardBody` wrapper with a `<button>` using the equal-height pattern:

```
┌──────────────────────────────────────────────────────┐
│  [Name (font-medium)]              [Status badge]    │
│  [subtitle line — type-dependent]                    │
│                              (flex-1 spacer)         │
├──────────────────────────────────────────────────────┤
│  [date text-xs text-gray-400]                    >   │
└──────────────────────────────────────────────────────┘
```

**Subtitle by type:**
- `registration`: email
- `personalInformation`: email
- `employmentRequirements`: `requirement_label`
- `bankInformation`: `BANK_LABEL[bank_id]` + account number (xs, gray-400)

**Date by type:**
- `registration`: `requested_at`
- others: `created_at`

**Status badge:** Use `<Badge variant={statusVariant(item.status)}>` — add `statusVariant` helper mapping `approved→success`, `rejected→danger`, `pending→warning`.

**Card grid:** `grid gap-3 sm:grid-cols-2 lg:grid-cols-3` (matches authorization requests)

### Empty State

Replace `<p>No records...</p>` with:

```tsx
<div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
  <[CategoryIcon] className="h-4 w-4 shrink-0 text-gray-300" />
  <p className="text-sm text-gray-400">
    {statusFilter === 'all'
      ? `No ${activeTypeLabel.toLowerCase()} verifications yet.`
      : `No ${statusFilter} ${activeTypeLabel.toLowerCase()} verifications.`}
  </p>
</div>
```

Category icon: same icon used in the category tab (`UserRoundPlus`, `IdCard`, `ClipboardCheck`, `Landmark`).

---

## Section 5 — Skeleton Loader

Replace `<Spinner>` with a full-page skeleton that mirrors the actual layout:

```tsx
function EmployeeVerificationsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="animate-pulse space-y-2">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 rounded-full bg-gray-200" />
          <div className="h-7 w-64 rounded bg-gray-200" />
        </div>
        <div className="h-4 w-80 rounded bg-gray-200" />
      </div>
      {/* Category tab strip skeleton */}
      <div className="flex gap-1 border-b border-gray-200 pb-px">
        {[96, 112, 160, 120].map((w, i) => (
          <div key={i} style={{ width: w }} className="h-8 animate-pulse rounded-t bg-gray-100" />
        ))}
      </div>
      {/* Status sub-tab strip skeleton */}
      <div className="flex gap-1 border-b border-gray-200 pb-px">
        {[64, 80, 96, 88].map((w, i) => (
          <div key={i} style={{ width: w }} className="h-6 animate-pulse rounded-t bg-gray-100" />
        ))}
      </div>
      {/* Card grid skeleton */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-32 rounded bg-gray-200" />
                <div className="h-3 w-40 rounded bg-gray-200" />
              </div>
              <div className="h-5 w-16 rounded-full bg-gray-200" />
            </div>
            <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-2.5">
              <div className="h-3 w-28 rounded bg-gray-200" />
              <div className="h-4 w-4 rounded bg-gray-200" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Section 6 — Detail Panel

### Portal
Wrap backdrop + panel in `createPortal(..., document.body)`. Panel width stays `max-w-[520px]`.

### Panel Header (all types)

```tsx
<div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
  <div className="flex items-center gap-3">
    <[TypeIcon] className="h-5 w-5 text-primary-600" />
    <div>
      <h2 className="text-base font-semibold text-gray-900">{panelTitle}</h2>
      <p className="text-xs text-gray-500">
        {selectedItem.data.first_name} {selectedItem.data.last_name}
      </p>
    </div>
  </div>
  <div className="flex items-center gap-2">
    <Badge variant={statusVariant(selectedItem.data.status)}>
      {capitalize(selectedItem.data.status)}
    </Badge>
    <button type="button" onClick={closePanel}
      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
      <X className="h-5 w-5" />
    </button>
  </div>
</div>
```

Type icons: `UserRoundPlus` (registration), `IdCard` (personalInformation), `ClipboardCheck` (employmentRequirements), `Landmark` (bankInformation).

Panel titles: "Registration Verification", "Personal Information Verification", "Employment Requirement Verification", "Bank Information Verification".

### Panel Body — Registration

```
[Rejection callout]  ← red border, if rejected
[Approval progress log]  ← blue border, if in-progress

EMPLOYEE
  [Mail icon]    Email          → value
  [Calendar icon] Requested     → value
  [Calendar icon] Reviewed      → value  (if resolved)

[Assignment form sections]  ← only when canActOnSelected
  Roles (required)           ← keep existing pill toggle UI
  Companies and Branches     ← keep existing nested toggle UI
  Resident Branch            ← keep existing select UI
```

### Panel Body — Personal Information

```
[Rejection callout]  ← if rejected

SUBMITTED ID  ← keep image/pdf/link preview unchanged

REQUESTED CHANGES
  Styled with rounded-xl border bg-gray-50 p-4
  Each changed field: label (font-medium) + strikethrough original → bold new value
  "No requested changes" empty state

[Editable input fields grid]  ← only when canActOnSelected, keep unchanged
```

### Panel Body — Employment Requirements

```
[Rejection callout]  ← if rejected

DETAILS
  [ClipboardCheck icon]  Requirement  → requirement_label
  [Mail icon]            Email        → email
  [Calendar icon]        Submitted    → created_at

SUBMITTED DOCUMENT  ← keep image/pdf/link preview unchanged
```

### Panel Body — Bank Information

```
[Rejection callout]  ← if rejected

BANK DETAILS
  [Mail icon]       Email          → email
  [Landmark icon]   Bank           → bank name
  [CreditCard icon] Account Number → account_number  [Copy button]
  [Calendar icon]   Submitted      → created_at
  [User icon]       Reviewed By    → reviewed_by_name  (if present)
```

Copy button: same `Copy`/`Check` pattern with `copyToClipboard` + `fallbackCopy` used in authorization requests.

### Callout styles

**Rejection:** `flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3` with `AlertCircle` icon in `text-red-500`, title `text-xs font-semibold text-red-700`, body `text-sm text-red-600`.

**Approval progress:** keep existing `rounded-lg border border-blue-200 bg-blue-50 p-3` — only change the rejection plain div to the styled callout.

### Panel Footer
**Completely unchanged.** Approve/Reject buttons, panelError display, textarea for rejection reason, confirm modal — no changes.

---

## Imports to Add / Update

New icons needed: `LayoutGrid`, `Clock`, `Badge` component, `createPortal`, `CreditCard`, `User`, `Mail`, `Calendar`, `AlertCircle`.

Already imported: `CheckCircle`, `XCircle`, `ClipboardCheck`, `Landmark`, `UserRoundPlus`, `IdCard`, `Users`, `X`, `ExternalLink`.

Remove: `Card`, `CardBody`, `Spinner` (replaced by skeleton + badge).

---

## Constraints

- **No changes** to: API calls, socket handlers, approval/rejection logic, form state, personal info edit fields, assignment options logic, confirm modal logic, pagination logic.
- **No BranchSelector** integration — data is global.
- The `Badge` component import from `@/shared/components/ui/Badge`.
- Use `createPortal` from `react-dom`.
