# Case Reports — Implementation Plan

## Context

The team needs an internal case reporting system where employees can create, discuss, and resolve workplace cases (incidents, complaints, violations). Cases flow through an Open → Closed lifecycle with corrective actions, resolutions, file attachments, and a threaded chat discussion with @mentions and real-time notifications. A "Request VN" (Violation Notice) button is a future placeholder on closed cases.

---

## 1. Database — Tenant Migration `018_case_reports.ts`

Path: `apps/api/src/migrations/tenant/018_case_reports.ts`

All user UUID columns store global master UUIDs with **no FK** (same pattern as migrations 011–016 and `employee_notifications.user_id`).

### Table: `case_reports`

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `case_number` | serial | NOT NULL, auto-increment |
| `title` | varchar(255) | NOT NULL |
| `description` | text | NOT NULL |
| `status` | varchar(20) | NOT NULL, default `'open'`, CHECK `('open','closed')` |
| `corrective_action` | text | nullable |
| `resolution` | text | nullable |
| `vn_requested` | boolean | NOT NULL, default false |
| `created_by` | uuid | NOT NULL (global user UUID, no FK) |
| `closed_by` | uuid | nullable (global user UUID, no FK) |
| `closed_at` | timestamp | nullable |
| `created_at` | timestamp | NOT NULL, default now() |
| `updated_at` | timestamp | NOT NULL, default now() |

**Indexes:**
- `case_reports_status_idx ON case_reports(status)`
- `case_reports_created_by_idx ON case_reports(created_by)`
- `case_reports_created_at_idx ON case_reports(created_at DESC)`
- `case_reports_case_number_unique UNIQUE ON case_reports(case_number)`

### Table: `case_messages`

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `case_id` | uuid | NOT NULL, FK → `case_reports.id` ON DELETE CASCADE |
| `user_id` | uuid | NOT NULL (global UUID, no FK) |
| `content` | text | NOT NULL |
| `is_system` | boolean | NOT NULL, default false |
| `parent_message_id` | uuid | nullable, FK → `case_messages.id` ON DELETE SET NULL |
| `created_at` | timestamp | NOT NULL, default now() |
| `updated_at` | timestamp | NOT NULL, default now() |

**Indexes:**
- `case_messages_case_id_idx ON case_messages(case_id, created_at ASC)`
- `case_messages_parent_idx ON case_messages(parent_message_id) WHERE parent_message_id IS NOT NULL`

### Table: `case_attachments`

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `case_id` | uuid | NOT NULL, FK → `case_reports.id` ON DELETE CASCADE |
| `message_id` | uuid | nullable, FK → `case_messages.id` ON DELETE SET NULL |
| `uploaded_by` | uuid | NOT NULL (global UUID, no FK) |
| `file_url` | text | NOT NULL |
| `file_name` | varchar(255) | NOT NULL |
| `file_size` | integer | NOT NULL |
| `content_type` | varchar(100) | NOT NULL |
| `created_at` | timestamp | NOT NULL, default now() |

**Indexes:**
- `case_attachments_case_id_idx ON case_attachments(case_id)`
- `case_attachments_message_id_idx ON case_attachments(message_id) WHERE message_id IS NOT NULL`

### Table: `case_reactions`

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `message_id` | uuid | NOT NULL, FK → `case_messages.id` ON DELETE CASCADE |
| `user_id` | uuid | NOT NULL (global UUID, no FK) |
| `emoji` | varchar(20) | NOT NULL |
| `created_at` | timestamp | NOT NULL, default now() |

**Indexes/Constraints:**
- `case_reactions_message_user_emoji_unique UNIQUE ON case_reactions(message_id, user_id, emoji)`

### Table: `case_participants`

Tracks join/leave/mute state per user per case.

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `case_id` | uuid | NOT NULL, FK → `case_reports.id` ON DELETE CASCADE |
| `user_id` | uuid | NOT NULL (global UUID, no FK) |
| `is_joined` | boolean | NOT NULL, default true |
| `is_muted` | boolean | NOT NULL, default false |
| `last_read_at` | timestamp | nullable |
| `created_at` | timestamp | NOT NULL, default now() |
| `updated_at` | timestamp | NOT NULL, default now() |

