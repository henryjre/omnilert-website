# Payslips Management Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Finance-facing "Payslips" management page under "Accounting and Finance" in the sidebar with an Overview tab (real data, branch-filtered, pending/draft only) and an Issuance/Deduction tab (form + mock records table).

**Architecture:** Mirrors the TokenPay management page pattern — a top-level `ViewToggle` between Overview and Issuance tabs, a portal-based spring-animated detail side panel for the Overview tab, and a form + mock records table for the Issuance tab. Real data fetched from the existing `/dashboard/payslips` endpoint.

**Tech Stack:** React 18, TanStack React Query (not used here — direct `api.get` like existing PayslipPage), Zustand (`useBranchStore`), Framer Motion, Tailwind CSS, Lucide icons, `@omnilert/shared` types.

---

## File Map

### New Files
- `apps/web/src/features/payslips/pages/PayslipsManagementPage.tsx` — page shell, tab orchestration
- `apps/web/src/features/payslips/components/PayslipsOverviewTab.tsx` — data fetching, branch filtering, status sub-tabs, list + portal detail panel
- `apps/web/src/features/payslips/components/PayslipManagementCard.tsx` — card component for the overview list
- `apps/web/src/features/payslips/components/PayslipManagementDetailPanel.tsx` — detail panel body (payslip breakdown)
- `apps/web/src/features/payslips/components/PayslipsIssuanceTab.tsx` — deduction form + mock records table

### Modified Files
- `packages/shared/src/constants/permissions.ts` — add 3 PAYSLIPS_* permission keys, category, prerequisites, descriptions
- `apps/web/src/features/dashboard/components/Sidebar.tsx` — add `/payslips` to FINANCE_PATHS and nav link
- `apps/web/src/app/router.tsx` — add payslips route with PermissionGuard

---

## Task 1: Add permissions to shared package

**Files:**
- Modify: `packages/shared/src/constants/permissions.ts`

- [ ] **Step 1: Add permission keys**

In `packages/shared/src/constants/permissions.ts`, after the TOKEN_PAY block (line 71), add:

```typescript
  // Payslips Management (3)
  PAYSLIPS_VIEW: 'payslips.view',
  PAYSLIPS_ISSUE: 'payslips.issue',
  PAYSLIPS_MANAGE: 'payslips.manage',
```

- [ ] **Step 2: Add PERMISSION_CATEGORIES entry**

After the `token_pay` category block (lines 185-193), add:

```typescript
  payslips: {
    label: 'Payslips',
    permissions: [
      PERMISSIONS.PAYSLIPS_VIEW,
      PERMISSIONS.PAYSLIPS_ISSUE,
      PERMISSIONS.PAYSLIPS_MANAGE,
    ],
  },
```

- [ ] **Step 3: Add PERMISSION_PREREQUISITES entries**

After `[PERMISSIONS.TOKEN_PAY_ACCOUNT_MANAGE]: PERMISSIONS.TOKEN_PAY_VIEW,` (line 228), add:

```typescript
  [PERMISSIONS.PAYSLIPS_ISSUE]: PERMISSIONS.PAYSLIPS_VIEW,
  [PERMISSIONS.PAYSLIPS_MANAGE]: PERMISSIONS.PAYSLIPS_VIEW,
```

- [ ] **Step 4: Add PERMISSION_DESCRIPTIONS entries**

After `[PERMISSIONS.TOKEN_PAY_ACCOUNT_MANAGE]: 'Suspend and unsuspend loyalty accounts',` (line 276), add:

```typescript
  [PERMISSIONS.PAYSLIPS_VIEW]: 'Access the Payslips management page',
  [PERMISSIONS.PAYSLIPS_ISSUE]: 'Submit payslip deduction and issuance requests',
  [PERMISSIONS.PAYSLIPS_MANAGE]: 'Approve and reject payslip deduction and issuance requests',
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd packages/shared && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
rtk git add packages/shared/src/constants/permissions.ts && rtk git commit -m "feat(payslips): add PAYSLIPS_VIEW/ISSUE/MANAGE permissions to shared package"
```

---

## Task 2: Create the page shell

**Files:**
- Create: `apps/web/src/features/payslips/pages/PayslipsManagementPage.tsx`

- [ ] **Step 1: Create the page file**

