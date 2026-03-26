# Skill: Frontend Patterns

## API Calls

Always use `shared/services/api.client.ts` — this is the shared axios client with JWT refresh handling built in. Never create a raw axios instance for API calls.

## Sockets

Connect via `shared/hooks/useSocket.ts`, specifying the namespace. Do not create raw Socket.IO connections.
Available namespaces: `/pos-verification`, `/pos-session`, `/employee-shifts`, `/employee-verifications`, `/employee-requirements`, `/notifications`, `/store-audits`, `/case-reports`, `/violation-notices`

## UI Layout Pattern — Card List + Detail Panel

Standard pattern for any page that shows a list of items with detail/actions:

- **List**: scrollable **vertical stack** or **responsive grid** of clickable cards (e.g. `sm:grid-cols-2 lg:grid-cols-3`). Use **equal-height** card shells (flex column, spacer, footer row) when cards show the same kind of summary (Employee Verifications, audit-style lists).
- **Detail**: slide-over (or full-width on small screens) that opens on card selection — not a centered dialog for the main record.
- Do **not** use centered modals for item detail or inline approve/reject forms.
- **Confirmation** for destructive or irreversible actions (approve/reject confirm): use **`AnimatedModal`** (see below), not ad-hoc `fixed inset-0` markup.

### Tabs and filters (management lists)

- **Primary row** (category / type): underline style — `border-b` on container, active tab `border-b-2 border-primary-600 text-primary-600`; optional **pending count** pills on tabs when useful.
- **Secondary row** (status): same underline pattern; icons + labels (hide labels on narrow breakpoints if needed). Changing status should reset pagination to page 1 when applicable.
- **Status chips** on cards and in panel headers: use shared **`Badge`** (`variant`: `success` | `danger` | `warning` | `default`) instead of one-off `rounded-full` color classes.

### Detail panel + stacking

- When the panel must sit above app layout reliably, render **backdrop + panel** with **`createPortal(..., document.body)`**.
- Use a **higher z-index** for confirm layers than the panel (e.g. panel `z-50`, confirm modal `z-[60]`).

### Loading (dense management pages)

- Prefer a **full-section skeleton** (header, tab bars, grid of placeholder cards with `animate-pulse`) over a single centered spinner when the page structure is stable.

### AnimatedModal (approve / reject and similar)

- Import **`AnimatedModal`** from `@/shared/components/ui/AnimatedModal` and wrap conditional open state in **`AnimatePresence`** from `framer-motion` (exit animations require both).
- Props: **`maxWidth`** (e.g. `max-w-sm` for short confirms), optional **`zIndexClass`** (default `z-50`; use **`z-[60]`** when stacking above a `z-50` slide panel), **`onBackdropClick`** to dismiss (omit or pass `undefined` while async work is in flight so backdrop does not close).
- **Cancel** should be **`disabled`** while the primary action is processing, matching the primary button.
- Inner layout: header border-b, body padding, footer border-t with **`Button`** variants — keep content inside the modal card; **`AnimatedModal`** already provides backdrop + scaled card motion and portals to `document.body`.

**Reference implementations:** `EmployeeVerificationsPage.tsx` (confirm over portaled panel), `AuthorizationRequestsPage.tsx` (`ManagementDetailPanel` / `ServiceCrewDetailPanel` confirm flows).

## Filter Panels

- Applies to **expandable filter sheets** (e.g. Employee Profiles, report-style filters). **Tab-only** status/type strips (underline tabs, no Apply button) are a separate pattern — see **Tabs and filters** above (Employee Verifications, Authorization Requests, Store Audits).

- Use staged controls: explicit **Apply**, **Clear**, and **Cancel** actions.
- Do NOT apply filters live on input change.
- Show a small "Filters applied" helper text when any non-default filter is active.
- Filter toggle button: click to show panel, click again to hide (toggleable).
- Mobile filter toggle header: icon/label/badge grouped on the left, chevron on the right.
- "Pending Approvals" type controls render as a toggle switch, not a checkbox.

## Employment Status

Field name: `employment_status`. Values: `active | resigned | inactive | suspended`.
Legacy `is_active` field exists for compatibility — prefer `employment_status` in all new code.
When reading status for display: map to `Active`, `Resigned`, `Inactive`, `Suspended`.

## Routing Conventions

- Base account route `/account` redirects to `/account/schedule`.
- `/account/employment` redirects to `/account/profile`.
- `/registration-requests` redirects to `/employee-verifications` — compat alias, do not add new pages here.
- Feature folders live in `apps/web/src/features/` by domain.

## Sidebar Navigation Structure

- **My Account**: Schedule, Payslip (gated: `dashboard.view_payslip`), Authorization Requests, Cash Requests, Notifications, Profile, Settings
- **Management**: Authorization Requests, Employee Verifications, Case Reports (gated: `case_report.view`)
- **Human Resources** (collapsible): Employee Profiles, Employee Schedule, Employee Requirements, Violation Notices (gated: `violation_notice.view`)
- **Accounting and Finance** (collapsible): Cash Requests
- **Internal Audit** (collapsible): Store Audits (gated: `store_audit.view`)
- HR/Finance/Internal Audit groups auto-expand when a child route is active.
- Company header in sidebar is an interactive button for users with multiple companies — toggles animated dropdown with theme-color dots.

## Company Theming

- Each company has a `theme_color` in master `companies`.
- Company chips/pills in Employee Profiles and User Management are theme-aware and use `theme_color`.
- Company switch applies new company theme and redirects to `/dashboard`.

