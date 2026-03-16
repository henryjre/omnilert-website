# Skill: Frontend Patterns

## API Calls

Always use `shared/services/api.client.ts` — this is the shared axios client with JWT refresh handling built in. Never create a raw axios instance for API calls.

## Sockets

Connect via `shared/hooks/useSocket.ts`, specifying the namespace. Do not create raw Socket.IO connections.
Available namespaces: `/pos-verification`, `/pos-session`, `/employee-shifts`, `/employee-verifications`, `/employee-requirements`, `/notifications`, `/store-audits`, `/case-reports`, `/violation-notices`

## UI Layout Pattern — Card List + Detail Panel

Standard pattern for any page that shows a list of items with detail/actions:

- Left: scrollable card list
- Right: detail panel that opens on card selection
- Do NOT use centered modals for item detail or approval/rejection actions.
- Exception: two-step confirmation prompts (e.g., permanent delete confirm) may use a modal.

## Filter Panels

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
- **issuance**: Upload Issuance PDF (1 file, PDF only, 50 MB), display current file link, Advance to Disciplinary (only if file exists)
- **disciplinary_meeting**: Upload Disciplinary Proof (any media/doc, 50 MB), display current file link, Complete VN (only if file exists)
- **completed**: Summary of who confirmed/issued/completed
- **rejected**: Rejection reason + who rejected

### File uploads in VN

- Issuance file: PDF only, stored at `{root}/Violation Notices/VN-{vnNumber}/{filename}`
- Disciplinary proof: any media/doc, same path prefix
- Message attachments: images, video, PDF, Word, Excel — up to 10 files

### Chat section

Reuses `ChatSection` component from case reports. Supports threading, @mentions (users + roles), emoji reactions, soft-delete tombstones, and optimistic message UI. Connect via `useSocket('/violation-notices')`.

### Linked source display

Detail panel shows "View Case Report" or "View Store Audit" button when VN has a source (`source_case_report_id` or `source_store_audit_id`). Navigation uses deep-link query params of the source feature.
