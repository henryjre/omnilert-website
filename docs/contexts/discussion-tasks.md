# Discussion + Tasks System — Context for AI Agents

This document covers the full architecture of the shared discussion + tasks system used in detail panels across features (Case Reports, AIC Variance, and any future feature that adopts it). Read this before implementing or modifying anything in this system.

---

## Overview

Each "record" (case report, AIC variance record, etc.) has:
1. A **Discussion tab** — a threaded chat where participants message, react, mention, and attach files.
2. A **Tasks tab** — a task list where managers assign work to employees, with each task having its own private chat thread.

The frontend components for both are **shared** across features. The backend services and database tables are **duplicated per feature** (parallel structure, different table names).

---

## Frontend Component Map

### Shared Components (`apps/web/src/shared/components/chat/`)

These are reused by every feature that implements this system.

| File | Purpose |
|---|---|
| `ChatSection.tsx` | Main discussion UI: message list + composer. Handles typing indicators, mentions, replies, file uploads, reactions. |
| `TaskList.tsx` | Compact task list shown in the Tasks tab. Quick-complete buttons, assignee avatars, progress display. |
| `TaskDetailPanel.tsx` | Slide-in full-screen panel for a single task: assignees, source message, task-scoped chat (uses ChatSection internally). |
| `TaskCreationModal.tsx` | Modal to create a task: description (max 120 chars) + assignee picker (GroupedUserSelect). |

### Internal Sub-Components (`apps/web/src/features/case-reports/components/`)

These are implementation details of ChatSection/ChatMessage. They are NOT moved to shared because they are only consumed internally.

| File | Purpose |
|---|---|
| `ChatMessage.tsx` | Single message renderer: bubbles, reactions, reply context, system messages, task bubbles, media galleries, swipe-to-reply, long-press. |
| `MentionPicker.tsx` | Autocomplete dropdown for @user and @role mentions. |
| `MessageActionMenu.tsx` | Context menu on message (reply, react, edit, delete, create task). Supports portal mode for correct z-index positioning. |
| `MessageDrawer.tsx` | Mobile bottom-sheet version of the action menu (shown on long-press). |
| `MessageReactionBadge.tsx` | Emoji reaction count badge below a message bubble. |
| `MessageReactionsOverlay.tsx` | Full reaction detail overlay (who reacted with what). |
| `ImagePreviewModal.tsx` | Full-screen image/video gallery lightbox with keyboard and touch navigation. |
| `EmojiPicker.tsx` | Emoji picker grid for adding reactions. |

### Other Shared UI (`apps/web/src/features/violation-notices/components/`)

| File | Purpose |
|---|---|
| `GroupedUserSelect.tsx` | Multi-select employee dropdown grouped by department (Management / Service Crew / Other). Used by TaskCreationModal. Supports `singleSelect`, `suspendedUserIds` props. |

---

## ChatSection Props Reference

```typescript
interface ChatSectionProps {
  className?: string;
  messages: (CaseMessage & { isPending?: boolean })[];
  currentUserId: string;
  currentUserName?: string;           // Required for typing indicators
  currentUserRoleIds?: string[];
  canManage: boolean;
  chatLocked: boolean;                // True = read-only, no composer shown
  isClosed?: boolean;                 // Shows "closed" banner instead of composer
  closedLabel?: string;
  users: MentionableUser[];           // From caseReport.api or aicVariance.api getMentionables()
  roles: MentionableRole[];
  socket?: Socket | null;             // For typing indicators — pass the feature's socket
  caseId?: string;                    // Used by socket typing events
  taskId?: string;                    // Used by socket typing events (distinguishes task vs main chat)
  initialFlashMessageId?: string | null; // Auto-scroll + flash highlight on mount
  onFlashMessageConsumed?: () => void;
  onSend: (input: {
    content: string;
    parentMessageId?: string | null;
    mentionedUserIds: string[];
    mentionedRoleIds: string[];
    files: File[];
  }) => Promise<void>;
  onReact: (messageId: string, emoji: string) => Promise<void>;
  onEdit: (messageId: string, newContent: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
  onCreateTask?: (message: CaseMessage) => void;  // Omit to disable "Create Task" menu item
  tasks?: CaseTask[];                 // Needed for task bubble rendering in ChatMessage
  onOpenTask?: (task: CaseTask) => void;
  disableAttachments?: boolean;
  disableReply?: boolean;
  disableReactions?: boolean;
}
```