```tsx
import { useState } from 'react';
import { FileText, LayoutGrid, Send } from 'lucide-react';
import { ViewToggle, type ViewOption } from '@/shared/components/ui/ViewToggle';
import { PayslipsOverviewTab } from '../components/PayslipsOverviewTab';
import { PayslipsIssuanceTab } from '../components/PayslipsIssuanceTab';

type TabId = 'overview' | 'issuance';

const TABS: ViewOption<TabId>[] = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'issuance', label: 'Issuance', icon: Send },
];

export function PayslipsManagementPage() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">Payslips</h1>
        </div>
        <p className="mt-1 hidden text-sm text-gray-500 sm:block">
          Manage employee payslips, deductions, and issuances.
        </p>
      </div>
      <ViewToggle options={TABS} activeId={activeTab} onChange={setActiveTab} layoutId="payslips-tabs" />
      {activeTab === 'overview' && <PayslipsOverviewTab />}
      {activeTab === 'issuance' && <PayslipsIssuanceTab />}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
rtk git add apps/web/src/features/payslips/pages/PayslipsManagementPage.tsx && rtk git commit -m "feat(payslips): add PayslipsManagementPage shell with tab toggle"
```

---

## Task 3: Wire up sidebar and router

**Files:**
- Modify: `apps/web/src/features/dashboard/components/Sidebar.tsx`
- Modify: `apps/web/src/app/router.tsx`

- [ ] **Step 1: Update FINANCE_PATHS in Sidebar.tsx (line 39)**

Change:
```typescript
const FINANCE_PATHS = ['/cash-requests', '/token-pay'];
```
To:
```typescript
const FINANCE_PATHS = ['/cash-requests', '/token-pay', '/payslips'];
```

- [ ] **Step 2: Add import for FileText icon in Sidebar.tsx**

Find the lucide-react import line and add `FileText` to the import if not already present.

- [ ] **Step 3: Add PERMISSIONS.PAYSLIPS_VIEW check to the SubCategory condition**

Find the line (around line 244):
```typescript
{(hasPermission(PERMISSIONS.CASH_REQUESTS_VIEW) || hasPermission(PERMISSIONS.TOKEN_PAY_VIEW)) && (
```
Change to:
```typescript
{(hasPermission(PERMISSIONS.CASH_REQUESTS_VIEW) || hasPermission(PERMISSIONS.TOKEN_PAY_VIEW) || hasPermission(PERMISSIONS.PAYSLIPS_VIEW)) && (
```

- [ ] **Step 4: Add the Payslips nav link inside the SubCategory block**

After the Token Pay `AnimatedNavLink` block (around line 260), add:

```tsx
{hasPermission(PERMISSIONS.PAYSLIPS_VIEW) && (
  <AnimatedNavLink to="/payslips" className={linkClass}>
    <FileText className="h-5 w-5" />
    Payslips
  </AnimatedNavLink>
)}
```

- [ ] **Step 5: Add the route in router.tsx**

Find the imports at the top of `apps/web/src/app/router.tsx` and add:
```tsx
import { PayslipsManagementPage } from '@/features/payslips/pages/PayslipsManagementPage';
```

Then find the token-pay route block (lines 159-165):
```typescript
{
  path: 'token-pay',
  element: (
    <PermissionGuard permission={PERMISSIONS.TOKEN_PAY_VIEW}>
      <TokenPayManagementPage />
    </PermissionGuard>
  ),
},
```

Add immediately after it:
```typescript
{
  path: 'payslips',
  element: (
    <PermissionGuard permission={PERMISSIONS.PAYSLIPS_VIEW}>
      <PayslipsManagementPage />
    </PermissionGuard>
  ),
},
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd apps/web && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
rtk git add apps/web/src/features/dashboard/components/Sidebar.tsx apps/web/src/app/router.tsx && rtk git commit -m "feat(payslips): add /payslips route and sidebar nav link under Accounting and Finance"
```

---

## Task 4: Create the PayslipManagementCard component

**Files:**
- Create: `apps/web/src/features/payslips/components/PayslipManagementCard.tsx`

- [ ] **Step 1: Create the card file**

