# AIC Variance — Design Spec

**Date:** 2026-04-29  
**Status:** Approved

## Overview

A new system for tracking Actual Inventory Count (AIC) discrepancies received from Odoo. Records are entirely system-generated (no manual creation). The UI mirrors the Case Reports system: card grid + animated side detail panel with Details / Discussion / Tasks tabs.

---

## Context

Odoo sends one webhook payload per `stock.move.line` when an inventory count is completed. Products with threshold violations or missing threshold configuration need to be surfaced to managers. The Discord bot (`inventoryValuation.js`) currently handles this; Omnilert replaces/augments it with a persistent, discussion-enabled record system.

---

## Database Schema

### New tables

#### `aic_records`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `company_id` | UUID FK companies NOT NULL | |
| `aic_number` | INT NOT NULL | company-scoped auto-increment |
| `reference` | TEXT NOT NULL | e.g. `WH003/IN/00001` |
| `branch_id` | UUID FK branches NULL | resolved from odoo company_id |
| `aic_date` | DATE NOT NULL | from first payload's `create_date` |
| `status` | TEXT NOT NULL DEFAULT 'open' | `'open'` \| `'resolved'` |
| `summary` | TEXT NULL | AI-generated on resolution |
| `resolution` | TEXT NULL | AI-generated on resolution |
| `vn_requested` | BOOL NOT NULL DEFAULT false | |
| `linked_vn_id` | UUID NULL FK violation_notices | |
| `resolved_by` | UUID NULL FK employees | |
| `resolved_at` | TIMESTAMPTZ NULL | |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

`reference` is descriptive text from Odoo, not the identity of an AIC variance. Multiple AIC records may share the same reference.

#### `aic_products`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `aic_record_id` | UUID FK aic_records NOT NULL | |
| `odoo_product_tmpl_id` | INT NOT NULL | |
| `product_name` | TEXT NOT NULL | |
| `quantity` | DECIMAL NOT NULL | |
| `uom_name` | TEXT NOT NULL | |
| `flag_type` | TEXT NOT NULL | `'threshold_violation'` \| `'invalid_threshold'` |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

#### `aic_participants`
Identical structure to `case_participants`. Columns: `id, aic_record_id, user_id, is_joined, is_muted, last_read_at, created_at, updated_at`.

#### `aic_messages`, `aic_message_reactions`, `aic_message_attachments`, `aic_message_mentions`
Identical structure to their `case_*` equivalents, with `aic_record_id` replacing `case_id`.

#### `aic_tasks`, `aic_task_assignees`, `aic_task_messages`, `aic_task_message_reactions`, `aic_task_message_mentions`
Identical structure to their `case_task_*` equivalents, with `aic_record_id` replacing `case_id`.

### Modified tables

#### `violation_notices`
Add column: `source_aic_record_id UUID NULL REFERENCES aic_records(id) ON DELETE SET NULL`

### Migrations

Two migrations:
1. `052_aic_variance.ts` — creates all new tables
2. `053_violation_notices_aic_source.ts` — adds `source_aic_record_id` to `violation_notices`

---

## Webhook Handler

### Route
`POST /api/v1/webhook/odoo/aic-variance` — unauthenticated, registered in `webhook.routes.ts`.

### Payload shape (Odoo `stock.move.line`)
```json
{
  "company_id": 4,
  "create_date": "2024-09-07 09:07:59.927241",
  "id": 14158,
  "quantity": 75.0,
  "reference": "WH003/IN/00001",
  "x_aic_threshold": false,
  "x_company_name": "FBW Robinsons Starmills CSFP",
  "x_product_name": "SPK1 - Famous Mix",
  "x_product_tmpl_id": 622,
  "x_uom_name": "kg"
}
```

### Classification logic (ported from Discord bot `inventoryValuation.js`)

- `x_aic_threshold === false` → **INVALID_THRESHOLD** (flag it)
- `x_aic_threshold` is a numeric string:
  - Symmetric (`+N` or plain `N`): VIOLATION if `|quantity| > threshold`
  - Negative mode (`-N`): VIOLATION if `quantity < -threshold || quantity > 0`
  - Positive mode: VIOLATION if `quantity < 0 || quantity > threshold`
  - Otherwise → **NORMAL** (skip)
- NORMAL products are dropped silently; no AIC record is created if all products in a reference are NORMAL.

### In-memory debounce (module-level in `aicVarianceWebhook.service.ts`)

```
batchMap: Map<reference, ProductLine[]>
timerMap: Map<reference, NodeJS.Timeout>

onPayload(payload):
  classify → if NORMAL: return
  add to batchMap[reference]
  clearTimeout(timerMap[reference])
  timerMap[reference] = setTimeout(() => processBatch(reference), 5000)

processBatch(reference):
  products = batchMap[reference]; delete batchMap[reference]; delete timerMap[reference]
  company = resolveCompanyByOdooBranchId(products[0].company_id)
  branch = found via same lookup
  create a new AIC record; reference is not used for duplicate suppression
  insert aic_records + aic_products in one transaction
  auto-join all users with aic_variance.manage in company as participants
  notify each of those users (see Notifications)
  emit socket event aic-variance:created
```