**`MentionableUser` and `MentionableRole`** are defined in `apps/web/src/features/case-reports/services/caseReport.api.ts`. AIC Variance re-declares compatible types locally in `aicVariance.api.ts` and casts them with `as any` when passing to ChatSection.

---

## TaskDetailPanel Props Reference

```typescript
interface TaskDetailPanelProps {
  task: CaseTask;
  messages: CaseTaskMessage[];
  currentUserId: string;
  currentUserName?: string;
  currentUserRoleIds?: string[];
  canManage: boolean;
  users: MentionableUser[];
  roles: MentionableRole[];
  socket?: Socket | null;
  initialFlashMessageId?: string | null;
  onBack: () => void;
  onComplete: (taskId: string, userId: string) => Promise<void>;
  onSendMessage: (taskId: string, content: string, files?: File[], parentMessageId?: string | null, mentionedUserIds?: string[], mentionedRoleIds?: string[]) => Promise<void>;
  onReact: (taskId: string, messageId: string, emoji: string) => Promise<void>;
  onJumpToMessage: (messageId: string) => void; // Jump to source message in main discussion
}
```

TaskDetailPanel internally converts `CaseTaskMessage[]` → `CaseMessage[]` before passing to ChatSection. This adapter is inside the component and handles the structural differences (file attachment shape, mention shape, etc.).

**AIC Variance usage:** AIC Variance also adapts `AicTask` → `CaseTask` (via `adaptAicTaskToCaseTask`) and `AicTaskMessage[]` → `CaseTaskMessage[]` (via `adaptAicTaskMessageToCaseTaskMessage`) before passing to TaskDetailPanel. Both adapters live in `AicVarianceDetailPanel.tsx`.

---

## Data Flow: Creating a Task from a Message

1. User long-presses / hovers a message → action menu → "Create Task"
2. `ChatMessage` calls `onCreateTask(message)`
3. Parent detail panel opens `TaskCreationModal` with `defaultDescription = message.content`
4. User edits description, selects assignees via `GroupedUserSelect`
5. Modal calls `onSubmit({ description, assigneeUserIds })`
6. Parent calls API: `createCaseTask(caseId, { description, assigneeUserIds, sourceMessageId: message.id })`
7. Backend inserts task row, inserts assignees, creates bubble message in `case_messages`, updates `task.discussion_message_id`, creates system message, emits socket events
8. Frontend refreshes tasks + messages
9. The original message now has a linked task — `ChatMessage` detects `tasks.find(t => t.discussion_message_id === message.id)` and renders a **task bubble** instead of a normal bubble

---

## Data Flow: Task Bubble in Discussion

The task bubble is a regular `case_messages` row with `is_system = false` whose `id` is stored in `task.discussion_message_id`. Its content is:

```
"Task: {description} - {doneCount} of {totalCount} assignee(s) done"
```

When an assignee is marked done, the backend updates this message's `content` and `created_at` (bumping it to the top of the discussion). `ChatMessage` detects this message by finding a task where `task.discussion_message_id === message.id` and renders a rich task card instead of a plain text bubble.

---

## Data Flow: Opening a Task

1. User taps task bubble (in `ChatMessage`) or task row (in `TaskList`)
2. Parent calls `onOpenTask(task)` or `onTaskClick(task)` → triggers `onLoadTaskMessages(task.id)` → sets `activeTaskId`
3. `AnimatePresence` slides in `TaskDetailPanel`
4. Task panel shows: header + "In Progress"/"Done" badge, source message block (with "Jump to message" link), assignees list with "Mark as Done" buttons, embedded ChatSection for task-scoped messages

---

## Data Flow: Completing a Task

- Only the **task creator** (`task.created_by === currentUserId`) can mark any assignee as done
- The "Mark as Done" button appears in both `TaskList` (quick-complete for the first incomplete assignee) and `TaskDetailPanel` (per-assignee row)
- `onComplete(taskId, userId)` is called with the assignee's user ID
- Backend marks `completed_at`, updates bubble content, inserts system message, emits events

---

## Typing Indicators

`ChatSection` emits and listens to typing events via the passed `socket` prop:

