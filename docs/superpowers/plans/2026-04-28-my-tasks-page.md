# My Tasks Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/account/tasks` page that shows all tasks assigned to the current user across all case reports, grouped by Pending / Completed tabs, with each card navigating to the parent case report via deep-link.

**Architecture:** A new `MyTasksPage` component fetches from a new backend endpoint `GET /api/v1/account/tasks/me`, splits tasks into pending/completed using the current user's `CaseTaskAssignee.completed_at`, and renders minimal `MyTaskCard` components under a `ViewToggle` tab switcher. Clicking a card navigates to `/case-reports?caseId=X&taskId=Y` using the existing deep-link system. No detail panel — view-only.

**Tech Stack:** React 18, React Router 7, Framer Motion, Tailwind CSS 3, Lucide icons, `ViewToggle` (existing), `AnimatedNavLink` (existing), `api.client` (existing axios wrapper)

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Create | `apps/web/src/features/account/pages/MyTasksPage.tsx` | Page: fetch, tab state, list render |
| Create | `apps/web/src/features/account/components/MyTaskCard.tsx` | Card: task description + case label + chevron |
| Modify | `apps/web/src/features/case-reports/services/caseReport.api.ts` | Add `getMyTasks()` API function |
| Modify | `apps/web/src/app/router.tsx` | Register `/account/tasks` route |
| Modify | `apps/web/src/features/dashboard/components/AccountSidebar.tsx` | Add "My Tasks" nav link |
| Modify | `apps/web/src/features/dashboard/components/BottomNav.tsx` | Enable Tasks button |

---

## Task 1: Add `getMyTasks` API function

**Files:**
- Modify: `apps/web/src/features/case-reports/services/caseReport.api.ts`

This adds the only new API call needed. The backend endpoint `GET /api/v1/account/tasks/me` returns `MyTask[]` — `CaseTask` augmented with `case_number` and `case_title`.

- [ ] **Step 1: Add the `MyTask` type and `getMyTasks` function**

Open `apps/web/src/features/case-reports/services/caseReport.api.ts`. At the top where other types are defined, add the `MyTask` type. Then add the function near the other task functions (after `completeCaseTask`):

```typescript
// Add after the existing imports/types at the top of the file:
export interface MyTask extends CaseTask {
  case_number: number;
  case_title: string;
}

// Add after completeCaseTask function:
export async function getMyTasks(): Promise<MyTask[]> {
  const response = await api.get('/account/tasks/me');
  return response.data.data as MyTask[];
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /home/phaeton/Projects/omnilert-website
rtk tsc --noEmit -p apps/web/tsconfig.json
```

Expected: no new errors introduced.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/web/src/features/case-reports/services/caseReport.api.ts
rtk git commit -m "feat(my-tasks): add getMyTasks API function"
```

---

## Task 2: Create `MyTaskCard` component

**Files:**
- Create: `apps/web/src/features/account/components/MyTaskCard.tsx`

A minimal presentational card. No state. Receives the task + a click handler.

- [ ] **Step 1: Create the file**

```typescript
// apps/web/src/features/account/components/MyTaskCard.tsx
import { ChevronRight, FileWarning } from 'lucide-react';
import type { MyTask } from '@/features/case-reports/services/caseReport.api';

interface MyTaskCardProps {
  task: MyTask;
  onClick: () => void;
}