## Pagination

Employee Profiles card list: Desktop 12 per page, Mobile 6 per page.

## Phone Number Display (PH format)

Normalize `+639...` / `639...` → `09...` for both display and `tel:` dial target.
Call action buttons are conditional: show "Call Employee" only when mobile exists, "Call Emergency" only when emergency phone exists.

## Theme / Dark Mode

Persisted to `localStorage` key `omnilert-theme-mode`. Values: `system | light | dark`. Defaults to `light` when no preference stored. Purely client-side.

## Overflow / Pill Compaction

When company or branch counts exceed display limits, compact with `+N more` chip pattern. Used in Employee Profiles and User Management.

## StarRatingInput

Five clickable lucide `Star` icons. Selected stars filled/colored, unselected outline. Controlled: `value: number | null`, `onChange: (v: number) => void`. Used in CSS audit completion form.

## YesNoPill

Two pill buttons side-by-side: `Yes` (green when selected) and `No` (red when selected). Controlled: `value: boolean | null`, `onChange: (v: boolean) => void`. Used in compliance audit completion form.

## Case Reports Chat Patterns

### Message grouping

Messages within 5 minutes from the same user share a single avatar + name header. Subsequent messages in the group show only a hover-timestamp (desktop). Each is individually reply-able and long-press-able.

### Soft-deleted message tombstone

`is_deleted` messages render like a normal message — avatar (50% opacity), muted name, muted timestamp — but content is italic `text-gray-400`. No interaction controls (no reply, react, edit, delete).

### Optimistic UI (pending messages)

Messages appear immediately on send with `status: 'pending'`. Pending messages render with: avatar 50% opacity, muted name, italic `text-gray-400` "sending a message…" with a 3-dot bounce animation (framer-motion). Replaced on server confirmation; removed on failure.

### Video attachments

Videos are not played inline. Clicking opens an `ImagePreviewModal` (portal). Multiple images/videos in one message show prev/next navigation in the modal.

### Portal rendering for popups

`EmojiPicker` and `MessageActionMenu` use `createPortal(..., document.body)` with `position: fixed` when `portalMode={true}` to escape `overflow-y-auto` scroll containers. Trigger rect is passed via `triggerRect?: DOMRect | null`.

### Socket namespace

`/case-reports` — connect via `useSocket('/case-reports')`.

## Violation Notices UI Patterns

Card list + right-side detail panel (same pattern as Case Reports / Store Audits). Deep-link: `/violation-notices?vnId=X`.

### Status workflow

`queued` → `discussion` → `issuance` → `disciplinary_meeting` → `completed`
Rejection (`rejected`) can occur at `queued` or `discussion` status and requires a reason.

### Creation

- Manual (standalone): CreateVNModal — target employee selection + description
- From Case Report: RequestVNModal with `sourceCaseReportId` — opens from Case Reports detail panel "Request VN" button (hidden once `linked_vn_id` is set)
- From Store Audit: RequestVNModal with `sourceStoreAuditId` — opens from CSS/Compliance audit detail panel "Request VN" button (hidden once `vn_requested = true`)

### GroupedUserSelect

Reusable dropdown for target employee selection. Groups users by role (management, service_crew, other). Supports single or multi-select. Shows avatar with initials fallback. Used in CreateVNModal and RequestVNModal.

### Detail panel actions by status

- **queued**: Confirm VN, Reject (inline textarea)
- **discussion**: Issue VN, Reject (inline textarea)
- **issuance**: Dedicated "Issuance PDF" section always visible — shows file link or "No file uploaded yet" placeholder. Inline "Upload PDF" / "Replace" text link triggers hidden file input. "Advance to Disciplinary Meeting" button appears below when file is present.
- **disciplinary_meeting**: Dedicated "Disciplinary Meeting" section — shows media/doc thumbnail preview (image, video, or generic icon card) or placeholder. Inline "Upload Proof" / "Replace" text link. "Complete VN" button appears below when file is present. Clicking the thumbnail opens `ImagePreviewModal` (portal).
- **completed**: Summary card (green bg) with icons: UserCheck (confirmed by), FileCheck (issued by), CheckCircle2 (completed by).
- **rejected**: Summary card (red bg) with icons: FileX (rejection reason), UserCheck (rejected by).

### File uploads in VN

- Issuance file: PDF only, stored at `{root}/Violation Notices/VN-{vnNumber}/{filename}`. Duplicate detection: if selected filename matches `vn.issuance_file_name`, upload is skipped client-side.
- Disciplinary proof: any media/doc, same path prefix. Same duplicate filename check applies.
- Message attachments: images, video, PDF, Word, Excel — up to 10 files

### Disciplinary proof thumbnail

Media type detection uses file extension from `vn.disciplinary_file_name`:

- `.mp4/.webm/.ogg/.mov` → `<video>` thumbnail (muted, no controls)
- `.jpg/.jpeg/.png/.gif/.webp/.svg` → `<img>` thumbnail
- Other (PDF, DOC, etc.) → icon + truncated filename card

Clicking the thumbnail opens `ImagePreviewModal` from `case-reports/components/ImagePreviewModal.tsx`.

### Chat section

Reuses `ChatSection` component from case reports. Supports threading, @mentions (users + roles), emoji reactions, soft-delete tombstones, and optimistic message UI. Connect via `useSocket('/violation-notices')`.

### Linked source display

Detail panel shows "View Case Report" or "View Store Audit" button when VN has a source (`source_case_report_id` or `source_store_audit_id`). Navigation uses deep-link query params of the source feature.