```
Emit:   socket.emit('case-report:typing', { caseId, userName, taskId? })
Emit:   socket.emit('case-report:typing:stop', { caseId, userName, taskId? })
Listen: socket.on('case-report:typing', ...)
Listen: socket.on('case-report:typing:stop', ...)
```

The `taskId` field distinguishes typing in the main discussion from typing in a task thread. Both case-reports and AIC variance use the same event names — this is because the socket namespace differs (`/case-reports` vs `/aic-variance`) so there is no collision.

> **Important:** The `/aic-variance` socket namespace is **not explicitly registered** in `apps/api/src/config/socket.ts` with auth middleware. Socket.IO creates it on-demand when `emitAicEvent` calls `getIO().of('/aic-variance')`. This means AIC Variance sockets have **no authentication middleware** — anyone who knows the namespace can connect. This is a known gap.

---

## Socket Architecture

### Namespaces

| Namespace | Registered in socket.ts? | Permission checked |
|---|---|---|
| `/case-reports` | Yes (line 176) | `CASE_REPORT_VIEW` |
| `/aic-variance` | No — dynamic | None |

### Case Reports Socket (`/case-reports`)

**Server → Client events:**

| Event | Payload | Triggered by |
|---|---|---|
| `case-report:created` | `{ id, caseNumber, title, status, createdBy }` | New case |
| `case-report:updated` | `{ id, caseNumber, field }` | Status change, VN request |
| `case-report:message` | `{ caseId, message? }` | New/bumped message |
| `case-report:reaction` | `{ caseId, messageId, reactions }` | Reaction toggled |
| `case-report:message:edited` | `{ caseId, message }` | Message edited |
| `case-report:message:deleted` | `{ caseId, messageId }` | Message deleted |
| `case-report:attachment` | `{ caseId, attachment }` | File uploaded |
| `case-report:task:created` | `{ caseId, taskId? }` | Task created |
| `case-report:task:updated` | `{ caseId, taskId? }` | Task completed / message sent |
| `case-report:typing` | `{ caseId, userName, taskId? }` | User typing |
| `case-report:typing:stop` | `{ caseId, userName, taskId? }` | User stopped typing |

**Client → Server events:**

| Event | Payload |
|---|---|
| `case-report:join` | `{ caseId }` — allows cross-company room join |
| `case-report:typing` | `{ caseId, userName, taskId? }` |
| `case-report:typing:stop` | `{ caseId, userName, taskId? }` |

### AIC Variance Socket (`/aic-variance`)

**Server → Client events:**

| Event | Payload | Triggered by |
|---|---|---|
| `aic-variance:created` | `{ ... }` | New AIC record |
| `aic-variance:updated` | `{ aicId?, id? }` | Record field changed, message sent/edited/deleted, reaction |
| `aic-variance:message` | `{ aicId }` | New/bumped message |
| `aic-variance:reaction` | `{ aicId }` | Reaction toggled |
| `aic-variance:task:created` | `{ aicId, taskId }` | Task created |
| `aic-variance:task:updated` | `{ aicId, taskId }` | Task completed / task message sent |

### Frontend Socket Usage

`useSocket(namespace)` hook (`apps/web/src/shared/hooks/useSocket.ts`):
- Singleton per namespace — multiple components sharing the same namespace get the same socket instance
- Reference counted — disconnects when last consumer unmounts
- Re-creates on token change (logout/re-login)
- Transports: polling first, then websocket upgrade

**Case Reports page** (`CaseReportsPage.tsx`) listens on the socket and calls `fetchDetail(caseId)` (full refresh) on most events. This is a simple but heavy approach — any message event causes a full re-fetch of the case detail.

**AIC Variance page** (`AicVariancePage.tsx`) does the same: on `aic-variance:message` or `aic-variance:updated`, it calls `fetchDetail(selectedAicId)` which re-fetches messages, tasks, and the record detail.

---

## REST API Endpoints

### Case Reports — Messages

| Method | Path | Notes |
|---|---|---|
| GET | `/case-reports/:id/messages` | Returns flat sorted list, all non-deleted |
| POST | `/case-reports/:id/messages` | Multipart form (files optional). Body: `content`, `parentMessageId?`, `mentionedUserIds[]`, `mentionedRoleIds[]` |
| PATCH | `/case-reports/:id/messages/:messageId` | Body: `{ content }`. Sets `is_edited`. Only own messages unless canManage. |
| DELETE | `/case-reports/:id/messages/:messageId` | Soft-delete. Sets `is_deleted=true`, replaces content. Cannot delete system messages. |
| POST | `/case-reports/:id/messages/:messageId/reactions` | Body: `{ emoji }`. Toggles — adds if missing, removes if exists. |

