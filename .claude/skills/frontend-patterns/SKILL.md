---
name: frontend-patterns
description: Frontend patterns, conventions, and architecture for Omnilert — feature folder structure, Zustand stores, React Query data fetching, API client usage, shared UI components, routing, Socket.io hooks, permission guards, and page layout patterns. Read this before building any new page, feature, component, hook, or store in apps/web.
type: reference
---

# Skill: Frontend Patterns

## Tech Stack (apps/web)

- **React 18** + **React Router 7** + **Vite 6**
- **Zustand 5** (persisted stores) for global/session state
- **TanStack React Query 5** for server state
- **Axios** via shared API client (`@/shared/services/api.client.ts`)
- **Tailwind CSS 3**, **Headless UI 2**, **Lucide React** icons
- **Framer Motion** for animations
- **React Hook Form 7** + Zod for forms
- **Sonner** for toasts
- **Socket.io-client 4** for realtime
- `@` path alias → `apps/web/src/`

---

## Feature Folder Structure

Each feature lives under `apps/web/src/features/{feature-name}/`:

```
features/case-reports/
├── pages/           — Route-level components (one per page)
├── components/      — Feature-specific components
├── services/        — Axios calls (API functions)
├── hooks/           — React Query hooks wrapping services
└── store/           — Zustand stores (if feature needs local state)
```

Shared code lives in `apps/web/src/shared/`:

```
shared/
├── components/ui/   — Reusable UI primitives
├── services/        — api.client.ts, queryClient.ts
├── store/           — Global stores (auth, branch, notifications)
└── hooks/           — Cross-feature hooks (useSocket, etc.)
```

---

## API Client

Import from `@/shared/services/api.client.ts`:

```ts
import api from '@/shared/services/api.client';

// GET
const res = await api.get<ApiResponse<User[]>>('/users');

// POST with body
const res = await api.post<ApiResponse<CaseReport>>('/case-reports', payload);
```

The client automatically:
- Attaches `Authorization: Bearer <accessToken>` from `useAuthStore`
- Attaches `X-Company-Id` header derived from the first selected branch's `companyId`
- Auto-refreshes tokens on 401 (dual-token pattern, single in-flight refresh)
- Removes `Content-Type` for FormData (lets browser set multipart boundary)

---

## Zustand Stores

### Auth Store (`@/features/auth/store/authSlice.ts`)

```ts
const { user, accessToken, companySlug, isAuthenticated } = useAuthStore();
const { logout, setAuth, setTokens } = useAuthStore();
```

Persisted to localStorage. Contains: `user`, `accessToken`, `refreshToken`, `companySlug`, `companyName`, `companyThemeColor`.

### Branch Store (`@/shared/store/branchStore.ts`)

```ts
const { selectedBranchIds, branches } = useBranchStore();
```

Persisted. Tracks branch selection per user. Used by API client to set `X-Company-Id`.

### Toast Store (`@/shared/store/appToastStore.ts`)

```ts
import { toast } from 'sonner';
// Use sonner's toast() directly, not a custom store method.
```

### Notification Store (`@/shared/store/notificationStore.ts`)

Transient (not persisted). Manages in-app notification badge/count.

---

## React Query Pattern

Define service functions in `features/{name}/services/`, wrap them in hooks in `features/{name}/hooks/`:

```ts
// services/caseReports.service.ts
export async function fetchCaseReports(companyId: string, params: ListParams) {
  const res = await api.get<ApiResponse<CaseReport[]>>('/case-reports', { params });
  return res.data.data;
}

// hooks/useCaseReports.ts
export function useCaseReports(params: ListParams) {
  return useQuery({
    queryKey: ['case-reports', params],
    queryFn: () => fetchCaseReports(params),
  });
}
```

- `queryClient` configured: `retry: 1`, no focus refetch.
- Invalidate on mutations: `queryClient.invalidateQueries({ queryKey: ['case-reports'] })`.
- Pagination: reset page to 1 when filters/tabs change.

---

## Page Layout Pattern

Standard page structure used across all feature pages:

```
DashboardLayout (sidebar + header)
└── FeaturePage
    ├── Page header (title + action buttons)
    ├── Tab strip (status/type tabs with badge counts)
    ├── Filter controls
    ├── Content area
    │   ├── Loading: Skeleton matching header + tabs + grid
    │   ├── Empty: Icon + message row
    │   └── Grid of cards (responsive columns)
    └── Slide-over detail panel (createPortal to document.body)
```

**Never use centered modals for record detail.** Use the slide-over panel pattern (backdrop + panel, portaled to `document.body`).

**Tabs**: underline strip style. Switching tabs resets status sub-filter to default (usually Pending). Tab badges show pending/active counts.

**Cards**: `Badge` for status, summary metadata lines, `created_at` footer. Empty state: icon + message centered in a card row.

---

## Skeleton Loading

Match the exact shape of the page — not a lone spinner. Example structure:

```tsx
if (isLoading) return (
  <div>
    <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" /> {/* header */}
    <div className="flex gap-2 mt-4">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-6 w-24 bg-gray-200 rounded animate-pulse" />
      ))} {/* tabs */}
    </div>
    <div className="grid grid-cols-3 gap-4 mt-6">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="h-32 bg-gray-200 rounded animate-pulse" />
      ))} {/* cards */}
    </div>
  </div>
);
```

---

## Shared UI Components (`apps/web/src/shared/components/ui/`)

| Component | Usage |
|---|---|
| `Button` | Primary/secondary/destructive buttons |
| `Input` | Form text inputs |
| `Select` | Dropdown selects |
| `Badge` | Status labels (color variants) |
| `AnimatedModal` | Confirm/action modals with Framer Motion |
| `Pagination` | Page navigation (resets on filter change) |
| `Spinner` | Loading indicator (use inside buttons, not as page loader) |
| `DateRangePicker` | Date range filter inputs |
| `DateTimePicker` | Single datetime input |
| `ViewToggle` | Grid/list view switcher |
| `FileThumbnail` | File attachment preview |
| `AppToastViewport` | Toast container (mount once in app root) |

**AnimatedModal + AnimatePresence pattern for confirms:**

```tsx
<AnimatePresence>
  {showConfirm && (
    <AnimatedModal zIndexClass="z-[60]" onClose={() => setShowConfirm(false)}>
      {/* disable backdrop dismiss while saving */}
    </AnimatedModal>
  )}
</AnimatePresence>
```

Use `zIndexClass="z-[60]"` for modals above the slide-over panel (which is z-50).

---

## Permission Guards

Check permissions from the auth store, not via server calls:

```tsx
const { user } = useAuthStore();
const canManage = user?.permissions.includes('case_report.manage');

// Or use PermissionGuard wrapper:
<PermissionGuard permission="case_report.manage">
  <ActionButton />
</PermissionGuard>
```

Route-level guards use `ProtectedRoute` + `PermissionGuard` wrappers in the router config.

---

## Socket.io Realtime

Use the `useSocket` hook to connect to a namespace:

```ts
const socket = useSocket('/case-reports');

useEffect(() => {
  if (!socket) return;
  socket.on('case-report:updated', handleUpdate);
  return () => { socket.off('case-report:updated', handleUpdate); };
}, [socket]);
```

The hook handles JWT auth, reconnect on token refresh, and cleanup. Each namespace has a permission guard on the server — make sure the user has the right permission before connecting.

---

## Form Pattern

React Hook Form + Zod validation from `@omnilert/shared`:

```ts
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createCaseReportSchema } from '@omnilert/shared';

const form = useForm({
  resolver: zodResolver(createCaseReportSchema),
  defaultValues: { title: '', description: '' },
});
```

---

## Key Conventions

- **No Redux** — Zustand only for global state, React Query for server state.
- **No `.then()` chains** — use async/await everywhere.
- **Pagination resets** when filters, tabs, or search change.
- **Soft deletes** — filter `is_deleted = false` client-side from query results.
- **`date-fns`** for date formatting (not moment, not dayjs).
- **`companyId`** is derived from the selected branch (via `branchStore`), not stored directly. The API client handles attaching it.
- **File uploads** — use `FormData`, let the API client remove the Content-Type header (browser sets multipart boundary).
