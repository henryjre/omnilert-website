# Shift Auth Reason Modal — Design Spec

**Date:** 2026-04-19  
**Status:** Approved

---

## Overview

Employees receive push notifications when a shift authorization is created that requires them to submit a reason (tardiness, early check-out, late check-out, underbreak, early check-in, interim duty). Currently, clicking those notifications navigates to the schedule page. This feature adds:

1. Missing notifications for `early_check_in` and `interim_duty` auth types.
2. A dedicated API endpoint to fetch an authorization + its shift summary.
3. A modal (`ShiftAuthReasonModal`) where employees can read the shift summary, see the authorization details, and submit (or view) their reason — without leaving the current page.
4. The modal is wired into both the TopBar notification bell dropdown and the `EmployeeNotificationsTab`.

---

## Affected Auth Types

All six "needs employee reason" auth types:

| Auth Type | Notification already sent? |
|---|---|
| `tardiness` | Yes |
| `early_check_out` | Yes |
| `late_check_out` | Yes |
| `underbreak` | Yes |
| `early_check_in` | **No — add** |
| `interim_duty` | **No — add** |

---

## Backend Changes

### 1. Add missing notifications

**`apps/api/src/services/attendanceQueue.service.ts`** — after creating the `early_check_in` authorization, dispatch a notification:
```
title: 'Early Check In - Reason Required'
message: `You checked in {X} min early for your shift. Please submit a reason.`
type: 'warning'
linkUrl: `/account/schedule?shiftId={shiftId}&authId={authId}`
```

**`apps/api/src/services/webhook.service.ts`** — after creating the `interim_duty` authorization, dispatch a notification:
```
title: 'Interim Duty - Reason Required'
message: `You have been assigned an interim duty. Please submit a reason.`
type: 'warning'
linkUrl: `/account/schedule?shiftId={shiftId}&authId={authId}`
```

### 2. Update existing notification link URLs

All five existing "reason required" notifications in `webhook.service.ts` must append `&authId={auth.id}` to their `linkUrl` so the frontend can open the modal directly.

Before: `/account/schedule`  
After: `/account/schedule?shiftId={shiftId}&authId={authId}`

### 3. New endpoint: GET /account/shift-authorizations/:id

**Route:** `GET /api/v1/account/shift-authorizations/:id`  
**Auth:** `authenticate` + `requirePermission(PERMISSIONS.ACCOUNT_MANAGE_SCHEDULE)`  
**Ownership check:** `auth.user_id === req.user.sub`