```tsx
import React from 'react';
import type { PayslipListItem, PayslipStatus } from '@omnilert/shared';
import { Calendar, Clock } from 'lucide-react';

function formatPHP(amount: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
}

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-PH', { month: 'short', day: '2-digit', year: 'numeric' });
}

function getStatusBadge(status: PayslipStatus): { label: string; className: string } {
  switch (status) {
    case 'pending':
      return { label: 'Pending', className: 'bg-amber-50 text-amber-700 ring-amber-200' };
    case 'draft':
      return { label: 'Draft', className: 'bg-blue-50 text-blue-700 ring-blue-200' };
    case 'completed':
      return { label: 'Completed', className: 'bg-green-50 text-green-700 ring-green-200' };
  }
}

interface PayslipManagementCardProps {
  payslip: PayslipListItem;
  selected: boolean;
  onSelect: () => void;
}

export const PayslipManagementCard = React.memo(({ payslip, selected, onSelect }: PayslipManagementCardProps) => {
  const badge = getStatusBadge(payslip.status);
  const cutoffLabel = payslip.cutoff === 1 ? '1st Cutoff' : '2nd Cutoff';
  const periodLabel = `${formatShortDate(payslip.date_from)} – ${formatShortDate(payslip.date_to)}`;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-xl border px-4 py-3.5 text-left transition-colors ${
        selected ? 'border-primary-500 bg-primary-50' : 'border-gray-200 bg-white hover:bg-gray-50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${badge.className}`}
        >
          {badge.label}
        </span>
        <span className="shrink-0 text-right text-xs font-medium text-gray-500">{cutoffLabel}</span>
      </div>

      <div className="mt-1.5 text-sm font-semibold text-gray-900">{payslip.employee_name}</div>

      <div className="mt-1 flex items-center gap-1.5 text-sm text-gray-600">
        <Calendar className="h-3.5 w-3.5 shrink-0 text-gray-400" />
        {periodLabel}
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-gray-500">
        <span className="truncate">{payslip.company_name}</span>
        {payslip.is_pending ? (
          <span className="flex shrink-0 items-center gap-1 text-amber-600">
            <Clock className="h-3 w-3" />
            Not yet generated
          </span>
        ) : payslip.net_pay !== undefined ? (
          <span className="shrink-0 font-semibold text-gray-700">{formatPHP(payslip.net_pay)}</span>
        ) : null}
      </div>
    </button>
  );
});
```

- [ ] **Step 2: Commit**

```bash
rtk git add apps/web/src/features/payslips/components/PayslipManagementCard.tsx && rtk git commit -m "feat(payslips): add PayslipManagementCard component"
```

---

## Task 5: Create the PayslipManagementDetailPanel component

**Files:**
- Create: `apps/web/src/features/payslips/components/PayslipManagementDetailPanel.tsx`

This is a close adaptation of `apps/web/src/features/account/components/PayslipDetailPanel.tsx` — same layout, no changes to the breakdown structure.

- [ ] **Step 1: Create the panel file**

```tsx
import type { PayslipDetailResponse } from '@omnilert/shared';
import { Spinner } from '@/shared/components/ui/Spinner';

function formatPHP(amount: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
}

interface PayslipManagementDetailPanelProps {
  detail: PayslipDetailResponse | null;
  loading: boolean;
}

