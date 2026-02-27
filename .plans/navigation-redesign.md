# Plan: Navigation Redesign — My Account Category + HR/Finance Dropdowns

## Context

Two navigation changes are requested:

1. **My Account** — currently a single sidebar link to `/account` which renders an internal tab layout (AccountPage with underline tabs). Replace this with a proper sidebar **category** where each sub-page (Schedule, Authorization Requests, Cash Requests, Notifications, Profile, Settings) is its own sidebar NavLink with icon + label, navigating directly to its own route and rendering its own standalone page with an icon + header layout. The AccountPage tab wrapper is dissolved.

2. **Sidebar category reorganization:**
   - Add a **"Human Resources"** collapsible dropdown under Management containing: Employee Profiles, Employee Schedule, Employee Requirements (the Service Crew category is dissolved)
   - Add an **"Accounting and Finance"** collapsible dropdown under Management containing: Cash Requests (moved from Management)
   - Authorization Requests, Employee Verifications stay directly under Management
   - Service Crew category is removed entirely (its items move into Human Resources)

---

## Files to Modify

### Frontend

1. `apps/web/src/features/dashboard/components/Sidebar.tsx`
   - Replace single "My Account" NavLink with a "My Account" category containing 6 NavLinks
   - Add HR and Accounting dropdown sub-categories under Management
   - Remove Service Crew category
   - Move Cash Requests into Accounting and Finance dropdown
   - Move Employee Schedule and Employee Requirements into Human Resources dropdown

2. `apps/web/src/app/router.tsx`
   - Dissolve `/account` nested route structure (remove AccountPage wrapper)
   - Each account sub-page becomes its own top-level route under the DashboardLayout
   - `/account` root redirects to `/account/schedule`

3. `apps/web/src/features/account/pages/AccountPage.tsx`
   - **Delete or gut this file** — it will no longer be used as a layout wrapper
   - Each tab component becomes a standalone page

4. Each account sub-page component (add icon + header to each):
   - `apps/web/src/features/account/components/ScheduleTab.tsx`
   - `apps/web/src/features/account/components/AuthorizationRequestsTab.tsx`
   - `apps/web/src/features/account/components/CashRequestsTab.tsx`
   - `apps/web/src/features/account/components/EmployeeNotificationsTab.tsx`
   - `apps/web/src/features/account/components/EmploymentTab.tsx` (Profile)
   - `apps/web/src/features/account/components/SettingsTab.tsx`

---

## Implementation Detail

### 1. Router changes — `apps/web/src/app/router.tsx`

**Remove** the `AccountPage` wrapper with nested children. Replace with flat direct routes:

```tsx
// REMOVE this block:
{
  path: 'account',
  element: <AccountPage />,
  children: [
    { index: true, element: <Navigate to="/account/schedule" replace /> },
    { path: 'schedule', element: <ScheduleTab /> },
    { path: 'authorization-requests', element: <AuthorizationRequestsTab /> },
    { path: 'cash-requests', element: <CashRequestsTab /> },
    { path: 'notifications', element: <EmployeeNotificationsTab /> },
    { path: 'settings', element: <SettingsTab /> },
    { path: 'profile', element: <EmploymentTab /> },
    { path: 'employment', element: <Navigate to="/account/profile" /> },
  ],
}

// REPLACE with flat routes (same paths, no wrapper):
{ path: 'account', element: <Navigate to="/account/schedule" replace /> },
{ path: 'account/schedule', element: <ScheduleTab /> },
{
  path: 'account/authorization-requests',
  element: (
    <PermissionGuard permission={PERMISSIONS.ACCOUNT_VIEW_AUTH_REQUESTS}>
      <AuthorizationRequestsTab />
    </PermissionGuard>
  ),
},
{
  path: 'account/cash-requests',
  element: (
    <PermissionGuard permission={PERMISSIONS.ACCOUNT_VIEW_CASH_REQUESTS}>
      <CashRequestsTab />
    </PermissionGuard>
  ),
},
{ path: 'account/notifications', element: <EmployeeNotificationsTab /> },
{ path: 'account/settings', element: <SettingsTab /> },
{ path: 'account/profile', element: <EmploymentTab /> },
{ path: 'account/employment', element: <Navigate to="/account/profile" replace /> },
```