---

## Backend API

**Routes file:** `apps/api/src/routes/aicVariance.routes.ts`  
All routes (except webhook) require `authenticate + resolveCompany`.

```
GET    /aic-variance                             aic_variance.view  list (joined-only filter)
GET    /aic-variance/mentionables                aic_variance.view
GET    /aic-variance/:id                         aic_variance.view  (marks read)
POST   /aic-variance/:id/resolve                 aic_variance.manage
POST   /aic-variance/:id/request-vn              aic_variance.manage
POST   /aic-variance/:id/leave                   aic_variance.view
POST   /aic-variance/:id/mute                    aic_variance.view
POST   /aic-variance/:id/read                    aic_variance.view

GET    /aic-variance/:id/messages                aic_variance.view
POST   /aic-variance/:id/messages                aic_variance.view
PATCH  /aic-variance/:id/messages/:msgId         aic_variance.view
DELETE /aic-variance/:id/messages/:msgId         aic_variance.view
POST   /aic-variance/:id/messages/:msgId/reactions  aic_variance.view

GET    /aic-variance/:id/tasks                   aic_variance.view
POST   /aic-variance/:id/tasks                   aic_variance.manage
GET    /aic-variance/:id/tasks/:taskId           aic_variance.view
GET    /aic-variance/:id/tasks/:taskId/messages  aic_variance.view
POST   /aic-variance/:id/tasks/:taskId/messages  aic_variance.view
POST   /aic-variance/:id/tasks/:taskId/complete  aic_variance.view
POST   /aic-variance/:id/tasks/:taskId/messages/:msgId/reactions  aic_variance.view
```

**Services:**
- `apps/api/src/services/aicVariance.service.ts` — CRUD, participant management, AI summary
- `apps/api/src/services/aicVarianceTask.service.ts` — task logic
- `apps/api/src/services/aicVarianceWebhook.service.ts` — debounce + batch processing
- `apps/api/src/controllers/aicVariance.controller.ts`
- `apps/api/src/controllers/aicVarianceTask.controller.ts`

**Visibility filter (list endpoint):**
```sql
WHERE company_id = :companyId
AND EXISTS (
  SELECT 1 FROM aic_participants p
  WHERE p.aic_record_id = aic_records.id
  AND p.user_id = :userId
  AND p.is_joined = true
)
```
(Administrators bypass this filter.)

**Resolve endpoint (`POST /aic-variance/:id/resolve`):**
1. Fetch all discussion messages for the record
2. Call OpenAI GPT-4.1 (same pattern as `generateCaseSummaryWithAI`) to generate Summary + Resolution
3. Update `aic_records`: `status = 'resolved'`, `summary`, `resolution`, `resolved_by`, `resolved_at`
4. Emit `aic-variance:updated`

**Request VN endpoint (`POST /aic-variance/:id/request-vn`):**
- Body: `{ description: string, targetUserIds: string[] }`
- Calls `createViolationNotice()` with `category: 'aic_variance'` (new valid category value alongside `'manual'`, `'case_reports'`, `'store_audits'`), `sourceAicRecordId: id`
- Sets `vn_requested = true`, `linked_vn_id` on the AIC record

---

## Frontend

**Feature folder:** `apps/web/src/features/aic-variance/`

```
pages/
  AicVariancePage.tsx
components/
  AicVarianceCard.tsx
  AicVarianceDetailPanel.tsx
  AicProductsSection.tsx
  AicVarianceFilterPanel.tsx
services/
  aicVariance.api.ts
```

**Shared components** imported from `features/case-reports/components/`:  
`ChatSection`, `ChatMessage`, `TaskList`, `TaskDetailPanel`, `TaskCreationModal`, `MentionPicker`, `MessageActionMenu`, `EmojiPicker`, `ImagePreviewModal`, `MessageDrawer`, `MessageReactionBadge`, `MessageReactionsOverlay`, `TextInputModal`.

### Card

```
AIC 0042
WH003/IN/00001
5 products flagged
Robinsons Starmills                    [Open]
──────────────────────────────────────────────
📅 2d ago   💬 3 messages   [+1 unread]
```

### Detail panel

**Header:**
```
Inventory Variance | Wed, Apr 29 2026
AIC 0042                               [Open]
```
Tabs: `[Details]  [Discussion]  [Tasks]`

**Details tab:**

*Info section*
- Company
- Branch
- AIC Date
- Resolved By *(shown only after resolved)*
- Resolved Date *(shown only after resolved)*

*Description section*
- Reference (e.g. `WH003/IN/00001`)