### Case Reports — Tasks

| Method | Path | Notes |
|---|---|---|
| GET | `/case-reports/:id/tasks` | Returns all tasks with assignees, last message, message count |
| POST | `/case-reports/:id/tasks` | Body: `{ description, assigneeUserIds[], sourceMessageId? }` |
| GET | `/case-reports/:id/tasks/:taskId` | Single task detail |
| GET | `/case-reports/:id/tasks/:taskId/messages` | Task thread messages |
| POST | `/case-reports/:id/tasks/:taskId/messages` | Multipart form. Has bump logic + mention/reply notifications |
| POST | `/case-reports/:id/tasks/:taskId/complete` | Body: `{ userId }` (assignee to mark done). Only task creator can call. |
| POST | `/case-reports/:id/tasks/:taskId/messages/:messageId/reactions` | Body: `{ emoji }` |

### AIC Variance — Messages

| Method | Path |
|---|---|
| GET | `/aic-variance/:id/messages` |
| POST | `/aic-variance/:id/messages` |
| PATCH | `/aic-variance/:id/messages/:messageId` |
| DELETE | `/aic-variance/:id/messages/:messageId` |
| POST | `/aic-variance/:id/messages/:messageId/reactions` |

### AIC Variance — Tasks

| Method | Path |
|---|---|
| GET | `/aic-variance/:id/tasks` |
| POST | `/aic-variance/:id/tasks` |
| GET | `/aic-variance/:id/tasks/:taskId` |
| GET | `/aic-variance/:id/tasks/:taskId/messages` |
| POST | `/aic-variance/:id/tasks/:taskId/messages` |
| POST | `/aic-variance/:id/tasks/:taskId/complete` |
| POST | `/aic-variance/:id/tasks/:taskId/messages/:messageId/reactions` |

---

## Backend Services

| File | Responsibility |
|---|---|
| `apps/api/src/services/caseReport.service.ts` | Case discussion messages: list, send, edit, delete, react, enrich |
| `apps/api/src/services/caseReportTask.service.ts` | Case tasks: CRUD, assignees, task messages, completion, bubble updates |
| `apps/api/src/services/aicVariance.service.ts` | AIC discussion messages (+ record management) |
| `apps/api/src/services/aicVarianceTask.service.ts` | AIC tasks: CRUD, assignees, task messages, completion, bubble updates |
| `apps/api/src/services/aicVarianceWebhook.service.ts` | `emitAicEvent()` helper — broadcasts to `/aic-variance` namespace |

---

## Database Schema

### Shared Pattern

Both features follow the same schema pattern:
- A **messages** table (flat, all messages including replies and system messages)
- A **reactions** table (per message)
- An **attachments** table or inline columns (per message)
- A **mentions** table (per message)
- A **participants** table (join/mute/read tracking)
- A **tasks** table (with `discussion_message_id` FK back to messages)
- A **task_assignees** table
- A **task_messages** table (task-scoped chat, also flat)
- A **task_message_reactions** table
- A **task_message_mentions** table

### Case Reports Tables