**Indexes/Constraints:**
- `case_participants_case_user_unique UNIQUE ON case_participants(case_id, user_id)`
- `case_participants_user_joined_idx ON case_participants(user_id) WHERE is_joined = true`

### Table: `case_mentions`

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `message_id` | uuid | NOT NULL, FK → `case_messages.id` ON DELETE CASCADE |
| `mentioned_user_id` | uuid | nullable (global UUID, no FK) — null if role mention |
| `mentioned_role_id` | uuid | nullable (master role ID, no FK) — null if user mention |
| `created_at` | timestamp | NOT NULL, default now() |

**Indexes:**
- `case_mentions_message_id_idx ON case_mentions(message_id)`
- `case_mentions_user_idx ON case_mentions(mentioned_user_id) WHERE mentioned_user_id IS NOT NULL`

**Constraints:**
- CHECK: `(mentioned_user_id IS NOT NULL) OR (mentioned_role_id IS NOT NULL)`

---

## 2. Master Migration `011_case_report_permissions.ts`

Path: `apps/api/src/migrations/master/011_case_report_permissions.ts`

Seeds four permission keys into every tenant's `permissions` table and assigns them to system roles. Since permissions and roles live in master RBAC tables (seeded via `databaseProvisioner.ts`), this migration:

1. Inserts the new permission keys into each tenant's `permissions` table (idempotent — skip if key exists).
2. Links them to appropriate system roles in `role_permissions`.

**Actually** — reviewing the codebase, permissions/roles are in the **master** DB (`roles`, `permissions`, `role_permissions` tables). So this master migration:
1. Inserts 4 permission rows into master `permissions` (idempotent).
2. Assigns them to system roles via master `role_permissions`.

---

## 3. Permissions

### New keys in `packages/shared/src/constants/permissions.ts`

```ts
// Case Reports
CASE_REPORT_VIEW: 'case_report.view',
CASE_REPORT_CREATE: 'case_report.create',
CASE_REPORT_CLOSE: 'case_report.close',
CASE_REPORT_MANAGE: 'case_report.manage',
```

### New category in `PERMISSION_CATEGORIES`

```ts
case_report: {
  label: 'Case Reports',
  permissions: [
    PERMISSIONS.CASE_REPORT_VIEW,
    PERMISSIONS.CASE_REPORT_CREATE,
    PERMISSIONS.CASE_REPORT_CLOSE,
    PERMISSIONS.CASE_REPORT_MANAGE,
  ],
},
```

### Default role seeding in `packages/shared/src/constants/roles.ts`

| Permission | Administrator | Management | Service Crew |
|---|---|---|---|
| `case_report.view` | yes (gets all) | yes (filter pass) | no |
| `case_report.create` | yes | yes | no |
| `case_report.close` | yes | yes | no |
| `case_report.manage` | yes | no | no |

- **Administrator** — gets all via `Object.values(PERMISSIONS)`, no change needed.
- **Management** — gets all except `admin.*` via existing filter. Since `case_report.*` doesn't start with `admin.`, Management automatically gets all four. No change needed.
- **Service Crew** — does NOT get any case report permissions (explicit list, not auto).

---

## 4. API Routes

Path: `apps/api/src/routes/caseReport.routes.ts`
Register in `apps/api/src/routes/index.ts`: `router.use('/case-reports', caseReportRoutes);`

