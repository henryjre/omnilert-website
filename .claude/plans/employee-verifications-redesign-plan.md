# Employee Verifications Page — Layout Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `EmployeeVerificationsPage.tsx` to match the established design system — compact equal-height cards, dual underline tab strips, skeleton loader, styled detail panels with icon-based sections, and portalled panel — without touching any business logic or approval workflows.

**Architecture:** Single-file redesign of `apps/web/src/features/employee-verifications/pages/EmployeeVerificationsPage.tsx`. All logic (API calls, socket, approval/rejection, form state, pagination) is preserved verbatim. Only JSX structure, class names, and component extraction change.

**Tech Stack:** React, TypeScript, Tailwind CSS, Lucide React, framer-motion (none added), react-dom `createPortal`, existing `Badge` component.

**Spec:** `.claude/plans/employee-verifications-redesign.md`

---

## File to Modify

- Modify: `apps/web/src/features/employee-verifications/pages/EmployeeVerificationsPage.tsx`

---

## Task 1: Update imports — add new icons, Badge, createPortal; remove Card/CardBody/Spinner

**Files:**
- Modify: `apps/web/src/features/employee-verifications/pages/EmployeeVerificationsPage.tsx:1-12`

- [ ] **Step 1: Replace the import block**

Replace:
```tsx
import { Card, CardBody } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Spinner } from '@/shared/components/ui/Spinner';
import { api } from '@/shared/services/api.client';
import { usePermission } from '@/shared/hooks/usePermission';
import { useSocket } from '@/shared/hooks/useSocket';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { useAuthStore } from '@/features/auth/store/authSlice';
import { PERMISSIONS } from '@omnilert/shared';
import { CheckCircle, ClipboardCheck, ExternalLink, IdCard, Landmark, UserRoundPlus, Users, X, XCircle } from 'lucide-react';
```

With:
```tsx
import { createPortal } from 'react-dom';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { api } from '@/shared/services/api.client';
import { usePermission } from '@/shared/hooks/usePermission';
import { useSocket } from '@/shared/hooks/useSocket';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { useAuthStore } from '@/features/auth/store/authSlice';
import { PERMISSIONS } from '@omnilert/shared';
import {
  AlertCircle, Calendar, CheckCircle, ClipboardCheck, Clock,
  Copy, Check, CreditCard, ExternalLink, IdCard, Landmark,
  LayoutGrid, Mail, User, UserRoundPlus, Users, X, XCircle,
} from 'lucide-react';
```

- [ ] **Step 2: Check lints — confirm no import errors**

Run linter or inspect the file visually. Expected: no "module not found" errors.

---

## Task 2: Add STATUS_TABS constant and statusVariant helper; update STATUS_VARIANT to use Badge variants

**Files:**
- Modify: `apps/web/src/features/employee-verifications/pages/EmployeeVerificationsPage.tsx` (constants section, ~line 53)

- [ ] **Step 1: Replace `STATUS_VARIANT` and add `STATUS_TABS` + `statusVariant`**

Replace:
```ts
const STATUS_VARIANT: Record<VerificationStatus, string> = {
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  pending: 'bg-amber-100 text-amber-700',
};
```

With:
```ts
/** Maps status to Badge variant prop */
function statusVariant(status: string): 'success' | 'danger' | 'warning' {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'danger';
  return 'warning';
}

type StatusFilter = 'all' | VerificationStatus;

const STATUS_TABS: { key: StatusFilter; label: string; Icon: React.ElementType }[] = [
  { key: 'all',      label: 'All',      Icon: LayoutGrid  },
  { key: 'pending',  label: 'Pending',  Icon: Clock       },
  { key: 'approved', label: 'Approved', Icon: CheckCircle },
  { key: 'rejected', label: 'Rejected', Icon: XCircle     },
];
```

- [ ] **Step 2: Update `statusFilter` state type** 

In the component, change:
```ts
const [statusFilter, setStatusFilter] = useState<'all' | VerificationStatus>('pending');
```
to:
```ts
const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
```

---

## Task 3: Add `copyToClipboard` + `fallbackCopy` helpers (for bank account number copy button)

**Files:**
- Modify: `apps/web/src/features/employee-verifications/pages/EmployeeVerificationsPage.tsx` (after existing helpers, before component)

