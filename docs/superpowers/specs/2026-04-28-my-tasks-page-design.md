# My Tasks Page — Design Spec

**Date:** 2026-04-28  
**Status:** Approved

---

## Context

Tasks can currently be assigned to users inside the Case Report detail panel. Users have no way to see their assigned tasks without navigating to a specific case report and opening the task panel. As task assignment spreads to new systems in the future, a centralized "My Tasks" view becomes essential. This page gives users a single place to review all tasks assigned to them across all systems, without needing to know which case or system the task belongs to.

---

## Scope

View-only. No task creation, editing, or completion on this page. Navigation to the parent case is the only action.

---

## Route & Navigation

| Surface | Change |
|---|---|
| URL | `/account/tasks` |
| BottomNav (mobile) | Enable disabled Tasks button → navigate to `/account/tasks` |
| AccountSidebar (desktop) | Add `AnimatedNavLink` to `/account/tasks` below "My Schedule" |
| Router | Add new route entry for `/account/tasks` |

---

## Backend

**New endpoint:** `GET /api/v1/account/tasks/me`

Returns all `CaseTask` records where the current user appears in `assignees[]`, augmented with parent case metadata:

```ts
CaseTask & {
  case_id: string;
  case_number: number;
  case_title: string;
}
```

A task is **pending** when the current user's `CaseTaskAssignee.completed_at` is `null`.  
A task is **completed** when the current user's `CaseTaskAssignee.completed_at` is non-null.

---

## Frontend

### New Files

| File | Purpose |
|---|---|
| `apps/web/src/features/account/pages/MyTasksPage.tsx` | Page component |
| `apps/web/src/features/account/components/MyTaskCard.tsx` | Individual task card |

### Modified Files

| File | Change |
|---|---|
| `apps/web/src/features/case-reports/services/caseReport.api.ts` | Add `getMyTasks()` API function |
| `apps/web/src/features/dashboard/components/BottomNav.tsx` | Enable Tasks button, navigate to `/account/tasks` |
| `apps/web/src/features/dashboard/components/AccountSidebar.tsx` | Add "My Tasks" nav link below "My Schedule" |
| `apps/web/src/app/router.tsx` | Register `/account/tasks` route |

---

## Component Design

### `MyTasksPage`

- Fetches tasks from `GET /api/v1/account/tasks/me` on mount
- Owns `ViewToggle` tab state: `'pending' | 'completed'`
- Splits tasks into two lists by checking current user's assignee `completed_at`
- Shows loading skeletons (3 cards, `animate-pulse`) while fetching
- Shows empty state when filtered list is empty

### `MyTaskCard`

Props: `task: CaseTask & { case_id, case_number, case_title }`, `onClick: () => void`

- **Top line:** task description, max 2 lines, `text-sm font-medium text-gray-900`
- **Bottom line:** `FileWarning` icon + `Case #XXXX · {case_title}` in `text-xs text-gray-500`
- **Right side:** `ChevronRight` icon in `text-gray-400`
- **Card:** `rounded-xl border border-gray-200 bg-white px-4 py-3 hover:shadow-sm transition-shadow`
- **Click:** navigates to `/case-reports?caseId={case_id}&taskId={task.id}`

### Empty State

- Centered `CheckSquare` icon in `text-gray-300`
- Message: "No pending tasks" or "No completed tasks yet"
- No action button

### Animations

- Cards stagger in with Framer Motion fade+slide (same pattern used in other account pages)
- Tab switch: instant, no slide animation needed (small list, no visual benefit)

---

## Reused Patterns & Components

| Pattern | Source |
|---|---|
| `ViewToggle` | `apps/web/src/shared/components/ui/ViewToggle.tsx` |
| `AnimatedNavLink` | `apps/web/src/features/dashboard/components/sidebar-nav.tsx` |
| Account page layout/structure | `apps/web/src/features/account/pages/AuditResultsPage.tsx` |
| Deep-link URL format (`?caseId=X&taskId=Y`) | Existing case reports page URL param handling |
| Staggered card entrance animation | Framer Motion, consistent with other account pages |

---

## Verification

1. Navigate to `/account/tasks` directly — page loads, shows loading skeletons then task list
2. Switch between Pending and Completed tabs — correct tasks shown in each
3. Click a task card — navigates to `/case-reports?caseId=X&taskId=Y`, case opens with task detail panel visible
4. Empty state — assign all tasks as complete, verify empty state renders correctly
5. BottomNav Tasks button (mobile viewport) — enabled, navigates to `/account/tasks`
6. AccountSidebar "My Tasks" link (desktop) — appears below "My Schedule", navigates correctly
7. No task permission required — all logged-in users can access `/account/tasks`