export function MyTaskCard({ task, onClick }: MyTaskCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition-shadow hover:shadow-sm active:bg-gray-50"
    >
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-medium text-gray-900">
          {task.description}
        </p>
        <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
          <FileWarning className="h-3.5 w-3.5 shrink-0" />
          Case #{String(task.case_number).padStart(4, '0')} · {task.case_title}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
    </button>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
rtk tsc --noEmit -p apps/web/tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/web/src/features/account/components/MyTaskCard.tsx
rtk git commit -m "feat(my-tasks): add MyTaskCard component"
```

---

## Task 3: Create `MyTasksPage`

**Files:**
- Create: `apps/web/src/features/account/pages/MyTasksPage.tsx`

Fetches tasks on mount, splits into pending/completed by checking `task.assignees.find(a => a.user_id === currentUserId)?.completed_at`, renders `ViewToggle` + staggered card list. Uses `useAuth()` for current user ID. Uses `useNavigate()` to navigate on card click.

- [ ] **Step 1: Create the page**

```typescript
// apps/web/src/features/account/pages/MyTasksPage.tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckSquare } from 'lucide-react';
import { ViewToggle } from '@/shared/components/ui/ViewToggle';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { getMyTasks, type MyTask } from '@/features/case-reports/services/caseReport.api';
import { MyTaskCard } from '../components/MyTaskCard';

type TaskTab = 'pending' | 'completed';

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.3, ease: 'easeOut' },
  }),
};

function SkeletonCard() {
  return (
    <div className="flex animate-pulse items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="flex-1 space-y-2">
        <div className="h-3.5 w-3/4 rounded bg-gray-200" />
        <div className="h-3 w-1/2 rounded bg-gray-100" />
      </div>
      <div className="h-4 w-4 rounded bg-gray-200" />
    </div>
  );
}

function EmptyState({ tab }: { tab: TaskTab }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <CheckSquare className="mb-3 h-10 w-10 text-gray-300" />
      <p className="text-sm font-medium text-gray-500">
        {tab === 'pending' ? 'No pending tasks' : 'No completed tasks yet'}
      </p>
    </div>
  );
}