- [ ] **Step 1: Add the two helper functions after `getCurrentPersonalValue`**

```ts
/** Copy text to clipboard with an execCommand fallback for non-HTTPS environments. */
function copyToClipboard(text: string, onSuccess: () => void) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(onSuccess).catch(() => {
      fallbackCopy(text, onSuccess);
    });
  } else {
    fallbackCopy(text, onSuccess);
  }
}

function fallbackCopy(text: string, onSuccess: () => void) {
  const el = document.createElement('textarea');
  el.value = text;
  el.style.position = 'fixed';
  el.style.opacity = '0';
  document.body.appendChild(el);
  el.focus();
  el.select();
  try {
    if (document.execCommand('copy')) onSuccess();
  } finally {
    document.body.removeChild(el);
  }
}
```

---

## Task 4: Replace `TypeCard` with `VerificationCard`

**Files:**
- Modify: `apps/web/src/features/employee-verifications/pages/EmployeeVerificationsPage.tsx` (TypeCard component, ~line 188)

- [ ] **Step 1: Replace the entire `TypeCard` function with `VerificationCard`**

```tsx
function VerificationCard({
  type,
  item,
  onClick,
}: {
  type: VerificationType;
  item: any;
  onClick: () => void;
}) {
  /** Secondary line of metadata below the name */
  function subtitle() {
    if (type === 'registration') return item.email as string;
    if (type === 'personalInformation') return item.email as string;
    if (type === 'employmentRequirements') return item.requirement_label as string;
    return BANK_LABEL[Number(item.bank_id)] ?? `Bank ID ${String(item.bank_id)}`;
  }

  /** Tertiary line for bank cards */
  function subtitleExtra() {
    if (type === 'bankInformation' && item.account_number) {
      return `Account: ${String(item.account_number)}`;
    }
    return null;
  }

  const dateIso: string =
    type === 'registration' ? (item.requested_at as string) : (item.created_at as string);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-PH', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  return (
    <button
      type="button"
      className="flex h-full w-full flex-col rounded-xl border border-gray-200 bg-white p-4 text-left transition-colors hover:border-primary-200 hover:bg-primary-50/30"
      onClick={onClick}
    >
      {/* Top block */}
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium text-gray-900">
          {String(item.first_name)} {String(item.last_name)}
        </p>
        <Badge variant={statusVariant(item.status as string)}>
          {(item.status as string).charAt(0).toUpperCase() + (item.status as string).slice(1)}
        </Badge>
      </div>

      <div className="mt-1.5 min-w-0 space-y-0.5">
        <p className="truncate text-xs text-gray-500">{subtitle()}</p>
        {subtitleExtra() && (
          <p className="truncate text-xs text-gray-400">{subtitleExtra()}</p>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Footer */}
      <div className="mt-3 flex items-end justify-between gap-2 border-t border-gray-100 pt-2.5">
        <p className="text-xs text-gray-400">{fmtDate(dateIso)}</p>
        <svg className="h-4 w-4 shrink-0 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
}
```

Note: Uses inline SVG chevron to avoid adding another icon import. Alternatively import `ChevronRight` from lucide-react — add it to the existing import block.

---

## Task 5: Add `EmployeeVerificationsSkeleton` component

**Files:**
- Modify: `apps/web/src/features/employee-verifications/pages/EmployeeVerificationsPage.tsx` (add before `EmployeeVerificationsPage` function)

- [ ] **Step 1: Insert the skeleton component**