**Response shape:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "auth_type": "tardiness",
    "diff_minutes": 15,
    "status": "pending",
    "employee_reason": null,
    "needs_employee_reason": true,
    "created_at": "...",
    "resolved_at": null,
    "resolved_by_name": null,
    "rejection_reason": null,
    "shift": {
      "id": "uuid",
      "shift_start": "...",
      "shift_end": "...",
      "status": "ended",
      "duty_type": "Cashier",
      "duty_color": 2,
      "branch_name": "Branch A",
      "employee_name": "Juan Dela Cruz",
      "employee_avatar_url": "...",
      "pending_approvals": 1
    }
  }
}
```

**Controller location:** `apps/api/src/controllers/account.controller.ts` — new `getShiftAuthorizationById` function.  
**Route registration:** `apps/api/src/routes/account.routes.ts` — add `GET /shift-authorizations/:id`.

---

## Frontend Changes

### 4. `ShiftAuthReasonModal` component

**File:** `apps/web/src/features/account/components/ShiftAuthReasonModal.tsx`

**Props:**
```ts
interface ShiftAuthReasonModalProps {
  authId: string;
  onClose: () => void;
  onReasonSubmitted?: (updatedAuth: any) => void;
}
```

**Behavior:**
- On mount, fetches `GET /account/shift-authorizations/:authId`.
- Shows a loading spinner while fetching.
- On error, shows an error message with a close button.
- Renders via `AnimatedModal` (wrapped in `AnimatePresence` at call site).

**Modal sections:**

1. **Header** — auth type label + close button (e.g. "Tardiness — Reason Required")
2. **Shift Summary** — compact: employee name/avatar, branch, duty type (colored pill), shift start/end, shift status badge. Mirrors the `ShiftDetailPanel` header + shift window layout but stripped of progress bars and action buttons.
3. **Authorization Details** — auth type label, diff_minutes formatted as human-readable (e.g. "15 minutes late"), status badge.
4. **Reason section:**
   - **Read-only** when `employee_reason` is already set (shows the submitted reason in a gray box).
   - **Editable** when `employee_reason` is null/empty: textarea + "Submit Reason" button.
   - Submit calls `POST /shift-authorizations/:id/reason` with `{ reason }`.
   - On success: updates local state to show read-only reason, calls `onReasonSubmitted`.
   - Submission errors shown inline (no toast).

**Read-only condition:** `auth.employee_reason` is truthy — regardless of `status`.

### 5. Wire into TopBar

**File:** `apps/web/src/features/dashboard/components/TopBar.tsx`

Add state: `const [reasonModalAuthId, setReasonModalAuthId] = useState<string | null>(null)`.

Update `handleClickNotification`:
- Extract `authId` from `link_url` via a helper `getAuthId(linkUrl)` matching `[?&]authId=([0-9a-f-]{36})`.
- If present: mark as read, close the dropdown, set `reasonModalAuthId`.
- Existing `shiftId`-only links (no `authId`) keep their current behavior (navigate to schedule).

Render at the bottom of `TopBar` JSX (outside the dropdown, at root level):
```tsx
<AnimatePresence>
  {reasonModalAuthId && (
    <ShiftAuthReasonModal
      authId={reasonModalAuthId}
      onClose={() => setReasonModalAuthId(null)}
    />
  )}
</AnimatePresence>
```

### 6. Wire into EmployeeNotificationsTab

**File:** `apps/web/src/features/account/components/EmployeeNotificationsTab.tsx`

Add state: `const [reasonModalAuthId, setReasonModalAuthId] = useState<string | null>(null)`.

Add helper `getAuthId` (same pattern as TopBar).

In the notification card action buttons, add a new branch:
- If `authId` is present in `link_url`: render a **"Submit Reason"** button (or **"View Reason"** if the notification is already read, though we can't know `employee_reason` from the notification alone — so always label it "View Authorization").
- Clicking it marks as read (if unread) and sets `reasonModalAuthId`.
- The existing "View Shift" button (which checks for `shiftId`) should still appear for notifications that have `shiftId` but no `authId`.

Render the modal at the bottom of the component:
```tsx
<AnimatePresence>
  {reasonModalAuthId && (
    <ShiftAuthReasonModal
      authId={reasonModalAuthId}
      onClose={() => setReasonModalAuthId(null)}
    />
  )}
</AnimatePresence>
```

---

## Data Flow

```
Webhook/Queue → creates auth → createAndDispatchNotification(linkUrl with authId)
                                        ↓
                              notification:new socket event
                                        ↓
                    TopBar bell / EmployeeNotificationsTab
                                        ↓
                          user clicks → ShiftAuthReasonModal
                                        ↓
                    GET /account/shift-authorizations/:id
                                        ↓
                    POST /shift-authorizations/:id/reason
```

---

## Error Handling

- Fetch failure in modal: show inline error, no crash.
- Reason submission failure: show inline error below the textarea.
- 403/404 from endpoint: show "Authorization not found" message.
- `needs_employee_reason: false` on an auth: modal still renders read-only (edge case, harmless).

---

## Out of Scope

- Progress bars / worked hours in the modal shift summary (not available without full shift detail fetch).
- Manager-facing actions (approve/reject) in this modal.
- Notification link URL backfill for existing historical notifications.
