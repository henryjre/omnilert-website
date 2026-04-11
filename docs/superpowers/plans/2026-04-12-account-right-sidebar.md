# Account Right Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the "My Account" nav section and user footer out of the left sidebar into a new right-side `AccountSidebar` that slides in when the topbar avatar is clicked.

**Architecture:** State for the right sidebar is lifted into `DashboardLayout` alongside the existing left mobile sidebar state. `DashboardLayout` renders both animated overlays symmetrically. `TopBar` receives two new props (`onOpenAccountSidebar`, `accountSidebarOpen`) and wraps the avatar in a motion button.

**Tech Stack:** React, TypeScript, Framer Motion, Tailwind CSS, React Router, Lucide React

---

## File Map

| File | Action |
|---|---|
| `apps/web/src/features/dashboard/components/AccountSidebar.tsx` | Create — new component |
| `apps/web/src/features/dashboard/components/Sidebar.tsx` | Modify — remove My Account section + footer |
| `apps/web/src/features/dashboard/components/DashboardLayout.tsx` | Modify — add right sidebar state + overlay |
| `apps/web/src/features/dashboard/components/TopBar.tsx` | Modify — avatar becomes clickable motion button |

---

### Task 1: Create `AccountSidebar` component

**Files:**
- Create: `apps/web/src/features/dashboard/components/AccountSidebar.tsx`

- [ ] **Step 1: Create the file with full content**

```tsx
import { type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar,
  Receipt,
  FileText,
  DollarSign,
  ClipboardList,
  Bell,
  IdCard,
  Settings,
  LogOut,
  X,
  ChevronDown,
} from 'lucide-react';
import { usePermission } from '@/shared/hooks/usePermission';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { PERMISSIONS } from '@omnilert/shared';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-primary-50 text-primary-700 shadow-sm'
      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
  }`;

const AnimatedNavLink = ({
  to,
  children,
  className,
  end,
  onClick,
}: {
  to: string;
  children: ReactNode;
  className?: any;
  end?: boolean;
  onClick?: () => void;
}) => (
  <motion.div whileHover={{ x: 4 }} whileTap={{ scale: 0.98 }} className="block">
    <NavLink to={to} className={className} end={end} onClick={onClick}>
      {children}
    </NavLink>
  </motion.div>
);

interface AccountSidebarProps {
  className?: string;
  onClose: () => void;
}