```sql
case_reports (
  id UUID PK,
  company_id UUID FK companies,
  case_number INT,
  title TEXT,
  description TEXT,
  status TEXT,           -- 'open' | 'closed'
  corrective_action TEXT,
  resolution TEXT,
  summary TEXT,
  vn_requested BOOLEAN,
  linked_vn_id UUID,
  branch_id UUID FK branches,
  created_by UUID FK users,
  closed_by UUID FK users,
  closed_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

case_participants (
  case_id UUID FK case_reports CASCADE,
  user_id UUID FK users CASCADE,
  is_joined BOOLEAN,
  is_muted BOOLEAN,
  last_read_at TIMESTAMP,
  PRIMARY KEY (case_id, user_id)
)

case_messages (
  id UUID PK,
  case_id UUID FK case_reports CASCADE,
  user_id UUID FK users,
  content TEXT,
  is_system BOOLEAN,
  is_deleted BOOLEAN,
  deleted_by UUID FK users,
  parent_message_id UUID FK case_messages,   -- self-ref for replies
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

case_reactions (
  message_id UUID FK case_messages CASCADE,
  user_id UUID FK users CASCADE,
  emoji VARCHAR(20),
  UNIQUE (message_id, user_id, emoji)
)

case_attachments (
  id UUID PK,
  case_id UUID FK case_reports CASCADE,
  message_id UUID FK case_messages,          -- nullable (case-level attachments have no message)
  uploaded_by UUID FK users,
  file_url TEXT,
  file_name TEXT,
  file_size BIGINT,
  content_type TEXT,
  created_at TIMESTAMP
)

case_mentions (
  message_id UUID FK case_messages CASCADE,
  mentioned_user_id UUID FK users,           -- nullable
  mentioned_role_id UUID FK roles,           -- nullable
  mentioned_name VARCHAR(255)
)

case_report_tasks (
  id UUID PK,
  case_id UUID FK case_reports CASCADE,
  created_by UUID FK users,
  source_message_id UUID FK case_messages,     -- message that spawned this task
  discussion_message_id UUID FK case_messages, -- the task bubble in main discussion
  description TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

case_report_task_assignees (
  id UUID PK,
  task_id UUID FK case_report_tasks CASCADE,
  user_id UUID FK users CASCADE,
  completed_at TIMESTAMP,
  completed_by UUID FK users,
  UNIQUE (task_id, user_id)
)

case_report_task_messages (
  id UUID PK,
  task_id UUID FK case_report_tasks CASCADE,
  user_id UUID FK users,
  content TEXT,
  file_url TEXT,
  file_name TEXT,
  file_size BIGINT,
  content_type TEXT,
  parent_message_id UUID FK case_report_task_messages,
  created_at TIMESTAMP
)

case_report_task_reactions (
  message_id UUID FK case_report_task_messages CASCADE,
  user_id UUID FK users CASCADE,
  emoji VARCHAR(20),
  UNIQUE (message_id, user_id, emoji)
)

case_report_task_mentions (
  message_id UUID FK case_report_task_messages CASCADE,
  mentioned_user_id UUID FK users,
  mentioned_role_id UUID FK roles,
  mentioned_name VARCHAR(255)
)
```

### AIC Variance Tables

```sql
aic_records (
  id UUID PK,
  company_id UUID FK companies CASCADE,
  aic_number INT,
  reference TEXT,
  branch_id UUID FK branches,
  aic_date DATE,
  status TEXT,             -- 'open' | 'resolved'
  summary TEXT,
  resolution TEXT,
  vn_requested BOOLEAN,
  linked_vn_id UUID,
  resolved_by UUID FK users,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE (company_id, reference)
)

aic_participants (
  aic_record_id UUID FK aic_records CASCADE,
  user_id UUID FK users CASCADE,
  is_joined BOOLEAN,
  is_muted BOOLEAN,
  last_read_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE (aic_record_id, user_id)
)

aic_messages (
  id UUID PK,
  aic_record_id UUID FK aic_records CASCADE,
  user_id UUID FK users,
  content TEXT,
  is_system BOOLEAN,
  is_deleted BOOLEAN,
  is_edited BOOLEAN,
  parent_message_id UUID FK aic_messages,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

aic_message_reactions (
  message_id UUID FK aic_messages CASCADE,
  user_id UUID FK users CASCADE,
  emoji TEXT,
  UNIQUE (message_id, user_id, emoji)
)

aic_message_attachments (
  id UUID PK,
  message_id UUID FK aic_messages,
  aic_record_id UUID FK aic_records CASCADE,
  file_url TEXT,
  file_name TEXT,
  file_size BIGINT,
  content_type TEXT,
  created_at TIMESTAMP
)

aic_message_mentions (
  message_id UUID FK aic_messages CASCADE,
  mentioned_user_id UUID FK users,
  mentioned_role_id UUID FK roles,
  created_at TIMESTAMP
)

aic_tasks (
  id UUID PK,
  aic_record_id UUID FK aic_records CASCADE,
  created_by UUID FK users,
  source_message_id UUID FK aic_messages,
  discussion_message_id UUID FK aic_messages,
  description TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

aic_task_assignees (
  task_id UUID FK aic_tasks CASCADE,
  user_id UUID FK users CASCADE,
  completed_at TIMESTAMP,
  completed_by UUID FK users,
  created_at TIMESTAMP,
  UNIQUE (task_id, user_id)
)

aic_task_messages (
  id UUID PK,
  task_id UUID FK aic_tasks CASCADE,
  user_id UUID FK users,
  content TEXT,
  file_url TEXT,
  file_name TEXT,
  file_size BIGINT,
  content_type TEXT,
  parent_message_id UUID FK aic_task_messages,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

aic_task_message_reactions (
  message_id UUID FK aic_task_messages CASCADE,
  user_id UUID FK users CASCADE,
  emoji TEXT,
  UNIQUE (message_id, user_id, emoji)
)

aic_task_message_mentions (
  message_id UUID FK aic_task_messages CASCADE,
  mentioned_user_id UUID FK users,
  mentioned_role_id UUID FK roles,
  created_at TIMESTAMP
)
```

