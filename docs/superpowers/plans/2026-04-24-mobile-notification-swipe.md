# Mobile Notification Swipe Actions Implementation Plan

> **For agentic workers:** Implement task-by-task and keep the write scope focused. The repo already has unrelated in-progress notification changes; do not revert them.

**Goal:** Add native-feeling mobile swipe actions to `EmployeeNotificationsTab` so swiping left deletes a notification and swiping right toggles read/unread on release, while keeping the unread badge and same-session bell dropdown state synchronized.

**Architecture:** Add a generic notification read-state service helper plus `PUT /account/notifications/:id/unread`, extend the notification Zustand store with a lightweight patch broadcast for same-session read-state sync, and build a mobile-only swipe wrapper in the notifications tab using `framer-motion` plus touch-locking logic modeled after the existing chat swipe implementation.

**Tech Stack:** Express 4 / TypeScript (API), React 18 / Tailwind CSS 3 / Framer Motion / Zustand (web), existing `api.client`, existing notification socket/delete flow.

---

## File Map

| File | Change |
|---|---|
| `apps/api/src/services/notification.service.ts` | Add read-state update helper and keep delete helpers intact |
| `apps/api/src/controllers/account.controller.ts` | Refactor mark-read to use service helper; add mark-unread controller |
| `apps/api/src/routes/account.routes.ts` | Register `PUT /notifications/:id/unread` |
| `apps/api/src/services/notification.service.test.ts` | Add service tests for read/unread state changes |
| `apps/web/src/shared/store/notificationStore.ts` | Add shared notification patch broadcast for same-session list syncing |
| `apps/web/src/features/dashboard/components/TopBar.tsx` | Apply notification patch updates to dropdown state |
| `apps/web/src/features/account/components/EmployeeNotificationsTab.tsx` | Add mobile swipe interactions, mark-unread flow, and mobile-only action visibility changes |
| `apps/web/test/authNotificationRealtime.web.test.ts` | Extend source assertions for mobile swipe, unread endpoint, and mobile action visibility |

---

## Task 1: Backend unread toggle support

**Files:**
- Modify: `apps/api/src/services/notification.service.ts`
- Modify: `apps/api/src/controllers/account.controller.ts`
- Modify: `apps/api/src/routes/account.routes.ts`
- Modify: `apps/api/src/services/notification.service.test.ts`

- [ ] Add `updateNotificationReadStateForUser(input: { userId: string; notificationId: string; isRead: boolean })`.
  - Query `employee_notifications` for `{ id, user_id }`.
  - Return `null` when the notification does not belong to the current user.
  - Update `is_read` to the requested state and return `{ id, userId, isRead }`.

- [ ] Refactor `markNotificationRead` in `account.controller.ts` to call the new service helper instead of writing directly through Knex.
  - Preserve the current success response shape.
  - Return `404` when the service returns `null`.

- [ ] Add `markNotificationUnread` in `account.controller.ts`.
  - Call the same service helper with `isRead: false`.
  - Return `404` when the notification is missing/not owned.
  - Return `{ success: true, message: 'Notification marked as unread' }` on success.

- [ ] Register `PUT /account/notifications/:id/unread` in `account.routes.ts` next to the existing read route.

- [ ] Extend `notification.service.test.ts` with:
  - owned notification can be marked read
  - owned notification can be marked unread
  - missing/non-owned notification returns `null`
  - delete tests remain green after the service helper addition

- [ ] Verification:
  - `pnpm -C apps/api exec tsx --test src/services/notification.service.test.ts`

---

## Task 2: Same-session notification patch sync

**Files:**
- Modify: `apps/web/src/shared/store/notificationStore.ts`
- Modify: `apps/web/src/features/dashboard/components/TopBar.tsx`
- Modify: `apps/web/src/features/account/components/EmployeeNotificationsTab.tsx`

- [ ] Extend the notification store with:
  - `latestNotificationPatch: { id: string; changes: Record<string, unknown> } | null`
  - `patchNotification(id, changes)`

- [ ] Keep the current `latestNotification` push path unchanged for new notifications.

- [ ] In `TopBar.tsx`, subscribe to `latestNotificationPatch` and patch the local `notifications` array when the id matches.
  - Only patch local list items already present in the bell dropdown.
  - Do not change the socket delete/new logic.

- [ ] In `EmployeeNotificationsTab.tsx`, subscribe to the same patch broadcast and patch local notification state.
  - This keeps the tab in sync when the user marks notifications read from the bell dropdown and vice versa.

- [ ] Use the store’s `increment` and `decrement` actions consistently for swipe-based read/unread toggles.

- [ ] Verification:
  - Build passes after store shape changes.

---

## Task 3: Mobile swipe card interaction

**Files:**
- Modify: `apps/web/src/features/account/components/EmployeeNotificationsTab.tsx`