```tsx
function EmployeeVerificationsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="animate-pulse space-y-2">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 rounded-full bg-gray-200" />
          <div className="h-7 w-64 rounded bg-gray-200" />
        </div>
        <div className="h-4 w-80 rounded bg-gray-200" />
      </div>
      {/* Category tabs */}
      <div className="flex gap-1 border-b border-gray-200 pb-px">
        {[96, 112, 160, 120].map((w, i) => (
          <div key={i} style={{ width: w }} className="h-8 animate-pulse rounded-t bg-gray-100" />
        ))}
      </div>
      {/* Status sub-tabs */}
      <div className="flex gap-1 border-b border-gray-200 pb-px">
        {[64, 80, 96, 88].map((w, i) => (
          <div key={i} style={{ width: w }} className="h-6 animate-pulse rounded-t bg-gray-100" />
        ))}
      </div>
      {/* Card grid */}
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

## Task 6: Redesign the main page render — header, category tabs, status sub-tabs, card grid, empty state

**Files:**
- Modify: `apps/web/src/features/employee-verifications/pages/EmployeeVerificationsPage.tsx` (loading guard + return JSX, ~line 745)

- [ ] **Step 1: Replace the loading guard**

Replace:
```tsx
if (loading) {
  return (
    <div className="flex justify-center py-12">
      <Spinner size="lg" />
    </div>
  );
}
```

With:
```tsx
if (loading) return <EmployeeVerificationsSkeleton />;
```

- [ ] **Step 2: Replace page header**

Replace:
```tsx
<div>
  <div className="flex items-center gap-3">
    <Users className="h-6 w-6 text-primary-600" />
    <h1 className="text-2xl font-bold text-gray-900">Employee Verifications</h1>
    {pendingCount > 0 && (
      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-600 px-1.5 text-[10px] font-bold text-white">
        {pendingCount}
      </span>
    )}
  </div>
  <p className="mt-1 text-sm font-medium text-gray-600 sm:hidden">{activeTypeLabel}</p>
</div>
```

With:
```tsx
<div>
  <div className="flex items-center gap-3">
    <Users className="h-6 w-6 text-primary-600" />
    <h1 className="text-2xl font-bold text-gray-900">Employee Verifications</h1>
    {pendingCount > 0 && (
      <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary-600 px-1.5 text-[10px] font-bold text-white">
        {pendingCount}
      </span>
    )}
  </div>
  <p className="mt-0.5 text-sm font-medium text-primary-600 sm:hidden">{activeTypeLabel}</p>
  <p className="mt-1 hidden text-sm text-gray-500 sm:block">
    Review and act on employee verification submissions.
  </p>
