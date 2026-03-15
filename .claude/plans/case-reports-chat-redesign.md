# Case Reports Chat UI Redesign

## Context

The current chat UI in `CaseReportDetailPanel` uses a basic message bubble layout with quick-reaction buttons inline on every message. The redesign introduces Discord-style UX: avatar + name/timestamp layout, quoted reply threading, a fixed 7-emoji picker, desktop hover menus, mobile long-press drawers, system message differentiation, and edit/delete capabilities. Two missing API endpoints (PATCH/DELETE message) must also be added.

---

## 1. Component Tree

```
CaseReportDetailPanel
└── ChatSection                       (modified)
    ├── [message list]
    │   └── ChatMessage               (modified, per message)
    │       ├── [quoted reply block]  (inline, no sub-component)
    │       ├── EmojiPicker           (NEW — desktop, on smiley icon click)
    │       ├── MessageActionMenu     (NEW — desktop hover ⋯ dropdown)
    │       └── MessageDrawer         (NEW — mobile long-press bottom drawer)
    │           └── EmojiPicker       (NEW — reused inside drawer)
    └── [reply preview bar]           (inline in ChatSection)
        [chat input area]
```

---

## 2. Missing API Endpoints (not in original plan)

### Backend — add to `apps/api/src/routes/caseReport.routes.ts`

| Method | Path | Permission | Description |
|---|---|---|---|
| `PATCH` | `/:id/messages/:messageId` | `case_report.view` | Edit own message content. Service must verify `message.user_id === req.user.id`. |
| `DELETE` | `/:id/messages/:messageId` | `case_report.view` | Delete message. Allowed if own message OR `case_report.manage`. Soft-delete or hard-delete (use hard-delete — set content to null or remove row; recommend remove row since `ON DELETE CASCADE` already handles child data). |

### Backend — add to `apps/api/src/services/caseReport.service.ts`

- `editMessage(input: { caseId, messageId, content, requestingUserId })` — validates ownership, updates `content` + `updated_at`, emits `case-report:message:edited` socket event
- `deleteMessage(input: { caseId, messageId, requestingUserId, canManage })` — validates ownership or manage permission, deletes row, emits `case-report:message:deleted` socket event

### Frontend — add to `apps/web/src/features/case-reports/services/caseReport.api.ts`

```ts
export async function editCaseMessage(caseId: string, messageId: string, content: string): Promise<CaseMessage>
export async function deleteCaseMessage(caseId: string, messageId: string): Promise<void>
```

### Shared types — add `is_edited` to `CaseMessage` in `packages/shared/src/types/caseReport.types.ts`

```ts
export interface CaseMessage {
  // ... existing fields ...
  is_edited: boolean;  // ADD — set true by backend on PATCH
}
```

### New socket events — add to `packages/shared/src/types/socket.types.ts`

```ts
'case-report:message:edited': (data: { caseId: string; message: CaseMessage }) => void;
'case-report:message:deleted': (data: { caseId: string; messageId: string }) => void;
```

---

## 3. New Components — Props Interfaces

### `EmojiPicker.tsx`
**Path:** `apps/web/src/features/case-reports/components/EmojiPicker.tsx`

```ts
interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  // Positioning hint for desktop: 'above' | 'below' (default 'above')
  placement?: 'above' | 'below';
}
```

Fixed emoji set (order): `['✅', '❤️', '🤣', '🙏', '👌', '😭', '😊']`

Renders as a small pill row: `flex gap-1 rounded-xl border bg-white shadow-md px-2 py-1.5`. Each emoji is a `<button>` with `text-lg` and hover highlight. Closes on outside click via a `useEffect` on `document.mousedown`.

---

### `MessageActionMenu.tsx`
**Path:** `apps/web/src/features/case-reports/components/MessageActionMenu.tsx`

```ts
interface MessageActionMenuProps {
  messageId: string;
  isOwnMessage: boolean;
  canManage: boolean;         // case_report.manage permission
  chatLocked: boolean;        // case is closed and user cannot manage
  onReply: () => void;
  onCopyText: () => void;
  onAddReaction: () => void;  // triggers EmojiPicker open
  onEdit: () => void;         // only rendered when isOwnMessage && !chatLocked
  onDelete: () => void;       // rendered when isOwnMessage || canManage
  onClose: () => void;
}
```