- [ ] Add a tightly scoped local swipe wrapper component in `EmployeeNotificationsTab.tsx`.
  - Name it `MobileSwipeNotificationCard`.
  - Keep it in the same file for this feature.

- [ ] Use `framer-motion` with `motion.div`, `useMotionValue`, and `animate`.
  - Do not introduce a new dependency.
  - Set `style={{ touchAction: 'pan-y' }}` on the swipe surface.

- [ ] Mirror the touch-locking approach from `apps/web/src/features/case-reports/components/ChatMessage.tsx`.
  - Track touch start `{ x, y, locked }`.
  - Lock horizontal swipe only after movement exceeds 10px.
  - Treat the gesture as horizontal only when `abs(deltaX) >= abs(deltaY)`.
  - If vertical wins, allow scroll and cancel swipe handling.

- [ ] Define fixed swipe constants in the file:
  - `SWIPE_MAX_PX = 96`
  - `SWIPE_COMMIT_PX = 72`
  - `SWIPE_LOCK_THRESHOLD_PX = 10`

- [ ] Ignore swipe gestures that begin on interactive descendants.
  - Add a `data-no-swipe` marker to CTA buttons such as `View Reply`, `View Shift`, `Open Profile`, `Delete all read`, and other route-specific action buttons.
  - In touch start/move handling, bail out when `event.target.closest('[data-no-swipe]')` matches.

- [ ] Left swipe behavior:
  - Reveal a red background lane behind the card.
  - Show `Trash2` icon anchored on the right side of the lane.
  - On release past `SWIPE_COMMIT_PX`, call the existing delete handler.
  - Animate card off-screen left before removing from local state.
  - On failure, spring the card back to `x = 0`.

- [ ] Right swipe behavior:
  - Reveal a soft primary-tinted lane behind the card.
  - Show `CheckCheck` when the notification is unread.
  - Show `Mail` when the notification is read.
  - On release past `SWIPE_COMMIT_PX`:
    - unread -> call `PUT /account/notifications/:id/read`
    - read -> call `PUT /account/notifications/:id/unread`
  - On success, patch local notification state and spring card back to `x = 0`.
  - On failure, spring card back to `x = 0`.

- [ ] Add a shared local helper for read-state changes in the tab:
  - `setNotificationReadState(notificationId, isRead)`
  - Handle API call, local state patch, store patch broadcast, and unread count increment/decrement.
  - Refactor the existing `markAsRead` path to use this helper.
  - Add `markAsUnread` through the same helper.

- [ ] Prevent duplicate commits while a card action is pending.
  - Reuse or extend the existing per-notification loading state.
  - Ignore additional swipe commits on cards with in-flight actions.

- [ ] Hide the tiny `Mark read` and `Delete` text actions on mobile.
  - Use responsive classes so they remain visible on desktop.
  - Keep existing route CTA buttons visible on mobile.

- [ ] Keep desktop behavior unchanged.
  - No swipe on `sm` and above.
  - Existing desktop links/buttons remain available.

- [ ] Keep pagination clamping after delete as-is.

---

## Task 4: Frontend verification

**Files:**
- Modify: `apps/web/test/authNotificationRealtime.web.test.ts`

- [ ] Extend the existing source assertions to cover:
  - new unread endpoint call `api.put(\`/account/notifications/${id}/unread\`)`
  - mobile swipe wrapper presence
  - `Trash2`, `CheckCheck`, and `Mail` icon usage
  - responsive hiding of `Mark read` and `Delete` text actions on mobile
  - `data-no-swipe` guard on CTA buttons
  - store patch subscription usage in both `TopBar.tsx` and `EmployeeNotificationsTab.tsx`

- [ ] Verification:
  - `pnpm -C apps/api exec tsx --test ../web/test/authNotificationRealtime.web.test.ts`

---

## Task 5: Final verification

- [ ] Run targeted tests:
  - `pnpm -C apps/api exec tsx --test src/services/notification.service.test.ts`
  - `pnpm -C apps/api exec tsx --test ../web/test/authNotificationRealtime.web.test.ts`

- [ ] Run builds:
  - `pnpm -C packages/shared build` only if shared types were touched during implementation
  - `pnpm -C apps/api build`
  - `pnpm -C apps/web build`

- [ ] Manually verify on a mobile viewport:
  - left swipe deletes on release
  - right swipe unread -> read
  - right swipe read -> unread
  - CTA buttons still tap normally
  - vertical scroll is not blocked
  - bell unread badge changes immediately in the same session

---

## Defaults Chosen

- Swipe behavior is mobile-width only, using the same breakpoint family as the existing `sm:` classes.
- Swipe actions fire immediately on release past the commit threshold; there is no secondary confirmation step.
- Same-session bell-dropdown synchronization uses Zustand patch broadcasts, not a new websocket event.
- Desktop remains button-driven and visually unchanged.