---

## Shared Types (`packages/shared/src/types/`)

### `CaseMessage`
```typescript
interface CaseMessage {
  id: string;
  case_id: string;
  user_id: string;
  user_name?: string;
  user_avatar?: string;
  content: string;
  is_system: boolean;
  is_deleted: boolean;
  is_edited: boolean;
  parent_message_id: string | null;
  replies?: CaseMessage[];       // present in type but NOT used — API returns flat
  reactions: CaseReaction[];     // { emoji, users: { id, name }[] }[]
  attachments: CaseAttachment[]; // { id, file_url, file_name, file_size, content_type }[]
  mentions: CaseMention[];       // { mentioned_user_id, mentioned_role_id, mentioned_name }[]
  created_at: string;
}
```

### `CaseTask`
```typescript
interface CaseTask {
  id: string;
  case_id: string;
  created_by: string | null;
  created_by_name: string | null;
  source_message_id: string | null;
  source_message_content: string | null;
  source_message_user_name: string | null;
  description: string;
  discussion_message_id: string | null;
  assignees: CaseTaskAssignee[];
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  last_message_content: string | null;
  last_message_user_name: string | null;
  last_message_user_avatar: string | null;
  message_count: number;
}

interface CaseTaskAssignee {
  id: string;
  task_id: string;
  user_id: string;
  user_name: string | null;
  user_avatar: string | null;
  completed_at: string | null;
  completed_by: string | null;
  completed_by_name: string | null;
}

interface CaseTaskMessage {
  id: string;
  task_id: string;
  user_id: string | null;
  user_name: string | null;
  user_avatar: string | null;
  content: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  content_type: string | null;
  parent_message_id: string | null;
  reactions: CaseTaskReaction[];
  mentions: CaseTaskMention[];
  created_at: string;
}
```

### `AicMessage` / `AicTask` / `AicTaskMessage`

Structurally parallel to Case Report types. Key difference: `AicMessage` has `aic_record_id` instead of `case_id`. See `packages/shared/src/types/aicVariance.types.ts`.

---

## System Messages

System messages are stored in the main discussion table with `is_system = true`. They render as a centered gray pill in `ChatMessage`.

**Case Reports — generated by:**
- Case created → `"{userName} created this case"`
- Task created → `"{creatorName} created a task: {description}"`
- Assignee marked done → `"{assigneeName} completed their task: {description}"` or `"Task completed: {description}"` (when all done)
- Case closed → `"{userName} closed this case"`
- File uploaded → `"{userName} attached a file: {fileName}"`
- VN requested → `"{userName} requested a Violation Notice"`

**AIC Variance — generated by:**
- Task created → `"{creatorName} created a task: {description}"`
- Assignee marked done → `"{assigneeName} completed their task: {description}"` or `"Task completed: {description}"`
- Record resolved → `"{userName} marked this AIC record as resolved"`
- VN requested → `"{userName} requested a Violation Notice"`

System messages cannot be replied to, edited, or deleted. The backend enforces this.

---

## Notifications

### Case Reports
- **Reply**: Notify parent message author (if not muted). Link: `/case-reports?caseId=X&messageId=Y`
- **Mention**: Notify mentioned users + all members of mentioned roles (if not muted). Link same.
- **Task assigned**: Notify each assignee (skip creator). Link: `/case-reports?caseId=X&taskId=Y`
- **Task reply**: Notify parent message author. Link: `/case-reports?caseId=X&taskId=Y&messageId=Z`
- **Task mention**: Notify mentioned users + role members. Link same as task reply.
- De-duplication: users already notified for a reply are excluded from mention notifications.