export function AccountSidebar({ className = '', onClose }: AccountSidebarProps) {
  const { hasPermission } = usePermission();
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    onClose();
    logout();
  };

  return (
    <aside className={`flex h-[100dvh] w-64 flex-col border-l border-gray-200 bg-white ${className}`}>
      {/* Header */}
      <div className="border-b border-gray-200">
        <div className="flex h-16 items-center justify-between px-6">
          <h1 className="text-sm font-semibold uppercase tracking-wide text-gray-400">My Account</h1>
          <motion.button
            type="button"
            onClick={onClose}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close account menu"
          >
            <X className="h-4 w-4" />
          </motion.button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {hasPermission(PERMISSIONS.ACCOUNT_VIEW_SCHEDULE) && (
          <AnimatedNavLink to="/account/schedule" className={linkClass} onClick={onClose}>
            <Calendar className="h-5 w-5" />
            My Schedule
          </AnimatedNavLink>
        )}
        <AnimatedNavLink to="/account/payslip" className={linkClass} onClick={onClose}>
          <Receipt className="h-5 w-5" />
          My Payslip
        </AnimatedNavLink>
        {hasPermission(PERMISSIONS.ACCOUNT_MANAGE_AUTH_REQUEST) && (
          <AnimatedNavLink to="/account/authorization-requests" className={linkClass} onClick={onClose}>
            <FileText className="h-5 w-5" />
            My Authorization Requests
          </AnimatedNavLink>
        )}
        {hasPermission(PERMISSIONS.ACCOUNT_MANAGE_CASH_REQUEST) && (
          <AnimatedNavLink to="/account/cash-requests" className={linkClass} onClick={onClose}>
            <DollarSign className="h-5 w-5" />
            My Cash Requests
          </AnimatedNavLink>
        )}
        {hasPermission(PERMISSIONS.ACCOUNT_VIEW_AUDIT_RESULTS) && (
          <AnimatedNavLink to="/account/audit-results" className={linkClass} onClick={onClose}>
            <ClipboardList className="h-5 w-5" />
            My Audit Results
          </AnimatedNavLink>
        )}
        <AnimatedNavLink to="/account/notifications" className={linkClass} onClick={onClose}>
          <Bell className="h-5 w-5" />
          My Notifications
        </AnimatedNavLink>
        <AnimatedNavLink to="/account/profile" className={linkClass} onClick={onClose}>
          <IdCard className="h-5 w-5" />
          My Profile
        </AnimatedNavLink>
        <AnimatedNavLink to="/account/settings" className={linkClass} onClick={onClose}>
          <Settings className="h-5 w-5" />
          My Settings
        </AnimatedNavLink>
      </nav>

      {/* User section */}
      <div className="mt-auto border-t border-gray-200 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="mb-2 text-sm">
          <p className="font-medium text-gray-900">
            {user?.firstName} {user?.lastName}
          </p>
          <p className="text-xs text-gray-500">{user?.email}</p>
        </div>
        <motion.button
          onClick={handleLogout}
          whileHover={{ x: 4 }}
          whileTap={{ scale: 0.98 }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </motion.button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles (no errors in this file)**

```bash
cd apps/web && rtk tsc --noEmit 2>&1 | head -40
```

Expected: zero errors, or only pre-existing errors unrelated to `AccountSidebar.tsx`.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/web/src/features/dashboard/components/AccountSidebar.tsx && rtk git commit -m "feat(sidebar): add AccountSidebar component with My Account nav and user footer"
```

---

### Task 2: Strip "My Account" section and footer from `Sidebar`

**Files:**
- Modify: `apps/web/src/features/dashboard/components/Sidebar.tsx`

- [ ] **Step 1: Remove My Account nav links**

In `Sidebar.tsx`, find the block starting at:
```tsx
        {categoryLabel('My Account')}
```
and ending just before:
```tsx
        {hasAnyPermission(
          PERMISSIONS.ANALYTICS_VIEW_EMPLOYEE_ANALYTICS,
```

Delete that entire block (the `categoryLabel('My Account')` line and all `AnimatedNavLink` elements under it — schedule, payslip, authorization requests, cash requests, audit results, notifications, profile, settings).

Also delete the `<div className="my-2 border-t border-gray-200" />` separator that immediately precedes `{categoryLabel('My Account')}` (the one after the Dashboard link).

- [ ] **Step 2: Remove the user footer**

Find and delete the entire `{/* User section */}` block at the bottom of `Sidebar.tsx`:

```tsx
      {/* User section */}
      <div className="mt-auto border-t border-gray-200 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="mb-2 text-sm">
          <p className="font-medium text-gray-900">
            {user?.firstName} {user?.lastName}
          </p>
          <p className="text-xs text-gray-500">{user?.email}</p>
        </div>
        <motion.button
          onClick={logout}
          whileHover={{ x: 4 }}
          whileTap={{ scale: 0.98 }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </motion.button>
      </div>
```

- [ ] **Step 3: Remove now-unused imports from `Sidebar.tsx`**

Remove from the lucide-react import: `Calendar`, `Receipt`, `FileText`, `DollarSign`, `ClipboardList`, `Bell`, `IdCard`, `Settings`, `LogOut`.

Remove `useAuth` import and its usage: `const { logout, user } = useAuth();`

Keep all other imports intact.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd apps/web && rtk tsc --noEmit 2>&1 | head -40
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/web/src/features/dashboard/components/Sidebar.tsx && rtk git commit -m "refactor(sidebar): move My Account section and user footer to AccountSidebar"
```

---

### Task 3: Update `TopBar` — avatar becomes a clickable motion button

**Files:**
- Modify: `apps/web/src/features/dashboard/components/TopBar.tsx`

- [ ] **Step 1: Add new props to `TopBarProps` interface**

Find:
```tsx
interface TopBarProps {
  onOpenSidebar?: () => void;
}
```

Replace with:
```tsx
interface TopBarProps {
  onOpenSidebar?: () => void;
  onOpenAccountSidebar?: () => void;
  accountSidebarOpen?: boolean;
}
```

- [ ] **Step 2: Destructure new props in the function signature**

Find:
```tsx
export function TopBar({ onOpenSidebar }: TopBarProps) {
```

Replace with:
```tsx
export function TopBar({ onOpenSidebar, onOpenAccountSidebar, accountSidebarOpen }: TopBarProps) {
```

- [ ] **Step 3: Replace the avatar div with a motion button**

Find the entire avatar block at the bottom of the return statement:
```tsx
        <div className="flex items-center gap-2">
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt="Profile"
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm font-medium text-primary-700">
              {user?.firstName?.[0]}
              {user?.lastName?.[0]}
            </div>
          )}
        </div>
```

Replace with:
```tsx
        <motion.button
          type="button"
          onClick={onOpenAccountSidebar}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={`cursor-pointer rounded-full transition-shadow focus:outline-none ${
            accountSidebarOpen
              ? 'ring-2 ring-primary-500'
              : 'hover:ring-2 hover:ring-primary-300'
          }`}
          aria-label="Open account menu"
        >
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt="Profile"
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm font-medium text-primary-700">
              {user?.firstName?.[0]}
              {user?.lastName?.[0]}
            </div>
          )}
        </motion.button>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd apps/web && rtk tsc --noEmit 2>&1 | head -40
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/web/src/features/dashboard/components/TopBar.tsx && rtk git commit -m "feat(topbar): make avatar a clickable motion button that opens account sidebar"
```

---

### Task 4: Wire right sidebar overlay in `DashboardLayout`

**Files:**
- Modify: `apps/web/src/features/dashboard/components/DashboardLayout.tsx`

- [ ] **Step 1: Add `AccountSidebar` import**

Add to the existing imports at the top of `DashboardLayout.tsx`:
```tsx
import { AccountSidebar } from './AccountSidebar';
import { ChevronRight } from 'lucide-react';
```

Note: `ChevronLeft` is already imported — add `ChevronRight` to the same import.

- [ ] **Step 2: Add `accountSidebarOpen` state and close-on-route-change effect**

Find:
```tsx
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [panStartX, setPanStartX] = useState<number | null>(null);
  const location = useLocation();

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);
```

Replace with:
```tsx
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [accountSidebarOpen, setAccountSidebarOpen] = useState(false);
  const [panStartX, setPanStartX] = useState<number | null>(null);
  const location = useLocation();

  useEffect(() => {
    setMobileSidebarOpen(false);
    setAccountSidebarOpen(false);
  }, [location.pathname]);
```

- [ ] **Step 3: Add Escape key handler for account sidebar**

Find the existing Escape key `useEffect`:
```tsx
  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileSidebarOpen]);
```

Replace with:
```tsx
  useEffect(() => {
    if (!mobileSidebarOpen && !accountSidebarOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileSidebarOpen(false);
        setAccountSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileSidebarOpen, accountSidebarOpen]);
```

- [ ] **Step 4: Add body scroll lock for account sidebar**

Find the existing body scroll lock `useEffect`:
```tsx
  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileSidebarOpen]);
```

Replace with:
```tsx
  useEffect(() => {
    if (!mobileSidebarOpen && !accountSidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileSidebarOpen, accountSidebarOpen]);
```

- [ ] **Step 5: Add the right sidebar overlay to the JSX**

Find the existing left mobile sidebar `AnimatePresence` block:
```tsx
      <AnimatePresence>
        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            ...
          </div>
        )}
      </AnimatePresence>
```

After that closing `</AnimatePresence>`, add:
```tsx
      <AnimatePresence>
        {accountSidebarOpen && (
          <div className="fixed inset-0 z-50">
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
              onClick={() => setAccountSidebarOpen(false)}
              aria-label="Close account menu"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              onPanEnd={(_, info) => {
                if (info.offset.x > 60) {
                  setAccountSidebarOpen(false);
                }
              }}
              className="absolute inset-y-0 right-0 flex h-[100dvh] w-72 max-w-[85vw] flex-col bg-white shadow-2xl shadow-black/20"
            >
              <AccountSidebar className="h-full w-full border-l-0" onClose={() => setAccountSidebarOpen(false)} />
              <motion.span
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                className="pointer-events-none absolute -left-10 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/90 p-1.5 text-gray-600 shadow-sm ring-1 ring-gray-200"
              >
                <ChevronRight className="h-4 w-4" />
              </motion.span>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
```

- [ ] **Step 6: Pass new props to `TopBar`**

Find:
```tsx
        <TopBar onOpenSidebar={() => setMobileSidebarOpen(true)} />
```

Replace with:
```tsx
        <TopBar
          onOpenSidebar={() => { setAccountSidebarOpen(false); setMobileSidebarOpen(true); }}
          onOpenAccountSidebar={() => { setMobileSidebarOpen(false); setAccountSidebarOpen(true); }}
          accountSidebarOpen={accountSidebarOpen}
        />
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd apps/web && rtk tsc --noEmit 2>&1 | head -40
```

Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
rtk git add apps/web/src/features/dashboard/components/DashboardLayout.tsx && rtk git commit -m "feat(layout): add right account sidebar overlay with spring animation and mutual exclusion"
```

---

### Task 5: End-to-end verification

- [ ] **Step 1: Start the dev server**

```bash
cd e:/Github/omnilert-website && pnpm dev
```

- [ ] **Step 2: Verify left sidebar has no My Account section**

Log in. Confirm the left sidebar starts with Dashboard, then goes directly to Analytics/Management/Store Operations/Administration sections. No "My Account" category label. No user name/email footer. No Sign Out button.

- [ ] **Step 3: Verify account sidebar opens on avatar click**

Click the avatar in the top-right of the topbar. Confirm:
- Right sidebar slides in from the right with spring animation
- Avatar has active `ring-2 ring-primary-500` ring while sidebar is open
- Sidebar shows "My Account" header with X button
- All account links are present (Schedule, Payslip, etc.) with correct permission guards
- User name, email, and Sign Out button appear in footer

- [ ] **Step 4: Verify close behaviors**

- Click the backdrop → sidebar closes
- Press Escape → sidebar closes
- Click the X button in the header → sidebar closes
- Click any nav link → navigates and sidebar closes

- [ ] **Step 5: Verify mutual exclusion (mobile)**

On mobile viewport (or DevTools mobile emulation):
- Open the left hamburger menu → left sidebar opens
- Open the account sidebar (avatar click) → left sidebar closes, right sidebar opens
- Open left sidebar again → right sidebar closes

- [ ] **Step 6: Verify avatar affordance**

Hover over the avatar — confirm hand cursor, scale increase, and `ring-2 ring-primary-300` ring appear. When sidebar is open, ring is `ring-primary-500`.

- [ ] **Step 7: Verify swipe-to-close**

On mobile or touch emulation: open the account sidebar, swipe right — confirm it closes.

- [ ] **Step 8: Final commit (if any fixups were needed)**

```bash
rtk git add -A && rtk git commit -m "fix: account sidebar end-to-end verification fixups"
```

Only run if fixups were needed. If everything worked from Task 4, skip this step.