*Products section* (`AicProductsSection.tsx`)
- Table: Product Name | Quantity | UOM | Flag
- Flag badge: `⚠ Threshold Violation` (amber) or `⚙ No Threshold` (gray)

*Summary section* (shown only after resolved, gray background)
- **Summary:** AI-generated 2–3 sentence summary
- **Resolution:** AI-generated 2–3 sentence resolution

*Action buttons (bottom)*
- `Mark as Resolved` — shown if `aic_variance.manage` and `status = 'open'`
- `Request VN` — shown if `aic_variance.manage`

**Discussion tab:** Reuses `ChatSection`. Locked when `status = 'resolved'` (unless `aic_variance.manage`).  
**Tasks tab:** Reuses `TaskList + TaskDetailPanel`.

### Page layout (mirrors `CaseReportsPage.tsx`)
- Status tabs: All / Open / Resolved
- Filter panel: search by AIC number or reference, date range, sort
- No "New AIC" button (system-generated only)
- URL param `?aicId=` for deep-linking

---

## Permissions

**File:** `packages/shared/src/constants/permissions.ts`

```typescript
AIC_VARIANCE_VIEW: 'aic_variance.view',
AIC_VARIANCE_MANAGE: 'aic_variance.manage',
```

**Category:** `"AIC Variance"`  
**Prerequisite:** `aic_variance.manage` → `aic_variance.view`  
**Descriptions:**
- `aic_variance.view`: "Access the AIC Variance page and view records you have joined"
- `aic_variance.manage`: "Mark AIC records as resolved, request violation notices, and manage tasks"

---

## Notifications

All use `createAndDispatchNotification()` from `notification.service.ts`.

| Trigger | Title | Message | Type |
|---|---|---|---|
| AIC record created | `"AIC Variance Detected"` | `"[Reference] — N products flagged at [Branch]"` | `warning` |
| Mentioned in discussion | `"AIC Variance Mention"` | `"[Name] mentioned you in an AIC variance discussion."` | `info` |
| Reply to your message | `"AIC Variance Reply"` | `"[Name] replied to your message."` | `info` |
| Task assigned | `"AIC Variance Task"` | `"You've been assigned a task in AIC [number]."` | `info` |

**Creation notification** goes only to users with `aic_variance.manage` (same users auto-joined as participants).

**Link format:** `/aic-variance?aicId={id}` (with `&messageId={id}` for mention/reply links).

---

## Socket Events

Emitted to the company's Socket.IO namespace:
- `aic-variance:created`
- `aic-variance:updated` (on resolve, on VN request)
- `aic-variance:message`
- `aic-variance:reaction`
- `aic-variance:task:created`
- `aic-variance:task:updated`

---

## Shared Types

**New file:** `packages/shared/src/types/aicVariance.types.ts`

```typescript
export type AicStatus = 'open' | 'resolved';
export type AicFlagType = 'threshold_violation' | 'invalid_threshold';

export interface AicRecord {
  id: string;
  aic_number: number;
  reference: string;
  company_id: string;
  company_name?: string;
  branch_id: string | null;
  branch_name?: string | null;
  aic_date: string;
  status: AicStatus;
  summary: string | null;
  resolution: string | null;
  vn_requested: boolean;
  linked_vn_id: string | null;
  resolved_by: string | null;
  resolved_by_name?: string | null;
  resolved_at: string | null;
  product_count: number;        // flagged product count
  message_count: number;
  unread_count: number;
  unread_reply_count: number;
  is_joined: boolean;
  is_muted: boolean;
  created_at: string;
  updated_at: string;
}

export interface AicProduct {
  id: string;
  aic_record_id: string;
  odoo_product_tmpl_id: number;
  product_name: string;
  quantity: number;
  uom_name: string;
  flag_type: AicFlagType;
}
```

---

## Verification

1. **Webhook:** POST a test payload to `/api/v1/webhook/odoo/aic-variance` with a threshold violation product. Wait 6 seconds. Confirm AIC record created in DB, manage-users auto-joined, notification sent.
2. **Batching:** POST 3 payloads for the same reference within 3 seconds. Confirm one AIC record with 3 products.
3. **Normal skip:** POST a payload with a NORMAL product (within threshold). Confirm no AIC record created.
4. **List page:** Visit `/aic-variance`. Confirm joined records appear, non-joined do not.
5. **Detail panel:** Open an AIC record. Verify Info, Description, Products, action buttons render correctly.
6. **Resolve:** Click "Mark as Resolved". Confirm status changes, AI summary populates, Resolved By / Resolved Date appear.
7. **Request VN:** Click "Request VN", select targets. Confirm VN created with `source_aic_record_id` linked.
8. **Notifications:** Confirm manage-users receive "AIC Variance Detected" notification on creation.
9. **Permissions:** Assign only `aic_variance.view` to a user — confirm they see no records until joined; assign `aic_variance.manage` — confirm auto-join on next AIC creation.