### AIC Variance
- **Reply**: Notify parent message author. Link: `/aic-variance?aicId=X&messageId=Y`
- **Mention**: Notify mentioned users + role members. Link same.
- **Task assigned**: Notify each assignee (skip creator). Link: `/aic-variance?aicId=X`
- Task assigned also upserts the assignee as a participant (`is_joined: true`).

---

## File Uploads

### Case Reports — Discussion Messages
- Stored in `case_attachments` table (separate from message content)
- S3 folder: `{companyStorageRoot}/Case Reports/CASE-{paddedNumber}/`
- Up to 10 files, 50MB each, images/video/PDF/Office docs

### Case Reports — Task Messages
- Stored inline in `case_report_task_messages` columns (`file_url`, `file_name`, `file_size`, `content_type`)
- S3 folder: `{companyStorageRoot}/task-messages/`

### AIC Variance — Discussion Messages
- Stored in `aic_message_attachments` table
- S3 folder: `{companyId}/aic-messages/{messageId}/`

### AIC Variance — Task Messages
- Stored inline in `aic_task_messages` columns
- S3 folder: `{companyId}/aic-task-messages/`

---

## Known Bugs and Their Fixes

### Bug 1: Reply messages not showing in AIC Variance discussion

**Symptom:** When a user sends a reply (using the reply button) in an AIC Variance discussion, the reply preview bubble ("X replied to Y") does not appear on the message.

**Root cause:** `aicVariance.service.ts` `enrichMessages()` was filtering the message list to only top-level messages (`WHERE parent_message_id IS NULL`) and nesting replies inside a `replies` array on each parent. The frontend then passed this nested structure to `ChatSection` as `allMessages`. When `ChatMessage` tried to look up `findInTree(allMessages, message.parent_message_id)`, it searched only the top-level array and could not find the parent because replies were nested inside, not in the flat list.

**Fix (applied):** Changed `enrichMessages()` in `apps/api/src/services/aicVariance.service.ts` to return all messages flat (sorted by `created_at`), identical to how `caseReport.service.ts` works. The `replies` field in `AicMessage` type exists but is no longer populated by the API.

**Pattern to follow:** Always return discussion messages as a **flat array sorted by `created_at` ascending**, with `parent_message_id` kept as a pointer. Do not nest replies inside parent objects. The frontend's `findInTree` in `ChatMessage` only does a flat `Array.find()`.

### Bug 2: AIC Variance socket namespace has no authentication

**Symptom:** Any client that knows the namespace URL can connect to `/aic-variance` without a valid JWT or permission check.

**Root cause:** The `/aic-variance` socket namespace is never explicitly registered in `apps/api/src/config/socket.ts` with auth middleware. Socket.IO creates it dynamically when `emitAicEvent` calls `getIO().of('/aic-variance')`, but no `use()` middleware is attached to it.

**Fix (not yet applied):** Register the `/aic-variance` namespace in `socket.ts` with the same JWT + permission middleware pattern used by `/case-reports`, requiring `PERMISSIONS.AIC_VARIANCE_VIEW`.

### Bug 3: New features must return messages flat

**Symptom:** If a new feature implements its own `enrichMessages` / `listMessages` backend function and returns nested messages (with `replies` inside parents), the reply preview bubbles will not render.

**Fix:** Always return messages as a flat array. The `replies` optional field on `CaseMessage` / `AicMessage` is vestigial — it exists in the TypeScript types but should not be populated. The frontend does not use it anywhere.

---

## Implementing This System for a New Feature

### Backend Checklist

1. Create DB tables following the schema pattern: `{feature}_messages`, `{feature}_message_reactions`, `{feature}_message_attachments` or inline columns, `{feature}_message_mentions`, `{feature}_participants`, `{feature}_tasks`, `{feature}_task_assignees`, `{feature}_task_messages`, `{feature}_task_message_reactions`, `{feature}_task_message_mentions`.

2. Create a service file with `listMessages`, `sendMessage`, `editMessage`, `deleteMessage`, `toggleReaction`, and a `createSystemMessage` helper. **Critical:** `listMessages` must return a **flat array** sorted by `created_at`, with `parent_message_id` preserved on each row.