Remove `AccountPage` import.

---

### 2. Add page headers to each account sub-page

Each component gets an icon + header matching the existing pattern used across the app.
Icons to use (Lucide):

| Page | Icon |
|---|---|
| Schedule | `Calendar` |
| Authorization Requests | `FileText` |
| Cash Requests | `DollarSign` |
| Notifications | `Bell` |
| Profile | `IdCard` |
| Settings | `Settings` |

Pattern to add at the top of each component's return (before existing content):

```tsx
<div className="space-y-6">
  <div className="flex items-center gap-3">
    <Calendar className="h-6 w-6 text-primary-600" />
    <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
  </div>
  {/* existing content */}
</div>
```

Each component already has a `space-y-6` wrapper or similar — wrap or adjust as needed without restructuring existing content.

---

### 3. Sidebar — `apps/web/src/features/dashboard/components/Sidebar.tsx`

#### A. Add dropdown state

The existing sidebar has no collapsible categories. Add state for the two new dropdowns:

```tsx
const [hrExpanded, setHrExpanded] = useState(true);
const [financeExpanded, setFinanceExpanded] = useState(true);
```

Default to `true` (expanded) so they don't feel hidden on first use. Persist open state in local storage optionally (keep it simple — default open is sufficient).

Auto-expand when a child route is active (use `useLocation` to check):

```tsx
const location = useLocation();
const hrPaths = ['/employee-profiles', '/employee-schedule', '/employee-requirements'];
const financePaths = ['/cash-requests'];
// Initialize expanded if currently on a child route
const [hrExpanded, setHrExpanded] = useState(
  () => hrPaths.some((p) => location.pathname.startsWith(p))
);
const [financeExpanded, setFinanceExpanded] = useState(
  () => financePaths.some((p) => location.pathname.startsWith(p))
);
```

#### B. Dropdown sub-category component pattern

```tsx
function SubCategory({
  label,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
      >
        <span>{label}</span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>
      {expanded && (
        <div className="ml-3 mt-0.5 space-y-0.5 border-l border-gray-200 pl-3">
          {children}
        </div>
      )}
    </div>
  );
}
```

#### C. New sidebar structure (relevant sections only)

**My Account category** — replace the single `<NavLink to="/account">` with:

```tsx
<div className="my-2 border-t border-gray-200" />
{categoryLabel('My Account')}
<NavLink to="/account/schedule" className={linkClass}>
  <Calendar className="h-5 w-5" />
  Schedule
</NavLink>
{hasPermission(PERMISSIONS.ACCOUNT_VIEW_AUTH_REQUESTS) && (
  <NavLink to="/account/authorization-requests" className={linkClass}>
    <FileText className="h-5 w-5" />
    Authorization Requests
  </NavLink>
)}
{hasPermission(PERMISSIONS.ACCOUNT_VIEW_CASH_REQUESTS) && (
  <NavLink to="/account/cash-requests" className={linkClass}>
    <DollarSign className="h-5 w-5" />
    Cash Requests
  </NavLink>
)}
<NavLink to="/account/notifications" className={linkClass}>
  <Bell className="h-5 w-5" />
  Notifications
</NavLink>
<NavLink to="/account/profile" className={linkClass}>
  <IdCard className="h-5 w-5" />
  Profile
</NavLink>
<NavLink to="/account/settings" className={linkClass}>
  <Settings className="h-5 w-5" />
  Settings
</NavLink>
```

**Management category** — update to:

```tsx
<div className="my-2 border-t border-gray-200" />
{categoryLabel('Management')}

{/* Authorization Requests — stays directly under Management */}
{hasAnyPermission([...]) && (
  <NavLink to="/authorization-requests" className={linkClass}>
    <FileText className="h-5 w-5" />
    Authorization Requests
  </NavLink>
)}

{/* Employee Verifications — stays directly under Management */}
{hasPermission(PERMISSIONS.EMPLOYEE_VERIFICATION_VIEW) && (
  <NavLink to="/employee-verifications" className={linkClass}>
    <Users className="h-5 w-5" />
    Employee Verifications
  </NavLink>
)}

{/* Human Resources dropdown */}
{(hasPermission(PERMISSIONS.EMPLOYEE_VIEW_ALL_PROFILES)
  || hasPermission(PERMISSIONS.SHIFT_VIEW_ALL)
  || hasPermission(PERMISSIONS.EMPLOYEE_REQUIREMENTS_APPROVE)) && (
  <SubCategory
    label="Human Resources"
    expanded={hrExpanded}
    onToggle={() => setHrExpanded((v) => !v)}
  >
    {hasPermission(PERMISSIONS.EMPLOYEE_VIEW_ALL_PROFILES) && (
      <NavLink to="/employee-profiles" className={linkClass}>
        <User className="h-5 w-5" />
        Employee Profiles
      </NavLink>
    )}
    {hasPermission(PERMISSIONS.SHIFT_VIEW_ALL) && (
      <NavLink to="/employee-schedule" className={linkClass}>
        <Calendar className="h-5 w-5" />
        Employee Schedule
      </NavLink>
    )}
    {hasPermission(PERMISSIONS.EMPLOYEE_REQUIREMENTS_APPROVE) && (
      <NavLink to="/employee-requirements" className={linkClass}>
        <ClipboardCheck className="h-5 w-5" />
        Employee Requirements
      </NavLink>
    )}
  </SubCategory>
)}

{/* Accounting and Finance dropdown */}
{hasPermission(PERMISSIONS.CASH_REQUEST_VIEW_ALL) && (
  <SubCategory
    label="Accounting and Finance"
    expanded={financeExpanded}
    onToggle={() => setFinanceExpanded((v) => !v)}
  >
    <NavLink to="/cash-requests" className={linkClass}>
      <DollarSign className="h-5 w-5" />
      Cash Requests
    </NavLink>
  </SubCategory>
)}
```

**Service Crew section** — remove entirely (its routes remain in the router, they are now accessed via Human Resources).

**Add missing icon imports** to the sidebar:
- `Bell` (for My Account > Notifications)
- `IdCard` (for My Account > Profile)
- `Settings` (for My Account > Settings)

`ChevronDown` is already imported.

---

### 4. AccountPage.tsx

This file is no longer needed as a layout. It can be deleted. Ensure no other file imports it. The `<Outlet />` pattern it used is removed since routes are now flat.

---

## Key Design Notes

- Route paths do not change (`/account/schedule`, `/account/profile`, etc.) — only the wrapper is removed. Deep links and existing redirect `/account/employment → /account/profile` are preserved.
- Permission guards that were previously inside AccountPage's tab filtering are moved to the route level in `router.tsx`.
- The `SubCategory` dropdown component defaults open and auto-expands when navigating to a child route, so users never land on a page with its sidebar group collapsed.
- Cash Requests moves to "Accounting and Finance" only in the **Management** sidebar (the admin-facing view). The My Account > Cash Requests sidebar link is separate and gated by `ACCOUNT_VIEW_CASH_REQUESTS`.
- `EMPLOYEE_REQUIREMENTS_APPROVE` is the permission that currently gates Employee Requirements in the Service Crew section — use the same permission for the HR dropdown.

---

## Verification

1. Sign in as a user with full permissions — confirm My Account category shows all 6 items in the sidebar.
2. Sign in as a user without `ACCOUNT_VIEW_AUTH_REQUESTS` — Authorization Requests item hidden in My Account.
3. Navigate to `/account/schedule` — page shows Calendar icon + "Schedule" header, no tab bar.
4. Navigate to `/account/profile` — page shows IdCard icon + "Profile" header.
5. Management section shows Authorization Requests and Employee Verifications directly; Human Resources and Accounting and Finance as collapsible sub-categories.
6. Click Human Resources chevron — collapses; click again — expands.
7. Navigate to `/employee-profiles` directly — Human Resources group is auto-expanded in sidebar.
8. Service Crew section no longer appears in sidebar.
9. `/account` root redirects to `/account/schedule`.
10. Old `/account/employment` redirect still works → `/account/profile`.