</div>
```

- [ ] **Step 3: Replace category tabs — add per-category pending count bubbles**

```tsx
{/* Per-category pending counts for the bubbles */}
{(() => {
  const pendingByType: Record<VerificationType, number> = {
    registration: data.registration.filter((r) => r.status === 'pending').length,
    personalInformation: data.personalInformation.filter((r) => r.status === 'pending').length,
    employmentRequirements: data.employmentRequirements.filter((r) => r.status === 'pending').length,
    bankInformation: data.bankInformation.filter((r) => r.status === 'pending').length,
  };
  return (
    <div className="flex justify-center gap-1 border-b border-gray-200 sm:justify-start">
      {([
        { key: 'registration'          as const, label: 'Registration',           Icon: UserRoundPlus  },
        { key: 'personalInformation'   as const, label: 'Personal Information',   Icon: IdCard         },
        { key: 'employmentRequirements' as const, label: 'Employment Requirements', Icon: ClipboardCheck },
        { key: 'bankInformation'       as const, label: 'Bank Information',       Icon: Landmark       },
      ]).map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => { setActiveType(tab.key); setStatusFilter('pending'); }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
            activeType === tab.key
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <tab.Icon className="h-4 w-4" />
          <span className="hidden sm:inline">{tab.label}</span>
          {pendingByType[tab.key] > 0 && (
            <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary-600 px-1 text-[9px] font-bold text-white">
              {pendingByType[tab.key]}
            </span>
          )}
        </button>
      ))}
    </div>
  );
})()}
```

- [ ] **Step 4: Replace status filter pill with underline sub-tabs**

Replace:
```tsx
<div className="mx-auto flex w-full items-center justify-center gap-1 rounded-lg bg-gray-100 p-1 sm:mx-0 sm:w-fit sm:justify-start">
  {(['all', 'pending', 'approved', 'rejected'] as const).map((status) => (
    <button
      key={status}
      onClick={() => setStatusFilter(status)}
      className={`flex-1 rounded-md px-4 py-1.5 text-center text-sm font-medium capitalize transition-colors sm:flex-none ${
        statusFilter === status
          ? 'bg-primary-600 text-white shadow-sm'
          : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {status}
    </button>
  ))}
</div>
```

With:
```tsx
<div className="flex w-full gap-1 border-b border-gray-200">
  {STATUS_TABS.map((tab) => (
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

- [ ] **Step 5: Replace card list and empty state**

Replace:
```tsx
<div className="space-y-3">
  {filtered.length === 0 && <p className="text-sm text-gray-500">No records in this filter.</p>}
  {pagedFiltered.map((item: any) => (
    <TypeCard
      key={item.id}
      type={activeType}
      item={item}
      onClick={() => openPanel(activeType, item)}
    />
  ))}
  ...pagination...
</div>
```

With:
```tsx
<div className="space-y-4">
  {filtered.length === 0 ? (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
      {activeType === 'registration' && <UserRoundPlus className="h-4 w-4 shrink-0 text-gray-300" />}
      {activeType === 'personalInformation' && <IdCard className="h-4 w-4 shrink-0 text-gray-300" />}
      {activeType === 'employmentRequirements' && <ClipboardCheck className="h-4 w-4 shrink-0 text-gray-300" />}
      {activeType === 'bankInformation' && <Landmark className="h-4 w-4 shrink-0 text-gray-300" />}
      <p className="text-sm text-gray-400">
        {statusFilter === 'all'
          ? `No ${activeTypeLabel.toLowerCase()} verifications yet.`
          : `No ${statusFilter} ${activeTypeLabel.toLowerCase()} verifications.`}
      </p>
    </div>
  ) : (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {pagedFiltered.map((item: any) => (
          <VerificationCard
            key={item.id}
            type={activeType}
            item={item}
            onClick={() => openPanel(activeType, item)}
          />
        ))}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page === 1}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page === totalPages}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </>
  )}
</div>
```

---

## Task 7: Redesign detail panel header + portal

**Files:**
- Modify: `apps/web/src/features/employee-verifications/pages/EmployeeVerificationsPage.tsx` (panel JSX, ~line 844)

- [ ] **Step 1: Add `copiedAccountNumber` state to component**

Add near the other useState declarations:
```tsx
const [copiedAccountNumber, setCopiedAccountNumber] = useState(false);
```

- [ ] **Step 2: Add `panelTypeIcon` and `panelTitle` helpers inside the component (before the return)**

```tsx
const PANEL_TITLE: Record<VerificationType, string> = {
  registration: 'Registration Verification',
  personalInformation: 'Personal Information Verification',
  employmentRequirements: 'Employment Requirement Verification',
  bankInformation: 'Bank Information Verification',
};

const PANEL_ICON: Record<VerificationType, React.ElementType> = {
  registration: UserRoundPlus,
  personalInformation: IdCard,
  employmentRequirements: ClipboardCheck,
  bankInformation: Landmark,
};
```

- [ ] **Step 3: Wrap backdrop + panel in `createPortal`**

Replace:
```tsx
{selectedItem && (
  <div className="fixed inset-0 z-40 bg-black/30" onClick={closePanel} />
)}

<div
  className={`fixed inset-y-0 right-0 z-50 w-full max-w-[520px] transform bg-white shadow-2xl transition-transform duration-300 ${
    selectedItem ? 'translate-x-0' : 'translate-x-full'
  }`}
>
  {selectedItem && (
    ...panel content...
  )}
</div>
```

With:
```tsx
{createPortal(
  <>
    {selectedItem && (
      <div className="fixed inset-0 z-40 bg-black/30" onClick={closePanel} />
    )}
    <div
      className={`fixed inset-y-0 right-0 z-50 w-full max-w-[520px] transform bg-white shadow-2xl transition-transform duration-300 ${
        selectedItem ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      {selectedItem && (
        ...panel content...
      )}
    </div>
  </>,
  document.body,
)}
```

- [ ] **Step 4: Replace panel header**

Replace:
```tsx
<div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
  <div>
    <p className="font-semibold text-gray-900">
      {selectedItem.type === 'registration' ? 'Registration Verification' : ...}
    </p>
    <p className="text-xs text-gray-500">
      {selectedItem.data.first_name} {selectedItem.data.last_name}
    </p>
  </div>
  <div className="flex items-center gap-2">
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${...}`}>
      {selectedItem.data.status}
    </span>
    <button onClick={closePanel} className="rounded-full p-1 ...">
      <X className="h-5 w-5" />
    </button>
  </div>
</div>
```

With:
```tsx
{(() => {
  const PanelIcon = PANEL_ICON[selectedItem.type];
  return (
    <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
      <div className="flex items-center gap-3">
        <PanelIcon className="h-5 w-5 text-primary-600" />
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            {PANEL_TITLE[selectedItem.type]}
          </h2>
          <p className="text-xs text-gray-500">
            {String(selectedItem.data.first_name)} {String(selectedItem.data.last_name)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={statusVariant(selectedItem.data.status as string)}>
          {(selectedItem.data.status as string).charAt(0).toUpperCase() +
           (selectedItem.data.status as string).slice(1)}
        </Badge>
        <button
          type="button"
          onClick={closePanel}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
})()}
```

---

## Task 8: Redesign panel body — Registration type

**Files:**
- Modify: `apps/web/src/features/employee-verifications/pages/EmployeeVerificationsPage.tsx` (registration body, ~line 888)

- [ ] **Step 1: Replace the registration grid + rejection callout with icon-based sections**

The rejection callout and assignment form logic are KEPT. Only the metadata grid changes.

Replace:
```tsx
{selectedItem.type === 'registration' && (
  <>
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
      <span className="text-gray-500">Email</span>
      <span className="font-medium text-gray-900">{selectedItem.data.email}</span>
      <span className="text-gray-500">Requested</span>
      <span className="font-medium text-gray-900">
        {new Date(selectedItem.data.requested_at).toLocaleString()}
      </span>
      {selectedItem.data.reviewed_at && (
        <>
          <span className="text-gray-500">Reviewed</span>
          <span className="font-medium text-gray-900">
            {new Date(selectedItem.data.reviewed_at).toLocaleString()}
          </span>
        </>
      )}
    </div>

    {selectedItem.data.status === 'rejected' && selectedItem.data.rejection_reason && (
      <div className="rounded bg-red-50 p-3 text-sm text-red-700">
        <span className="font-medium">Rejection reason: </span>
        {selectedItem.data.rejection_reason}
      </div>
    )}

    {canActOnSelected && (
      ... (keep everything here unchanged)
    )}
  </>
)}
```

With:
```tsx
{selectedItem.type === 'registration' && (
  <>
    {/* Rejection callout */}
    {selectedItem.data.status === 'rejected' && selectedItem.data.rejection_reason && (
      <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
        <div>
          <p className="text-xs font-semibold text-red-700">Rejection Reason</p>
          <p className="mt-0.5 text-sm text-red-600">{String(selectedItem.data.rejection_reason)}</p>
        </div>
      </div>
    )}

    {/* Employee section */}
    <section>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Employee</h3>
      <dl className="space-y-3">
        <div className="flex items-start gap-2">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          <div>
            <dt className="text-xs text-gray-500">Email</dt>
            <dd className="text-sm font-medium text-gray-900">{String(selectedItem.data.email)}</dd>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          <div>
            <dt className="text-xs text-gray-500">Requested</dt>
            <dd className="text-sm text-gray-900">
              {new Date(selectedItem.data.requested_at as string).toLocaleString()}
            </dd>
          </div>
        </div>
        {selectedItem.data.reviewed_at && (
          <div className="flex items-start gap-2">
            <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <div>
              <dt className="text-xs text-gray-500">Reviewed</dt>
              <dd className="text-sm text-gray-900">
                {new Date(selectedItem.data.reviewed_at as string).toLocaleString()}
              </dd>
            </div>
          </div>
        )}
      </dl>
    </section>

    {canActOnSelected && (
      ... (keep everything here EXACTLY unchanged — roles, companies, branches, resident branch, approval logs)
    )}
  </>
)}
```

---

## Task 9: Redesign panel body — Personal Information type

**Files:**
- Modify: same file, personal information body (~line 1044)

- [ ] **Step 1: Replace the metadata grid + rejection callout; keep submitted ID preview and editable fields unchanged**

Replace only:
```tsx
<div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
  <span className="text-gray-500">Email</span>
  <span className="font-medium text-gray-900">{selectedItem.data.email}</span>
  <span className="text-gray-500">Submitted</span>
  <span className="font-medium text-gray-900">
    {new Date(selectedItem.data.created_at).toLocaleString()}
  </span>
</div>
```

With:
```tsx
<section>
  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Employee</h3>
  <dl className="space-y-3">
    <div className="flex items-start gap-2">
      <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
      <div>
        <dt className="text-xs text-gray-500">Email</dt>
        <dd className="text-sm font-medium text-gray-900">{String(selectedItem.data.email)}</dd>
      </div>
    </div>
    <div className="flex items-start gap-2">
      <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
      <div>
        <dt className="text-xs text-gray-500">Submitted</dt>
        <dd className="text-sm text-gray-900">
          {new Date(selectedItem.data.created_at as string).toLocaleString()}
        </dd>
      </div>
    </div>
  </dl>
</section>
```

Replace the rejection callout:
```tsx
{selectedItem.data.status === 'rejected' && selectedItem.data.rejection_reason && (
  <div className="rounded bg-red-50 p-3 text-sm text-red-700">
    <span className="font-medium">Rejection reason: </span>
    {selectedItem.data.rejection_reason}
  </div>
)}
```

With:
```tsx
{selectedItem.data.status === 'rejected' && selectedItem.data.rejection_reason && (
  <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
    <div>
      <p className="text-xs font-semibold text-red-700">Rejection Reason</p>
      <p className="mt-0.5 text-sm text-red-600">{String(selectedItem.data.rejection_reason)}</p>
    </div>
  </div>
)}
```

Replace the requested changes section:
```tsx
<div className="rounded-lg bg-slate-200 p-3">
  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
    Requested Changes
  </p>
  <div className="space-y-2 text-sm text-gray-800">
    ...
  </div>
</div>
```

With:
```tsx
<section>
  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
    Requested Changes
  </h3>
  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
    <div className="space-y-2 text-sm text-gray-800">
      {personalChangedKeys.length === 0 && (
        <p className="text-gray-500">No requested changes.</p>
      )}
      {personalChangedKeys.map((key) => {
        const original = getCurrentPersonalValue(selectedItem.data, key);
        const approvedChanges = (selectedItem.data.approved_changes || {}) as Record<string, unknown>;
        const next = canActOnSelected
          ? personalInfoEdits[key]
          : (approvedChanges[key] ?? selectedRequestedChanges[key]);

        return (
          <div key={key} className="flex flex-wrap items-baseline gap-1.5">
            <span className="font-medium text-gray-700">{PERSONAL_FIELD_LABEL[key]}:</span>
            <span className="text-gray-400 line-through">{formatPersonalValue(key, original)}</span>
            <span className="text-gray-400">→</span>
            <span className="font-semibold text-gray-900">{formatPersonalValue(key, next)}</span>
          </div>
        );
      })}
    </div>
  </div>
</section>
```

Keep submitted ID preview and editable input fields grid completely unchanged.

---

## Task 10: Redesign panel body — Employment Requirements type

**Files:**
- Modify: same file, employment requirements body (~line 1288)

- [ ] **Step 1: Replace metadata grid + rejection callout; keep document preview unchanged**

Replace:
```tsx
<div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
  <span className="text-gray-500">Requirement</span>
  <span className="font-medium text-gray-900">{selectedItem.data.requirement_label}</span>
  <span className="text-gray-500">Email</span>
  <span className="font-medium text-gray-900">{selectedItem.data.email}</span>
  <span className="text-gray-500">Submitted</span>
  <span className="font-medium text-gray-900">
    {new Date(selectedItem.data.created_at).toLocaleString()}
  </span>
</div>
```

With:
```tsx
<section>
  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Details</h3>
  <dl className="space-y-3">
    <div className="flex items-start gap-2">
      <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
      <div>
        <dt className="text-xs text-gray-500">Requirement</dt>
        <dd className="text-sm font-medium text-gray-900">
          {String(selectedItem.data.requirement_label)}
        </dd>
      </div>
    </div>
    <div className="flex items-start gap-2">
      <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
      <div>
        <dt className="text-xs text-gray-500">Email</dt>
        <dd className="text-sm font-medium text-gray-900">{String(selectedItem.data.email)}</dd>
      </div>
    </div>
    <div className="flex items-start gap-2">
      <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
      <div>
        <dt className="text-xs text-gray-500">Submitted</dt>
        <dd className="text-sm text-gray-900">
          {new Date(selectedItem.data.created_at as string).toLocaleString()}
        </dd>
      </div>
    </div>
  </dl>
</section>
```

Replace rejection callout (same pattern as above — `AlertCircle` red border card).

Keep document preview (`selectedItem.data.document_url` section) completely unchanged.

---

## Task 11: Redesign panel body — Bank Information type

**Files:**
- Modify: same file, bank information body (~line 1346)

- [ ] **Step 1: Add `copiedAccountNumber` state reset in `openPanel`**

In `openPanel`, add:
```tsx
setCopiedAccountNumber(false);
```

- [ ] **Step 2: Replace bank information grid + rejection callout with icon-based section + copy button**

Replace:
```tsx
{selectedItem.type === 'bankInformation' && (
  <>
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
      ...
    </div>

    {selectedItem.data.status === 'rejected' && selectedItem.data.rejection_reason && (
      <div className="rounded bg-red-50 p-3 text-sm text-red-700">
        <span className="font-medium">Rejection reason: </span>
        {selectedItem.data.rejection_reason}
      </div>
    )}
  </>
)}
```

With:
```tsx
{selectedItem.type === 'bankInformation' && (
  <>
    {/* Rejection callout */}
    {selectedItem.data.status === 'rejected' && selectedItem.data.rejection_reason && (
      <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
        <div>
          <p className="text-xs font-semibold text-red-700">Rejection Reason</p>
          <p className="mt-0.5 text-sm text-red-600">
            {String(selectedItem.data.rejection_reason)}
          </p>
        </div>
      </div>
    )}

    {/* Bank Details section */}
    <section>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
        Bank Details
      </h3>
      <dl className="space-y-3">
        <div className="flex items-start gap-2">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          <div>
            <dt className="text-xs text-gray-500">Email</dt>
            <dd className="text-sm font-medium text-gray-900">{String(selectedItem.data.email)}</dd>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          <div>
            <dt className="text-xs text-gray-500">Bank</dt>
            <dd className="text-sm font-medium text-gray-900">
              {BANK_LABEL[Number(selectedItem.data.bank_id)] ?? `Bank ID ${String(selectedItem.data.bank_id)}`}
            </dd>
          </div>
        </div>
        {selectedItem.data.account_number && (
          <div className="flex items-start gap-2">
            <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <div>
              <dt className="text-xs text-gray-500">Account Number</dt>
              <dd className="flex items-center gap-1.5">
                <span className="font-mono text-sm text-gray-900">
                  {String(selectedItem.data.account_number)}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(String(selectedItem.data.account_number), () => {
                      setCopiedAccountNumber(true);
                      setTimeout(() => setCopiedAccountNumber(false), 2000);
                    })
                  }
                  className="rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  title="Copy account number"
                >
                  {copiedAccountNumber
                    ? <Check className="h-3.5 w-3.5 text-green-500" />
                    : <Copy className="h-3.5 w-3.5" />
                  }
                </button>
              </dd>
            </div>
          </div>
        )}
        <div className="flex items-start gap-2">
          <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          <div>
            <dt className="text-xs text-gray-500">Submitted</dt>
            <dd className="text-sm text-gray-900">
              {new Date(selectedItem.data.created_at as string).toLocaleString()}
            </dd>
          </div>
        </div>
        {selectedItem.data.reviewed_by_name && (
          <div className="flex items-start gap-2">
            <User className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <div>
              <dt className="text-xs text-gray-500">Reviewed By</dt>
              <dd className="text-sm font-medium text-gray-900">
                {String(selectedItem.data.reviewed_by_name)}
              </dd>
            </div>
          </div>
        )}
      </dl>
    </section>
  </>
)}
```

---

## Task 12: Final lint check

- [ ] **Step 1: Run ReadLints on the file**

Check `apps/web/src/features/employee-verifications/pages/EmployeeVerificationsPage.tsx` for linter errors. Fix any issues — commonly unused imports or type errors from `any` → string coercions.

- [ ] **Step 2: Verify `Card`, `CardBody`, `Spinner` are no longer referenced anywhere in the file**

Search for these strings. If any remain, remove them.