export function PayslipManagementDetailPanel({ detail, loading }: PayslipManagementDetailPanelProps) {
  if (loading || !detail) {
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
      <div className="text-sm text-gray-600">
        Period: <span className="font-medium text-gray-900">{detail.period}</span>
      </div>

      {/* Attendance Computation */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Attendance Computation</h3>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">Name</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Days</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Hours</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">Amount</th>
              </tr>
            </thead>
            <tbody>
              {detail.attendance.items.map((item, index) => (
                <tr key={index} className="border-t border-gray-100">
                  <td className="px-3 py-2 text-gray-700">{item.name}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{item.days.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{item.hours.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-medium text-gray-700">{formatPHP(item.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 font-medium">
              <tr className="border-t border-gray-200">
                <td className="px-3 py-2 text-gray-700">Total</td>
                <td className="px-3 py-2 text-right text-gray-700">{detail.attendance.totalDays.toFixed(2)}</td>
                <td className="px-3 py-2 text-right text-gray-700">{detail.attendance.totalHours.toFixed(2)}</td>
                <td className="px-3 py-2 text-right text-gray-700">{formatPHP(detail.attendance.totalAmount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Salary Computation */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Salary Computation</h3>

        <div className="mb-4">
          <h4 className="mb-2 text-xs font-medium uppercase text-green-700">Taxable Salary</h4>
          {detail.salary.taxable.length > 0 ? (
            <div className="space-y-1 rounded border border-gray-200 p-3">
              {detail.salary.taxable.map((item, index) => (
                <div key={index} className="flex justify-between text-sm">
                  <span className="text-gray-600">{item.description}</span>
                  <span className="font-medium">{formatPHP(item.amount)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm italic text-gray-400">No taxable earnings yet.</p>
          )}
        </div>

        <div className="mb-4">
          <h4 className="mb-2 text-xs font-medium uppercase text-green-700">Non-Taxable Salary</h4>
          {detail.salary.nonTaxable.length > 0 ? (
            <div className="space-y-1 rounded border border-gray-200 p-3">
              {detail.salary.nonTaxable.map((item, index) => (
                <div key={index} className="flex justify-between text-sm">
                  <span className="text-gray-600">{item.description}</span>
                  <span className="font-medium">{formatPHP(item.amount)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm italic text-gray-400">No non-taxable earnings yet.</p>
          )}
        </div>

        <div className="mb-4">
          <h4 className="mb-2 text-xs font-medium uppercase text-red-700">Deductions</h4>
          {detail.salary.deductions.length > 0 ? (
            <div className="space-y-1 rounded border border-gray-200 p-3">
              {detail.salary.deductions.map((item, index) => (
                <div key={index} className="flex justify-between text-sm">
                  <span className="text-gray-600">{item.description}</span>
                  <span className="font-medium text-red-600">{formatPHP(item.amount)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm italic text-gray-400">No deductions for this payslip.</p>
          )}
        </div>

        <div className="mt-4 rounded-lg bg-primary-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold text-primary-800">Net Pay</span>
            <span className="text-2xl font-bold text-primary-700">{formatPHP(detail.netPay)}</span>
          </div>
        </div>
      </div>

      {detail.status !== 'completed' && (
        <div className="rounded bg-amber-50 px-3 py-2 text-center text-xs text-amber-800">
          This payslip may not be accurate. Official payslips are distributed by the Finance
          Department through email.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
rtk git add apps/web/src/features/payslips/components/PayslipManagementDetailPanel.tsx && rtk git commit -m "feat(payslips): add PayslipManagementDetailPanel component"
```

---

## Task 6: Create the PayslipsOverviewTab component

**Files:**
- Create: `apps/web/src/features/payslips/components/PayslipsOverviewTab.tsx`

- [ ] **Step 1: Create the overview tab file**

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { PayslipDetailResponse, PayslipListItem, PayslipStatus } from '@omnilert/shared';
import { FileEdit, FileText, Clock, X } from 'lucide-react';
import { api } from '@/shared/services/api.client';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { useBranchStore } from '@/shared/store/branchStore';
import { Pagination } from '@/shared/components/ui/Pagination';
import { Spinner } from '@/shared/components/ui/Spinner';
import { PayslipManagementCard } from './PayslipManagementCard';
import { PayslipManagementDetailPanel } from './PayslipManagementDetailPanel';

type StatusTab = 'pending' | 'draft';

const PAGE_SIZE = 10;

function CardSkeleton() {
  return (
    <div className="w-full animate-pulse rounded-xl border border-gray-200 bg-white px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="h-5 w-16 rounded-md bg-gray-200" />
        <div className="h-4 w-14 rounded bg-gray-200" />
      </div>
      <div className="mt-1.5 h-4 w-40 rounded bg-gray-200" />
      <div className="mt-1 flex items-center gap-1.5">
        <div className="h-3.5 w-3.5 shrink-0 rounded-full bg-gray-200" />
        <div className="h-4 w-48 rounded bg-gray-200" />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <div className="h-3.5 w-36 rounded bg-gray-200" />
        <div className="h-3.5 w-20 rounded bg-gray-200" />
      </div>
    </div>
  );
}

export function PayslipsOverviewTab() {
  const { error: showError } = useAppToast();
  const { selectedBranchIds, branches } = useBranchStore();

  const [allPayslips, setAllPayslips] = useState<PayslipListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState<StatusTab>('pending');
  const [page, setPage] = useState(1);
  const [selectedPayslipId, setSelectedPayslipId] = useState<string | null>(null);
  const [selectedPayslipDetail, setSelectedPayslipDetail] = useState<PayslipDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Fetch all payslips on mount
  useEffect(() => {
    let active = true;
    setLoading(true);

    void api.get('/dashboard/payslips')
      .then((response) => {
        if (!active) return;
        const items = (response.data.data?.items ?? []) as PayslipListItem[];
        // Keep only pending and draft for this management view
        setAllPayslips(items.filter((p) => p.status === 'pending' || p.status === 'draft'));
      })
      .catch((err: unknown) => {
        if (!active) return;
        const axiosErr = err as { response?: { data?: { error?: string; message?: string } } };
        showError(axiosErr?.response?.data?.error ?? axiosErr?.response?.data?.message ?? 'Failed to load payslips.');
      })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [showError]);

  // Fetch detail when a card is selected
  useEffect(() => {
    if (!selectedPayslipId) {
      setSelectedPayslipDetail(null);
      return;
    }

    let active = true;
    setDetailLoading(true);

    void api.get(`/dashboard/payslips/${encodeURIComponent(selectedPayslipId)}`)
      .then((response) => {
        if (!active) return;
        setSelectedPayslipDetail(response.data.data as PayslipDetailResponse);
      })
      .catch((err: unknown) => {
        if (!active) return;
        const axiosErr = err as { response?: { data?: { error?: string; message?: string } } };
        showError(axiosErr?.response?.data?.error ?? axiosErr?.response?.data?.message ?? 'Failed to load payslip details.');
        setSelectedPayslipId(null);
      })
      .finally(() => { if (active) setDetailLoading(false); });

    return () => { active = false; };
  }, [selectedPayslipId, showError]);

  // Reset page on tab or branch change
  useEffect(() => { setPage(1); }, [statusTab, selectedBranchIds]);

  // Map selected branch IDs to Odoo company IDs for filtering
  const selectedOdooCompanyIds = useMemo<Set<number>>(() => {
    const selectedSet = new Set(selectedBranchIds);
    return new Set(
      branches
        .filter((b) => selectedSet.has(b.id) && b.odoo_branch_id)
        .map((b) => Number(b.odoo_branch_id)),
    );
  }, [selectedBranchIds, branches]);

  const filteredPayslips = useMemo<PayslipListItem[]>(() => {
    let result = allPayslips.filter((p) => p.status === statusTab);
    if (selectedOdooCompanyIds.size > 0) {
      result = result.filter((p) => selectedOdooCompanyIds.has(p.company_id));
    }
    return result;
  }, [allPayslips, statusTab, selectedOdooCompanyIds]);

  const totalPages = Math.max(1, Math.ceil(filteredPayslips.length / PAGE_SIZE));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const paginatedPayslips = filteredPayslips.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);

  const handleSelectPayslip = useCallback((id: string) => { setSelectedPayslipId(id); }, []);
  const handleClosePanel = useCallback(() => {
    setSelectedPayslipId(null);
    setSelectedPayslipDetail(null);
  }, []);

  const panelOpen = Boolean(selectedPayslipId);
  const selectedPayslipMeta = allPayslips.find((p) => p.id === selectedPayslipId);

  return (
    <>
      <div className="space-y-4">
        {/* Status sub-tabs */}
        <div className="flex gap-1 rounded-xl bg-gray-100 p-1 w-fit">
          {(['pending', 'draft'] as StatusTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => { setStatusTab(tab); setSelectedPayslipId(null); }}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                statusTab === tab
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'pending' ? <Clock className="h-3.5 w-3.5" /> : <FileEdit className="h-3.5 w-3.5" />}
              {tab === 'pending' ? 'Pending' : 'Draft'}
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : paginatedPayslips.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
            <FileText className="h-4 w-4 shrink-0 text-gray-300" />
            <p className="text-sm text-gray-400">No {statusTab} payslips found.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {paginatedPayslips.map((payslip) => (
              <PayslipManagementCard
                key={payslip.id}
                payslip={payslip}
                selected={payslip.id === selectedPayslipId}
                onSelect={() => handleSelectPayslip(payslip.id)}
              />
            ))}
            {totalPages > 1 && (
              <div className="border-t border-gray-100 pt-4">
                <Pagination currentPage={clampedPage} totalPages={totalPages} onPageChange={setPage} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Portaled detail panel */}
      {createPortal(
        <AnimatePresence>
          {panelOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
                onClick={handleClosePanel}
              />
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300, mass: 0.8 }}
                className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[680px] flex-col overflow-hidden bg-white shadow-2xl"
              >
                {/* Panel header */}
                <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">
                      {selectedPayslipMeta ? selectedPayslipMeta.employee_name : 'Payslip Detail'}
                    </h2>
                    {selectedPayslipMeta && (
                      <p className="text-xs text-gray-500">
                        {selectedPayslipMeta.cutoff === 1 ? '1st' : '2nd'} Cutoff
                        {' · '}
                        {selectedPayslipMeta.company_name}
                        {' · '}
                        {selectedPayslipMeta.date_from} to {selectedPayslipMeta.date_to}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleClosePanel}
                    className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    aria-label="Close payslip detail"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Panel body */}
                <PayslipManagementDetailPanel detail={selectedPayslipDetail} loading={detailLoading} />
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/web/src/features/payslips/components/PayslipsOverviewTab.tsx && rtk git commit -m "feat(payslips): add PayslipsOverviewTab with real data, branch filtering, and detail panel"
```

---

## Task 7: Create the PayslipsIssuanceTab component

**Files:**
- Create: `apps/web/src/features/payslips/components/PayslipsIssuanceTab.tsx`

- [ ] **Step 1: Create the issuance tab file**

```tsx
import { useMemo, useState } from 'react';
import { useBranchStore } from '@/shared/store/branchStore';
import { useAppToast } from '@/shared/hooks/useAppToast';

type DeductionType = 'Damages' | 'Penalties';

interface MockEmployee {
  id: string;
  name: string;
  branchId: string;
}

interface MockRecord {
  id: string;
  employeeName: string;
  branchName: string;
  type: DeductionType;
  amount: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  date: string;
}

const MOCK_EMPLOYEES: MockEmployee[] = [
  { id: 'e1', name: 'Juan Dela Cruz', branchId: '' },
  { id: 'e2', name: 'Maria Santos', branchId: '' },
  { id: 'e3', name: 'Pedro Reyes', branchId: '' },
];

const MOCK_RECORDS: MockRecord[] = [
  { id: 'r1', employeeName: 'Juan Dela Cruz', branchName: 'Main Branch', type: 'Damages', amount: 500, reason: 'Broken equipment', status: 'pending', date: '2026-04-01' },
  { id: 'r2', employeeName: 'Maria Santos', branchName: 'Main Branch', type: 'Penalties', amount: 250, reason: 'Late submission', status: 'approved', date: '2026-04-05' },
  { id: 'r3', employeeName: 'Pedro Reyes', branchName: 'North Branch', type: 'Damages', amount: 1500, reason: 'Cash shortage', status: 'rejected', date: '2026-04-10' },
  { id: 'r4', employeeName: 'Maria Santos', branchName: 'Main Branch', type: 'Penalties', amount: 100, reason: 'Dress code violation', status: 'pending', date: '2026-04-15' },
];

function formatPHP(amount: number): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
}

function StatusBadge({ status }: { status: MockRecord['status'] }) {
  const config = {
    pending: { label: 'Pending', className: 'bg-amber-50 text-amber-700 ring-amber-200' },
    approved: { label: 'Approved', className: 'bg-green-50 text-green-700 ring-green-200' },
    rejected: { label: 'Rejected', className: 'bg-red-50 text-red-700 ring-red-200' },
  }[status];
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${config.className}`}>
      {config.label}
    </span>
  );
}

export function PayslipsIssuanceTab() {
  const { success: showSuccess } = useAppToast();
  const { companyBranchGroups, selectedBranchIds } = useBranchStore();

  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [type, setType] = useState<DeductionType>('Damages');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  // Only show branches that are currently selected in the global BranchSelector
  const availableBranches = useMemo(() => {
    return companyBranchGroups.flatMap((g) =>
      g.branches.filter((b) => selectedBranchIds.includes(b.id)),
    );
  }, [companyBranchGroups, selectedBranchIds]);

  // Mock: all employees are available for any branch (real API integration will filter by branch)
  const availableEmployees = useMemo(() => {
    if (!selectedBranchId) return [];
    return MOCK_EMPLOYEES;
  }, [selectedBranchId]);

  const handleBranchChange = (branchId: string) => {
    setSelectedBranchId(branchId);
    setSelectedEmployeeId('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Mock submit — real endpoint wired in during backend integration
    showSuccess('Deduction request submitted.');
    setSelectedBranchId('');
    setSelectedEmployeeId('');
    setType('Damages');
    setAmount('');
    setReason('');
  };

  const selectClass = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-gray-50 disabled:text-gray-400';
  const labelClass = 'block text-sm font-medium text-gray-700 mb-1';

  return (
    <div className="space-y-6">
      {/* Deduction form */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-gray-900">Submit Deduction</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Branch */}
            <div>
              <label htmlFor="branch" className={labelClass}>Branch</label>
              <select
                id="branch"
                value={selectedBranchId}
                onChange={(e) => handleBranchChange(e.target.value)}
                className={selectClass}
                required
              >
                <option value="">Select a branch...</option>
                {availableBranches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            {/* Employee */}
            <div>
              <label htmlFor="employee" className={labelClass}>Employee</label>
              <select
                id="employee"
                value={selectedEmployeeId}
                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                className={selectClass}
                disabled={!selectedBranchId}
                required
              >
                <option value="">Select an employee...</option>
                {availableEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>

            {/* Type */}
            <div>
              <label htmlFor="type" className={labelClass}>Type</label>
              <select
                id="type"
                value={type}
                onChange={(e) => setType(e.target.value as DeductionType)}
                className={selectClass}
                required
              >
                <option value="Damages">Damages</option>
                <option value="Penalties">Penalties</option>
              </select>
            </div>

            {/* Amount */}
            <div>
              <label htmlFor="amount" className={labelClass}>Amount (₱)</label>
              <input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={selectClass}
                required
              />
            </div>
          </div>

          {/* Reason */}
          <div>
            <label htmlFor="reason" className={labelClass}>Reason</label>
            <textarea
              id="reason"
              rows={3}
              placeholder="Enter reason..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={selectClass}
              required
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
            >
              Submit Deduction
            </button>
          </div>
        </form>
      </div>

      {/* Records table */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Records</h2>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {MOCK_RECORDS.map((record) => (
                <tr key={record.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{record.employeeName}</td>
                  <td className="px-4 py-3 text-gray-600">{record.branchName}</td>
                  <td className="px-4 py-3 text-gray-600">{record.type}</td>
                  <td className="px-4 py-3 text-right font-semibold text-red-600">{formatPHP(record.amount)}</td>
                  <td className="max-w-[180px] truncate px-4 py-3 text-gray-600">{record.reason}</td>
                  <td className="px-4 py-3"><StatusBadge status={record.status} /></td>
                  <td className="px-4 py-3 text-gray-500">{record.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/web && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/web/src/features/payslips/components/PayslipsIssuanceTab.tsx && rtk git commit -m "feat(payslips): add PayslipsIssuanceTab with form and mock records table"
```

---

## Task 8: End-to-end verification

- [ ] **Step 1: Start the dev servers**

```bash
pnpm up:dev
```

- [ ] **Step 2: Verify sidebar**

Navigate to the app in the browser. Confirm "Payslips" appears under "Accounting and Finance" in the sidebar (visible only when user has `PAYSLIPS_VIEW` permission or if testing without permission guards in dev).

- [ ] **Step 3: Verify Overview tab**

Navigate to `/payslips`. Confirm:
- Page header shows "Payslips" with FileText icon
- Overview tab is active by default
- Status sub-tabs show "Pending" (active by default) and "Draft"
- List loads real payslip data from `/dashboard/payslips` filtered to pending/draft only
- Switching branch in the global BranchSelector re-filters the list
- Clicking a card slides in the detail panel with the payslip breakdown
- Clicking the backdrop or X closes the panel

- [ ] **Step 4: Verify Issuance tab**

Click the "Issuance" tab. Confirm:
- Branch dropdown shows only branches currently selected in the global BranchSelector
- Employee dropdown is disabled until a branch is selected
- Selecting a branch enables the Employee dropdown
- Form submits and shows a success toast, then resets
- Records table shows the 4 mock records with correct columns and status badges

- [ ] **Step 5: Verify permissions page (Roles)**

Navigate to the roles management page. Confirm the "Payslips" permission group appears with "View Payslip Management", "Issue Payslip Adjustment", and "Manage Payslip Adjustments" entries.