Renders as a small absolute-positioned dropdown (`z-50`, `rounded-xl border bg-white shadow-lg`). Items: Reply, Copy Text, Add Reaction, Edit Message (conditional), Delete Message (conditional). Closes on outside click.

---

### `MessageDrawer.tsx`
**Path:** `apps/web/src/features/case-reports/components/MessageDrawer.tsx`

```ts
interface MessageDrawerProps {
  isOpen: boolean;
  message: CaseMessage;
  currentUserId: string;
  canManage: boolean;
  chatLocked: boolean;
  userHasReacted: (emoji: string) => boolean;  // for highlighting active reactions in emoji row
  onReact: (emoji: string) => void;
  onReply: () => void;
  onCopyText: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}
```

Renders a fixed bottom drawer with:
- Backdrop: `fixed inset-0 z-40 bg-black/30` (click → close, `document.body` scroll lock via `overflow-hidden` class on mount)
- Drawer: `fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white shadow-xl` with slide-up animation (`translate-y-0` / `translate-y-full` via CSS transition)
- Row 1: 7 emoji buttons (highlight with ring/scale if user already reacted)
- `<hr>` divider
- Action list items: same conditional logic as `MessageActionMenu`
- Inline `EmojiPicker` renders below the emoji row only if "Add Reaction" tapped (rare path — keeps drawer open, renders picker in drawer)

---

## 4. Modified Components

### `ChatMessage.tsx`
**Path:** `apps/web/src/features/case-reports/components/ChatMessage.tsx`

**New props interface:**
```ts
interface ChatMessageProps {
  message: CaseMessage;
  currentUserId: string;
  canManage: boolean;
  chatLocked: boolean;
  allMessages: CaseMessage[];   // needed to resolve quoted message text for reply block
  onReply: (message: CaseMessage) => void;
  onReact: (messageId: string, emoji: string) => void;
  onEdit: (messageId: string, newContent: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
  onScrollToMessage: (messageId: string) => void;  // for clicking quoted block
}
```

**Layout structure (non-system message):**

```
[group wrapper: relative flex gap-3, on hover show ⋯ button]
  [avatar: w-8 h-8 rounded-full]  ← img if user_avatar, else initials circle
  [right column: flex-1]
    [line 1: flex gap-2 items-baseline]
      <span class="text-sm font-semibold text-gray-900">{user_name}</span>
      <span class="text-xs text-gray-400">{formatted timestamp}</span>
      {is_edited && <span class="text-xs text-gray-400 italic">edited</span>}
    [quoted reply block — if parent_message_id]
      border-l-2 border-gray-300 pl-2 mb-1 cursor-pointer
      <p class="text-xs font-medium text-gray-500">{parent author name}</p>
      <p class="text-xs text-gray-400 truncate">{parent content, 1 line}</p>
      onClick → onScrollToMessage(parent_message_id)
    [content — if not editing]
      <p class="text-sm leading-6 text-gray-700 whitespace-pre-wrap">{content}</p>
    [inline edit — if editingInline]
      <textarea> pre-filled, Save + Cancel buttons
    [attachments row]
    [reaction pills row]
  [⋯ button — desktop only, absolute top-0 right-0, visible on group hover]
    onClick → open MessageActionMenu
  [MessageActionMenu — desktop, conditional]
  [MessageDrawer — mobile, conditional]
```

**Avatar logic:**

```ts
function getInitials(name: string): string  // first letter of first + last word
function getAvatarColor(name: string): string  // hsl(hash(name) % 360, 65%, 55%)
function hashName(name: string): number  // simple charCode sum
```

**System message layout:** `flex justify-center` wrapper, `text-xs text-gray-400 italic text-center` — no avatar, no actions, no reactions.

**Reply quoted block:** Looks up parent in `allMessages` by `parent_message_id`. If parent not found (deleted), renders "(message deleted)" in muted italic.

**Flash highlight on scroll target:** ChatSection gives each message a `data-message-id` attribute. `onScrollToMessage` scrolls it into view + briefly applies a highlight class (`bg-yellow-50`) for 1.5s via `setTimeout`.

**Hover state (desktop):** `group` class on wrapper, `invisible group-hover:visible` on ⋯ button. Long press on mobile: `onPointerDown` + `onPointerUp` with a 500ms timer to distinguish tap vs. hold.