3. Create a task service file with `createTask`, `listTasks`, `listTaskMessages`, `sendTaskMessage`, `completeTaskForAssignee`, `toggleTaskReaction`.

4. In `createTask`:
   - Insert the task row
   - Insert assignees
   - Create the bubble message in `{feature}_messages` with `is_system = false`, content: `"Task: {description} - 0 of {count} assignee(s) done"`
   - Store the bubble message ID in `task.discussion_message_id`
   - Create a system message: `"{creatorName} created a task: {description}"`
   - Dispatch notifications to assignees

5. In `completeTaskForAssignee`:
   - Update assignee `completed_at`
   - Update bubble content: `"Task: {description} - {doneCount} of {total} assignee(s) done"`
   - Create system message: `"{assigneeName} completed their task: {description}"` or `"Task completed: {description}"` when all done
   - Emit socket events

6. Register a socket namespace in `apps/api/src/config/socket.ts` with JWT auth middleware requiring the appropriate `VIEW` permission. Broadcast to `company:{companyId}` room.

7. Create REST routes and controllers following the endpoint patterns above.

### Frontend Checklist

1. Create a `{feature}.api.ts` service file with all message + task API calls. The `MentionableUser` and `MentionableRole` types can be declared locally (compatible with the ones in `caseReport.api.ts`).

2. Use `useSocket('/{feature-namespace}')` in the feature page to get a socket instance.

3. Listen to socket events in the page component and call `fetchDetail(id)` to refresh on relevant events.

4. In the detail panel component:
   - Import `ChatSection`, `TaskList`, `TaskDetailPanel`, `TaskCreationModal` from `@/shared/components/chat/`
   - Pass messages cast as `as any` if using a feature-specific message type (the shapes are compatible)
   - If your task/message types differ from `CaseTask`/`CaseTaskMessage`, write adapter functions (see `adaptAicTaskToCaseTask` and `adaptAicTaskMessageToCaseTaskMessage` in `AicVarianceDetailPanel.tsx`)
   - Pass `socket`, `caseId` (use your record ID), `currentUserName` to ChatSection for typing indicators to work

5. Pass `groupedUsers` (from `listGroupedUsers()` API call) to `TaskCreationModal`. This is a `GroupedUsersResponse` from `@omnilert/shared`.

6. Load task messages lazily on `onOpenTask` — do not pre-load all task messages on panel open.

---

## Key Files Quick Reference

| Category | File |
|---|---|
| Shared chat UI | `apps/web/src/shared/components/chat/ChatSection.tsx` |
| Shared task UI | `apps/web/src/shared/components/chat/TaskList.tsx` |
| Shared task detail | `apps/web/src/shared/components/chat/TaskDetailPanel.tsx` |
| Shared task creation | `apps/web/src/shared/components/chat/TaskCreationModal.tsx` |
| Message renderer | `apps/web/src/features/case-reports/components/ChatMessage.tsx` |
| Mention picker | `apps/web/src/features/case-reports/components/MentionPicker.tsx` |
| Action menu | `apps/web/src/features/case-reports/components/MessageActionMenu.tsx` |
| Employee select | `apps/web/src/features/violation-notices/components/GroupedUserSelect.tsx` |
| Socket hook | `apps/web/src/shared/hooks/useSocket.ts` |
| Socket server config | `apps/api/src/config/socket.ts` |
| Case discussion service | `apps/api/src/services/caseReport.service.ts` |
| Case task service | `apps/api/src/services/caseReportTask.service.ts` |
| AIC discussion service | `apps/api/src/services/aicVariance.service.ts` |
| AIC task service | `apps/api/src/services/aicVarianceTask.service.ts` |
| AIC socket emitter | `apps/api/src/services/aicVarianceWebhook.service.ts` |
| Shared types | `packages/shared/src/types/caseReport.types.ts` |
| Shared task types | `packages/shared/src/types/caseReportTask.types.ts` |
| AIC types | `packages/shared/src/types/aicVariance.types.ts` |
| Case panel (consumer) | `apps/web/src/features/case-reports/components/CaseReportDetailPanel.tsx` |
| AIC panel (consumer) | `apps/web/src/features/aic-variance/components/AicVarianceDetailPanel.tsx` |
| VN panel (consumer) | `apps/web/src/features/violation-notices/components/ViolationNoticeDetailPanel.tsx` |