All routes use `authenticate, resolveCompany` middleware.

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/` | `case_report.view` | List cases (query: `status`, `search`, `date_from`, `date_to`, `sort`, `vn_only`) |
| GET | `/:id` | `case_report.view` | Get case detail with participant/unread info |
| POST | `/` | `case_report.create` | Create case (`title`, `description`) — auto-generates case_number |
| PATCH | `/:id/corrective-action` | `case_report.view` | Add/edit corrective action (blocked if closed unless `case_report.manage`) |
| PATCH | `/:id/resolution` | `case_report.view` | Add/edit resolution (blocked if closed unless `case_report.manage`) |
| POST | `/:id/close` | `case_report.close` | Close case (requires corrective_action AND resolution filled) |
| POST | `/:id/request-vn` | `case_report.manage` | TODO — placeholder, sets `vn_requested = true` |
| POST | `/:id/attachments` | `case_report.view` | Upload file (PDF only, max 10MB). Allowed even on closed cases. |
| GET | `/:id/messages` | `case_report.view` | List messages with reactions, mentions, attachments |
| POST | `/:id/messages` | `case_report.view` | Send message (text + optional file attachments + mentions). Blocked if closed unless `case_report.manage`. |
| POST | `/:id/messages/:messageId/reactions` | `case_report.view` | Toggle reaction on message |
| POST | `/:id/leave` | `case_report.view` | Leave discussion (sets `is_joined = false`) |
| POST | `/:id/mute` | `case_report.view` | Toggle mute (sets `is_muted = !is_muted`) |
| GET | `/mentionables` | `case_report.view` | List users + roles for mention picker |

### Request/Response shapes

**POST `/`** (create)
```ts
// Request
{ title: string; description: string } // description max 2000 chars
// Response
{ success: true, data: CaseReport }
```

**GET `/`** (list)
```ts
// Query params: status?, search?, date_from?, date_to?, sort_order?, vn_only?
// Response
{ success: true, data: { items: CaseReport[], total: number } }
// CaseReport includes: messageCount, unreadCount (for joined users), isJoined, isMuted
```

**POST `/:id/messages`** (send message)
```ts
// Request (multipart/form-data for file support, or JSON)
{ content: string; parentMessageId?: string; mentionedUserIds?: string[]; mentionedRoleIds?: string[] }
// + optional file attachments
// Response
{ success: true, data: CaseMessage }
```

---

## 5. Backend Services

### `apps/api/src/services/caseReport.service.ts`

Key service functions:
- `listCaseReports(input)` — query with filters, enrich with user names from master, compute message/unread counts
- `getCaseReport(input)` — full detail with participant info
- `createCaseReport(input)` — insert case, auto-join creator as participant, emit socket event
- `updateCorrectiveAction(input)` — update field, insert system message, emit socket
- `updateResolution(input)` — update field, insert system message, emit socket
- `closeCase(input)` — validate corrective_action + resolution exist, set status/closed_by/closed_at, insert system message, emit socket
- `uploadAttachment(input)` — S3 upload, insert `case_attachments`, insert system message, emit socket
- `listMessages(input)` — messages with reactions, mentions, attachments, threaded replies
- `sendMessage(input)` — insert message, process mentions (auto-join + notify), emit socket, update sender's `last_read_at`
- `toggleReaction(input)` — upsert/delete reaction, emit socket
- `leaveDiscussion(input)` — set `is_joined = false` on participant record
- `toggleMute(input)` — flip `is_muted` on participant record
- `getMentionables(input)` — list company users (from master) + roles for mention picker

### `apps/api/src/controllers/caseReport.controller.ts`

Standard controller pattern — parse request, call service, format response, `next(error)` on catch.

### System messages

Every mutating action emits a system message (`is_system = true`) in the case chat:
- `"{userName} created this case"`
- `"{userName} added a corrective action"` / `"{userName} updated the corrective action"`
- `"{userName} added a resolution"` / `"{userName} updated the resolution"`
- `"{userName} attached a file: {fileName}"`
- `"{userName} closed this case"`
- `"{userName} requested a Violation Notice"`

### User name resolution

All user names are resolved from master `users` table by UUID — never from tenant tables. Follow the enrichment pattern in `storeAudit.service.ts`.

---

## 6. Socket.IO — `/case-reports` Namespace

### Setup in `apps/api/src/config/socket.ts`

```ts
const caseReportsNs = io.of('/case-reports');
caseReportsNs.use(/* verify JWT + require case_report.view */);
caseReportsNs.on('connection', (socket) => {
  socket.join(`company:${socket.data.user.companyId}`);
});
```

### Events emitted from service layer

| Event | Trigger | Room | Payload |
|---|---|---|---|
| `case-report:created` | New case created | `company:{companyId}` | `{ id, caseNumber, title, status, createdBy }` |
| `case-report:updated` | Corrective action, resolution, close, VN request | `company:{companyId}` | `{ id, caseNumber, field }` |
| `case-report:message` | New message or system message | `company:{companyId}` | `{ caseId, message }` |
| `case-report:reaction` | Reaction toggled | `company:{companyId}` | `{ caseId, messageId, reactions }` |
| `case-report:attachment` | File uploaded to case | `company:{companyId}` | `{ caseId, attachment }` |

### Unread count tracking

- `case_participants.last_read_at` is updated when a user sends a message or opens the case detail panel (client calls a "mark read" endpoint or the GET `/:id` endpoint updates it).
- Unread count = messages with `created_at > last_read_at` for that participant.
- Add endpoint: **POST `/:id/read`** — updates `last_read_at` to now for the current user's participant record.

---

## 7. Notifications

Follow existing `createAndDispatchNotification()` pattern from `notification.service.ts`.

### User mention
When a user is mentioned in a message:
1. Auto-join them as participant (`is_joined = true`) if not already joined.
2. Skip notification if participant `is_muted = true`.
3. Otherwise, call `createAndDispatchNotification()` with `linkUrl: '/case-reports'` (case opens via query param or client-side state).
4. Emit `notification:new` via `/notifications` namespace.

### Role mention
When a role is mentioned:
1. Query master `user_roles` + `user_company_access` to find all users with that role in the current company.
2. For each user: auto-join, check mute, dispatch notification (same as user mention).
3. Skip the message sender (don't self-notify).

### Notification click
`linkUrl: '/case-reports?caseId={caseId}'` — frontend reads query param on mount to auto-open the case detail panel.

---

## 8. S3 Storage

Path pattern: `${companyStorageRoot}/Case Reports/CASE-${caseNumber}/`

Use `buildTenantStoragePrefix(req.companyContext.companyStorageRoot, 'Case Reports', \`CASE-${caseNumber}\`)` to build the folder.

Upload via `uploadFile(buffer, filename, contentType, folder)`.

Constraints:
- Case-level attachments (via "Add File"): PDF only, max 10MB
- Chat message attachments: images or files, max 10MB each

---

## 9. Frontend Component Tree

Feature folder: `apps/web/src/features/case-reports/`

```
case-reports/
├── pages/
│   └── CaseReportsPage.tsx          # Main page — header, tabs, filters, card grid, detail panel
├── components/
│   ├── CaseReportCard.tsx           # Card for the list grid
│   ├── CaseReportDetailPanel.tsx    # Right-side detail panel (info + actions + chat)
│   ├── CaseReportFilterPanel.tsx    # Filter panel (search, date range, sort, VN toggle)
│   ├── CreateCaseModal.tsx          # Modal for creating a new case
│   ├── TextInputModal.tsx           # Reusable modal for corrective action / resolution text input
│   ├── ChatSection.tsx              # Chat UI (message list + input bar)
│   ├── ChatMessage.tsx              # Single message bubble (with replies, reactions, attachments)
│   └── MentionPicker.tsx            # Discord-style @ mention dropdown (users + roles)
└── services/
    └── caseReport.api.ts            # API client calls (uses shared api.client.ts)
```

### Shared types

Path: `packages/shared/src/types/caseReport.types.ts`

```ts
export type CaseReportStatus = 'open' | 'closed';

export interface CaseReport {
  id: string;
  case_number: number;
  title: string;
  description: string;
  status: CaseReportStatus;
  corrective_action: string | null;
  resolution: string | null;
  vn_requested: boolean;
  created_by: string;
  created_by_name?: string;
  closed_by: string | null;
  closed_by_name?: string;
  closed_at: string | null;
  message_count: number;
  unread_count: number;
  is_joined: boolean;
  is_muted: boolean;
  created_at: string;
  updated_at: string;
}

export interface CaseMessage {
  id: string;
  case_id: string;
  user_id: string;
  user_name?: string;
  user_avatar?: string;
  content: string;
  is_system: boolean;
  parent_message_id: string | null;
  replies?: CaseMessage[];
  reactions: CaseReaction[];
  attachments: CaseAttachment[];
  mentions: CaseMention[];
  created_at: string;
}

export interface CaseReaction { emoji: string; users: { id: string; name: string }[] }
export interface CaseAttachment { id: string; file_url: string; file_name: string; file_size: number; content_type: string }
export interface CaseMention { mentioned_user_id: string | null; mentioned_role_id: string | null }
```

Export from `packages/shared/src/types/index.ts` (or wherever the barrel export is).

### Page layout (CaseReportsPage.tsx)

Follow Store Audits page pattern:
1. **Header**: `FileWarning` icon + "Case Reports" title + open count badge
2. **Status tabs**: All | Open | Closed (default: All)
3. **Action row**: Filters button (toggleable) + "New Case Report" button (gated by `case_report.create`)
4. **Filter panel** (collapsible, staged Apply/Clear/Cancel): search input, date range (from/to), sort dropdown, VN toggle switch
5. **Card grid**: `space-y-3` stacked cards
6. **Detail panel**: Fixed right panel (max-w-[680px]) with slide transition

### Card (CaseReportCard.tsx)

- Case number (`Case 0001` — 4-digit zero-padded)
- Title (font-semibold)
- Description (truncated at 500 chars, `line-clamp`)
- Created by name + created date
- Status badge: green (`Open`), red (`Closed`)
- Bottom row: message count icon + count, unread badge (`+X`, only if joined and unread > 0), yellow dot if joined
- 3-dot menu: "Leave Discussion", "Mute Discussion" / "Unmute Discussion"

### Detail panel (CaseReportDetailPanel.tsx)

**Header section:**
- Case title, case number, status badge
- Created by, created date

**Body sections:**
- Full description (scrollable)
- Corrective Action section — display text or "Not yet added", "Add/Edit Corrective Action" button
- Resolution section — display text or "Not yet added", "Add/Edit Resolution" button
- Attachments list — uploaded files with download links, "Add File" button
- On closed cases: hide corrective action/resolution edit buttons (unless user has `case_report.manage`)

**Action footer:**
- "Close Case" button — disabled unless corrective_action AND resolution both filled. Requires `case_report.close`.
- "Request VN" button — shown only when case is closed. TODO placeholder.

**Chat section** (below or as a tab):
- Full chat thread with system messages interspersed
- Threaded replies shown inline below parent message
- Sticky input bar at bottom (hidden when case closed, unless `case_report.manage`)
- Input bar: text input + file attachment button + @ mention button
- MentionPicker: Discord-style dropdown showing Users and Roles in separate sections

### Routing

In `apps/web/src/app/router.tsx`:
```ts
{
  path: 'case-reports',
  element: (
    <PermissionGuard permission={PERMISSIONS.CASE_REPORT_VIEW}>
      <CaseReportsPage />
    </PermissionGuard>
  ),
},
```

### Sidebar

In `apps/web/src/features/dashboard/components/Sidebar.tsx`:
- Add `case_report.view` to the Management section's `hasAnyPermission(...)` guard
- Add Case Reports link **after Employee Verifications**, before the Internal Audit SubCategory:
```tsx
{hasPermission(PERMISSIONS.CASE_REPORT_VIEW) && (
  <NavLink to="/case-reports" className={linkClass}>
    <FileWarning className="h-5 w-5" />
    Case Reports
  </NavLink>
)}
```
- No collapsible subcategory needed — direct link like Employee Verifications.

### Socket hook

In `CaseReportsPage.tsx`:
```ts
const socket = useSocket('/case-reports');
// Listen for case-report:created, case-report:updated, case-report:message, etc.
// On event → silent refetch of list data
```

In `CaseReportDetailPanel.tsx` (or ChatSection):
```ts
// Listen for case-report:message → append to message list
// Listen for case-report:reaction → update reaction state
// Mark as read on panel open (POST /:id/read)
```

---

## 10. Implementation Order

### Phase 1: Shared + Permissions
1. Add permission keys to `packages/shared/src/constants/permissions.ts`
2. Add `case_report` category to `PERMISSION_CATEGORIES`
3. No changes needed in `roles.ts` (Administrator gets all via `Object.values`, Management via filter)
4. Create shared types `packages/shared/src/types/caseReport.types.ts`
5. Export from shared barrel

### Phase 2: Database
6. Create tenant migration `apps/api/src/migrations/tenant/018_case_reports.ts`
7. Create master migration `apps/api/src/migrations/master/011_case_report_permissions.ts` (seed permission rows + role assignments)

### Phase 3: Backend API
8. Add `/case-reports` Socket.IO namespace in `apps/api/src/config/socket.ts`
9. Create `apps/api/src/services/caseReport.service.ts`
10. Create `apps/api/src/controllers/caseReport.controller.ts`
11. Create `apps/api/src/routes/caseReport.routes.ts` with Zod validation schemas
12. Register route in `apps/api/src/routes/index.ts`

### Phase 4: Frontend — Page Shell
13. Create `apps/web/src/features/case-reports/services/caseReport.api.ts`
14. Create `CaseReportsPage.tsx` — header, status tabs, filter panel, card grid skeleton
15. Create `CaseReportCard.tsx`
16. Create `CaseReportFilterPanel.tsx`
17. Create `CreateCaseModal.tsx`
18. Add route to `router.tsx`
19. Add sidebar link to `Sidebar.tsx`

### Phase 5: Frontend — Detail Panel + Chat
20. Create `CaseReportDetailPanel.tsx` — info sections, action buttons, attachment list
21. Create `TextInputModal.tsx` — reusable for corrective action / resolution
22. Create `ChatSection.tsx` — message list + input bar
23. Create `ChatMessage.tsx` — message bubble with reactions, reply threading, attachments
24. Create `MentionPicker.tsx` — @mention dropdown

### Phase 6: Realtime + Notifications
25. Wire Socket.IO events in frontend (list refresh + chat live updates)
26. Implement mention notification fanout in service (user mentions + role mentions)
27. Handle notification click → navigate to `/case-reports?caseId={id}`

---

## 11. Verification Plan

1. **Migration**: Run `npx ts-node src/scripts/migrate-tenants.ts` from `apps/api/` — verify tables created
2. **Permissions**: Check role management UI — new "Case Reports" category visible with 4 permissions
3. **Create case**: POST `/api/v1/case-reports` with title + description → verify case_number auto-increments
4. **List cases**: GET with status/search/date filters → verify filtering works
5. **Chat**: Send messages, verify real-time delivery via socket to other connected clients
6. **Mentions**: @mention a user → verify notification created, pushed, and clickable
7. **Attachments**: Upload PDF to case → verify S3 path matches `{slug}-{env}/Case Reports/CASE-0001/`
8. **Close case**: Verify requires corrective_action + resolution, locks chat for non-manage users
9. **Leave/Mute**: Verify unread badge disappears on leave, notifications stop on mute
10. **Sidebar**: Verify link visible only with `case_report.view`, positioned after Employee Verifications

---

## 12. Open Questions

1. **Unread badge scope**: The `+X` unread badge on cards — should it count all messages since `last_read_at`, or only messages from other users (excluding own messages)? **Recommendation**: Exclude own messages from unread count.

2. **Auto-join on case creation**: The spec says a user is "joined" if they created the case, sent a message, or were mentioned. Should the creator be auto-joined as a participant on creation? **Recommendation**: Yes — insert `case_participants` row on create.

3. **"Leave Discussion" re-join behavior**: Spec says user is auto-rejoined on next message sent or mention received. If a user has left and is then mentioned, they get re-joined AND notified — is that correct even if they previously left intentionally? **Recommendation**: Yes — the leave is a soft opt-out from unread tracking, but mentions are high-signal and should re-engage.

4. **Chat message file types**: Case-level "Add File" is PDF-only, but chat attachments allow "images or files." Should chat attachments have a file type whitelist (e.g., images + PDF + common docs)? **Recommendation**: Allow images (jpg, png, gif, webp) + PDF + common office formats (doc, docx, xls, xlsx). Max 10MB each.

5. **Case number scope**: Is `case_number` unique per company (tenant DB) or globally? Since it's in the tenant DB, it's naturally per-company. `Case 0001` starts fresh for each company. **Recommendation**: Correct — per-company via tenant DB serial.

6. **Master migration for permissions**: The existing `databaseProvisioner.ts` seeds permissions from `PERMISSION_CATEGORIES` for new tenants. For existing tenants, we need master migration `011` to insert the new permission keys. Confirm: should this migration iterate over all company databases and insert into each tenant's `permissions` + `role_permissions`? **Yes** — follow the pattern where the master migration applies permission seeds across all registered tenant DBs.

7. **"Request VN" button**: Confirmed as UI placeholder only — sets `vn_requested = true` on the case record but no further backend logic. Future feature.

8. **Mark-as-read trigger**: When should `last_read_at` be updated? Options: (a) when the detail panel opens, (b) when messages are scrolled into view, (c) explicit "mark read" button. **Recommendation**: On detail panel open (simplest, matches Discord/Slack behavior). Add **POST `/:id/read`** endpoint called by frontend on panel mount.