**Inline edit mode state:** Local `useState<boolean>` inside `ChatMessage` called `isEditing` + `editContent: string`. On Save, calls `onEdit(message.id, editContent)` then exits edit mode.

---

### `ChatSection.tsx`
**Path:** `apps/web/src/features/case-reports/components/ChatSection.tsx`

**Changes:**
1. **Reduced chat height:** Change `flex-1` message list from unbounded to `max-h-[320px]` (desktop) / `max-h-[240px]` (mobile via responsive class: `max-h-60 sm:max-h-80`). This gives case details more breathing room.
2. **Reply preview bar:** Already exists (the `replyTo` state + preview div). Improve styling: left-border accent (`border-l-4 border-primary-400`), show author name bolded, truncate at 80 chars.
3. **New props added to ChatSection:**
   ```ts
   currentUserId: string;
   canManage: boolean;
   ```
4. **Pass through to each `ChatMessage`:** `currentUserId`, `canManage`, `chatLocked`, `allMessages={messages}`, `onEdit`, `onDelete`, `onScrollToMessage`.
5. **`onScrollToMessage` implementation:** `messagesEndRef` becomes a container ref; scroll via `document.querySelector(`[data-message-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })`. Flash: add/remove CSS class.
6. **Wire `onEdit` / `onDelete`:** Accept as props from parent:
   ```ts
   onEdit: (messageId: string, newContent: string) => Promise<void>;
   onDelete: (messageId: string) => Promise<void>;
   ```

**Updated `ChatSectionProps`:**
```ts
interface ChatSectionProps {
  messages: CaseMessage[];
  disabled: boolean;
  currentUserId: string;
  canManage: boolean;
  users: MentionableUser[];
  roles: MentionableRole[];
  onSend: (input: { content: string; parentMessageId?: string | null; mentionedUserIds: string[]; mentionedRoleIds: string[]; files: File[] }) => Promise<void>;
  onReact: (messageId: string, emoji: string) => Promise<void>;
  onEdit: (messageId: string, newContent: string) => Promise<void>;
  onDelete: (messageId: string) => Promise<void>;
}
```

---

### `CaseReportDetailPanel.tsx`
**Path:** `apps/web/src/features/case-reports/components/CaseReportDetailPanel.tsx`

**Changes:**
1. Add `onEditMessage` and `onDeleteMessage` props:
   ```ts
   onEditMessage: (messageId: string, newContent: string) => Promise<void>;
   onDeleteMessage: (messageId: string) => Promise<void>;
   ```
2. Pass `currentUserId` (already available via auth context or as a new prop) down to `ChatSection`.
3. Pass `canManage` (already a prop) to `ChatSection`.
4. Wire new props through to `<ChatSection>`.
5. **Height adjustment:** The chat container (`div` with `min-h-0 border-t`) currently sits in a `grid-rows-[auto_1fr]` layout. Change to `grid-rows-[1fr_auto]` so case details (top) take remaining space and chat (bottom) is sized by its content-constrained max-height. This makes details dominant.

**New prop to add:**
```ts
currentUserId: string;
```

---

### `CaseReportsPage.tsx`
**Path:** `apps/web/src/features/case-reports/pages/CaseReportsPage.tsx`

**Changes:**
1. Import `editCaseMessage`, `deleteCaseMessage` from `caseReport.api`.
2. Import current user id from auth context (check existing pattern — likely `useAuth()` hook).
3. Add `onEditMessage` handler:
   ```ts
   onEditMessage={async (messageId, content) => {
     if (!selectedCaseId) return;
     await editCaseMessage(selectedCaseId, messageId, content);
     await fetchDetail(selectedCaseId);
   }}
   ```
4. Add `onDeleteMessage` handler:
   ```ts
   onDeleteMessage={async (messageId) => {
     if (!selectedCaseId) return;
     await deleteCaseMessage(selectedCaseId, messageId);
     await fetchDetail(selectedCaseId);
   }}
   ```
5. Add socket listeners for new events:
   ```ts
   socket.on('case-report:message:edited', refreshDetail);
   socket.on('case-report:message:deleted', refreshDetail);
   ```
6. Pass `currentUserId` to `CaseReportDetailPanel`.

---

## 5. State Management Summary

| State | Lives in | Notes |
|---|---|---|
| `replyTo: CaseMessage \| null` | `ChatSection` | Existing, keep |
| `mentionOpen, mentionQuery` | `ChatSection` | Existing, keep |
| `isEditing: boolean` | `ChatMessage` (local) | New local state per message instance |
| `editContent: string` | `ChatMessage` (local) | New local state for inline edit textarea |
| `drawerOpen: boolean` | `ChatMessage` (local) | New — mobile drawer |
| `menuOpen: boolean` | `ChatMessage` (local) | New — desktop ⋯ dropdown |
| `emojiPickerOpen: boolean` | `ChatMessage` (local) | New — controls EmojiPicker visibility |
| Long-press timer ref | `ChatMessage` (local) | `useRef<ReturnType<typeof setTimeout>>` |

---

## 6. Implementation Order for Codex

### Step 1 — Shared type update
- `packages/shared/src/types/caseReport.types.ts`: add `is_edited: boolean` to `CaseMessage`
- `packages/shared/src/types/socket.types.ts`: add `case-report:message:edited` and `case-report:message:deleted` events

### Step 2 — Backend: edit & delete endpoints
- `apps/api/src/services/caseReport.service.ts`: add `editMessage()` and `deleteMessage()`
- `apps/api/src/controllers/caseReport.controller.ts`: add `editMessage` and `deleteMessage` controller methods
- `apps/api/src/routes/caseReport.routes.ts`: add `PATCH /:id/messages/:messageId` and `DELETE /:id/messages/:messageId`
- Backend must emit `case-report:message:edited` / `case-report:message:deleted` socket events

### Step 3 — Frontend API service
- `apps/web/src/features/case-reports/services/caseReport.api.ts`: add `editCaseMessage()` and `deleteCaseMessage()`

### Step 4 — New UI components (independent, can be done in any order)
- Create `EmojiPicker.tsx`
- Create `MessageActionMenu.tsx`
- Create `MessageDrawer.tsx`

### Step 5 — Rewrite `ChatMessage.tsx`
- New avatar + name/timestamp layout
- Quoted reply block (clicking scrolls + flashes)
- System message branch
- Inline edit mode
- Hover ⋯ button → `MessageActionMenu` (desktop)
- Long-press → `MessageDrawer` (mobile)
- Smiley icon → `EmojiPicker` (desktop, shown on hover)

### Step 6 — Update `ChatSection.tsx`
- Add `currentUserId`, `canManage`, `onEdit`, `onDelete` props
- Reduce message list max-height
- Improve reply preview bar styling
- Pass all new props to each `ChatMessage`
- Implement `onScrollToMessage`

### Step 7 — Update `CaseReportDetailPanel.tsx`
- Add `currentUserId`, `onEditMessage`, `onDeleteMessage` props
- Change grid layout to `grid-rows-[1fr_auto]`
- Wire new props to `ChatSection`

### Step 8 — Update `CaseReportsPage.tsx`
- Wire edit/delete handlers
- Add socket listeners for new events
- Pass `currentUserId` (from auth context) to panel

---

## 7. Verification

1. **Avatar:** User with photo shows photo; user without shows colored initials circle — color is deterministic (same name = same color across page reloads).
2. **Reply:** Click Reply on a message → reply bar appears above input with author name + truncated text. Send → new message has `parent_message_id` set. New message renders quoted block. Click quoted block → scrolls to parent, parent briefly flashes yellow.
3. **Emoji picker (desktop):** Hover message → ⋯ appears. Click "Add Reaction" in dropdown → 7-emoji picker appears. Click an emoji → reaction pill appears below message. Click same emoji again → reaction removed.
4. **Emoji picker (mobile):** Long-press message (500ms) → bottom drawer slides up. Tap emoji → same toggle behavior. Tap outside or select action → drawer closes. Background scroll locked while open.
5. **Edit message:** ⋯ → Edit (own messages only, open case) → textarea replaces text inline. Save → PATCH request sent, message content updates in place, "(edited)" label appears.
6. **Delete message:** ⋯ → Delete → browser `confirm()` prompt → DELETE request → message removed from list.
7. **System messages:** Appear centered, muted, no avatar, no menu, no emoji.
8. **Chat height:** Case detail panel's description/corrective action/resolution/attachments sections are visible without scrolling on a standard 1080p display — chat section is compact below.
9. **Socket:** Edit/delete by another user in the same company reflects in real time without full page reload.