export function MyTasksPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { error: showErrorToast } = useAppToast();

  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TaskTab>('pending');

  useEffect(() => {
    let active = true;
    setLoading(true);

    void getMyTasks()
      .then((data) => {
        if (!active) return;
        setTasks(data);
      })
      .catch(() => {
        if (!active) return;
        showErrorToast('Failed to load tasks');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [showErrorToast]);

  const { pending, completed } = useMemo(() => {
    const p: MyTask[] = [];
    const c: MyTask[] = [];
    for (const task of tasks) {
      const assignee = task.assignees.find((a) => a.user_id === user?.id);
      if (assignee?.completed_at) {
        c.push(task);
      } else {
        p.push(task);
      }
    }
    return { pending: p, completed: c };
  }, [tasks, user?.id]);

  const visibleTasks = activeTab === 'pending' ? pending : completed;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">My Tasks</h1>
        <p className="mt-0.5 text-sm text-gray-500">Tasks assigned to you</p>
      </div>

      <ViewToggle
        options={[
          { id: 'pending', label: 'Pending' },
          { id: 'completed', label: 'Completed' },
        ]}
        activeId={activeTab}
        onChange={(id) => setActiveTab(id as TaskTab)}
        size="default"
      />

      <div className="mt-4 space-y-2">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : visibleTasks.length === 0 ? (
          <EmptyState tab={activeTab} />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial="hidden"
              animate="visible"
              className="space-y-2"
            >
              {visibleTasks.map((task, i) => (
                <motion.div key={task.id} custom={i} variants={cardVariants}>
                  <MyTaskCard
                    task={task}
                    onClick={() =>
                      navigate(`/case-reports?caseId=${task.case_id}&taskId=${task.id}`)
                    }
                  />
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
rtk tsc --noEmit -p apps/web/tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/web/src/features/account/pages/MyTasksPage.tsx
rtk git commit -m "feat(my-tasks): add MyTasksPage"
```

---

## Task 4: Register route in router

**Files:**
- Modify: `apps/web/src/app/router.tsx`

No permission guard — all authenticated users can view their own tasks.

- [ ] **Step 1: Add import**

In `apps/web/src/app/router.tsx`, add this import alongside the other account page imports (after line 14, near `AuditResultsPage`):

```typescript
import { MyTasksPage } from '@/features/account/pages/MyTasksPage';
```

- [ ] **Step 2: Add route**

In the children array, after the `account/payslip` route entry (around line 74), add:

```typescript
{
  path: 'account/tasks',
  element: <MyTasksPage />,
},
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
rtk tsc --noEmit -p apps/web/tsconfig.json
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
rtk git add apps/web/src/app/router.tsx
rtk git commit -m "feat(my-tasks): register /account/tasks route"
```

---

## Task 5: Wire up navigation — AccountSidebar

**Files:**
- Modify: `apps/web/src/features/dashboard/components/AccountSidebar.tsx`

Add a "My Tasks" link directly below the "My Schedule" link. Uses `CheckSquare` icon (already used in the rest of the app for tasks).

- [ ] **Step 1: Add CheckSquare to imports**

In `apps/web/src/features/dashboard/components/AccountSidebar.tsx`, `CheckSquare` needs to be added to the lucide-react import. The current import line (line 3) is:

```typescript
import {
  Calendar,
  Receipt,
  Wallet,
  FileText,
  DollarSign,
  ClipboardList,
  Bell,
  IdCard,
  Settings,
  LogOut,
  X,
} from 'lucide-react';
```

Change it to:

```typescript
import {
  Calendar,
  CheckSquare,
  Receipt,
  Wallet,
  FileText,
  DollarSign,
  ClipboardList,
  Bell,
  IdCard,
  Settings,
  LogOut,
  X,
} from 'lucide-react';
```

- [ ] **Step 2: Add nav link**

In the `<nav>` section, directly after the Schedule `AnimatedNavLink` block (after the closing `}` of the `hasPermission(PERMISSIONS.ACCOUNT_VIEW_SCHEDULE)` block, around line 58), add:

```tsx
<AnimatedNavLink to="/account/tasks" className={linkClass} onClick={onClose}>
  <CheckSquare className="h-5 w-5" />
  My Tasks
</AnimatedNavLink>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
rtk tsc --noEmit -p apps/web/tsconfig.json
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
rtk git add apps/web/src/features/dashboard/components/AccountSidebar.tsx
rtk git commit -m "feat(my-tasks): add My Tasks link to AccountSidebar"
```

---

## Task 6: Wire up navigation — BottomNav

**Files:**
- Modify: `apps/web/src/features/dashboard/components/BottomNav.tsx`

Remove the disabled state from the Tasks button and wire it to navigate to `/account/tasks`.

- [ ] **Step 1: Replace the disabled Tasks button**

In `apps/web/src/features/dashboard/components/BottomNav.tsx`, replace the entire disabled Tasks button block (lines 46–54):

```tsx
{/* Tasks — disabled */}
<button
  type="button"
  disabled
  className={`${tabClass(false)} opacity-40 cursor-not-allowed pointer-events-none`}
>
  <CheckSquare className="h-5 w-5" />
  Tasks
</button>
```

With:

```tsx
{/* Tasks */}
<button
  type="button"
  onClick={() => navigate('/account/tasks')}
  className={tabClass(isActive('/account/tasks'))}
>
  <CheckSquare className="h-5 w-5" />
  Tasks
</button>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
rtk tsc --noEmit -p apps/web/tsconfig.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/web/src/features/dashboard/components/BottomNav.tsx
rtk git commit -m "feat(my-tasks): enable Tasks tab in BottomNav"
```

---

## Task 7: Backend — `GET /api/v1/account/tasks/me`

**Files:**
- Explore the backend to find the right location. Based on the existing pattern for `/account/audit-results`, the route likely lives in `apps/api/src/features/account/` or `apps/api/src/routes/account/`.

The endpoint must:
1. Authenticate via JWT middleware (already applied at router level for all `/account` routes)
2. Query all `case_tasks` records where the current user appears in `case_task_assignees.user_id`
3. Join `case_reports` to get `case_number` and `title` (as `case_title`)
4. Return the standard `{ success: true, data: MyTask[] }` shape

- [ ] **Step 1: Find the account routes file**

```bash
rtk find apps/api/src -name "*.ts" | grep -i account
```

Look for a route file that handles `/account/audit-results`. That file is where the new route goes.

- [ ] **Step 2: Add the route handler**

In the identified account routes file, add after the existing account routes:

```typescript
// GET /account/tasks/me — tasks assigned to the current user
router.get('/tasks/me', async (req, res) => {
  const db = getDb();
  const userId = req.user!.id;
  const companyId = req.companyContext.companyId;

  const tasks = await db('case_tasks as ct')
    .join('case_task_assignees as cta', 'cta.task_id', 'ct.id')
    .join('case_reports as cr', 'cr.id', 'ct.case_id')
    .where('cta.user_id', userId)
    .where('cr.company_id', companyId)
    .select(
      'ct.id',
      'ct.case_id',
      'ct.created_by',
      'ct.created_by_name',
      'ct.source_message_id',
      'ct.source_message_content',
      'ct.source_message_user_name',
      'ct.description',
      'ct.discussion_message_id',
      'ct.created_at',
      'ct.updated_at',
      'ct.last_message_at',
      'ct.last_message_content',
      'ct.last_message_user_name',
      'ct.last_message_user_avatar',
      'ct.message_count',
      'cr.case_number',
      db.raw("cr.title as case_title"),
    )
    .orderBy('ct.created_at', 'desc');

  // Attach assignees to each task
  const taskIds = tasks.map((t: { id: string }) => t.id);
  const assignees = taskIds.length > 0
    ? await db('case_task_assignees').whereIn('task_id', taskIds)
    : [];

  const assigneesByTaskId = assignees.reduce(
    (acc: Record<string, unknown[]>, a: { task_id: string }) => {
      if (!acc[a.task_id]) acc[a.task_id] = [];
      acc[a.task_id].push(a);
      return acc;
    },
    {} as Record<string, unknown[]>
  );

  const result = tasks.map((t: { id: string }) => ({
    ...t,
    assignees: assigneesByTaskId[t.id] ?? [],
  }));

  res.json({ success: true, data: result });
});
```

- [ ] **Step 3: Test the endpoint manually**

Start the dev server:
```bash
pnpm dev
```

Then in another terminal, get a JWT token by logging in via the app and check:
```bash
curl -s -H "Authorization: Bearer <token>" http://localhost:3000/api/v1/account/tasks/me | rtk json
```

Expected: `{ "success": true, "data": [...] }` with tasks array (may be empty if no tasks are assigned to the user).

- [ ] **Step 4: Commit**

```bash
rtk git add apps/api/src/
rtk git commit -m "feat(my-tasks): add GET /account/tasks/me endpoint"
```

---

## Task 8: End-to-end verification

- [ ] **Step 1: Run the dev servers**

```bash
pnpm dev
```

- [ ] **Step 2: Verify BottomNav on mobile viewport**

Open the app in a browser. Resize to mobile (<1024px wide). Confirm the Tasks tab in the bottom nav is no longer greyed out and tapping it navigates to `/account/tasks`.

- [ ] **Step 3: Verify AccountSidebar on desktop**

On desktop (≥1024px), open the Account sidebar. Confirm "My Tasks" appears below "My Schedule" and clicking it navigates to `/account/tasks` and closes the sidebar.

- [ ] **Step 4: Verify page renders**

Navigate to `/account/tasks`. Confirm:
- Page header shows "My Tasks" and "Tasks assigned to you"
- ViewToggle shows "Pending" and "Completed" tabs
- Loading skeletons appear briefly then resolve
- If the user has pending tasks, they show in the Pending tab
- Switching to Completed shows completed tasks (or empty state)

- [ ] **Step 5: Verify card navigation**

Click a task card. Confirm it navigates to `/case-reports?caseId=X&taskId=Y` and the case report opens with the task detail panel visible.

- [ ] **Step 6: Verify empty states**

If a tab has no tasks, confirm the `CheckSquare` icon + message renders correctly ("No pending tasks" or "No completed tasks yet").

- [ ] **Step 7: Final commit**

```bash
rtk git add .
rtk git commit -m "feat(my-tasks): complete My Tasks page implementation"
```
