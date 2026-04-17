---
name: verification-workflows
description: Verification and audit workflows for Omnilert — registration approval, personal info / bank / employment requirement verifications, notification pattern, store audits (CSS + compliance), violation notices. Read this before touching any verification, approval, audit, or violation notice flow on either backend or frontend.
type: reference
---

# Skill: Verification Workflows

## Four Verification Types

All managed under `/employee-verifications`. A temporary compat alias `/registration-requests` exists for registration only — do not extend it.

| Type | Approval Permission | Table |
|---|---|---|
| Registration | `employee_verification.manage_registration` | `registration_requests` |
| Personal Information | `employee_verification.manage_personal` | `personal_information_verifications` |
| Employment Requirements | `employee_verification.manage_requirements` | `employment_requirement_submissions` |
| Bank Information | `employee_verification.manage_bank` | `bank_information_verifications` |

`registration_requests` is global (no `company_id`). All other verification tables are company-scoped.

## Registration Approval

Endpoint: `POST /employee-verifications/registration/:id/approve`

Required payload:

```ts
{
  roleIds: string[]                                                         // at least one
  companyAssignments: { companyId: string; branchIds: string[] }[]         // ≥1 branch per company
  residentBranch: { companyId: string; branchId: string }                  // must be in selected branches
}
```

- Registration request stored globally — no company selector at submission time.
- Approval triggers full Odoo provisioning (see `odoo-provisioning` skill).
- Approval streams progress events via `employee-verification:approval-progress` socket event to the management UI.
- Password stored encrypted at request time; decrypted only during approval (`utils/secureText.ts`).

## Personal Information Verification

- Employee submits profile changes → creates `personal_information_verifications` record (pending).
- HR approves → Odoo sync runs for: name, email, mobile, legal name, birthday, gender, address, emergency contact.
- Fields **NOT synced to Odoo** (DB only): SSS, TIN, Pag-IBIG, PhilHealth, marital status, emergency relationship.
- Name updates must preserve `<branch-code> - <First Last>` format.

## Employment Requirements

- Fixed requirement catalog in global `employment_requirement_types` table (seeded once, shared by all companies).
- Employee submits document → `employment_requirement_submissions` record.
- Display status mapping for UI:
  - `approved` → show "Complete"
  - `pending` → show "Verification"
  - missing submission → show "Incomplete" (displayed as pending)
  - `rejected` → show "Rejected"

## Bank Information Verification

- Employee submits bank details → `bank_information_verifications` record.
- On user create via User Management, an approved record is seeded automatically (best-effort) so employee sees verified state on first login.

## Notifications on Verification Events

All verification approve/reject paths must:

1. Write `employee_notifications` record (global table, queried by `user_id`).
2. Emit realtime socket event to `company:{companyId}` room.
3. Send web push if user is offline (no active socket in `/notifications` room `user:{userId}`).

## UI Pattern for EmployeeVerificationsPage

- **Layout**: Responsive grid of compact cards + slide-over detail panel (backdrop + panel via `createPortal` to `document.body`). No centered modal for record detail.
- **Type tabs** (underline strip): Registration, Personal Information, Employment Requirements, Bank Information — pending count badges when count > 0; switching type resets status filter to Pending.
- **Status sub-tabs**: All → Pending → Approved → Rejected (default Pending); icons + labels; pagination resets when status changes.
- **Cards**: `Badge` for status; summary lines + date footer; empty state row with type icon.
- **Loading**: Skeleton matching header + tabs + grid (not a lone spinner).
- **Panel body**: icon + `<dl>` sections for metadata; rejection callouts with `AlertCircle` and bordered red panel; bank detail includes copy-to-clipboard.
- **Approve/reject confirm**: `AnimatedModal` + `AnimatePresence`, `zIndexClass="z-[60]"` above the panel; backdrop dismiss disabled while saving.
- Registration approval panel streams backend progress log via `employee-verification:approval-progress` socket event.

---

## Store Audits

Two audit types, both stored in `store_audits` table with `company_id` scoping.

| Type | Trigger | Discriminator |
|---|---|---|
| Customer Service (CSS) | Odoo POS order webhook (10% sampling) | `type = 'customer_service'` |
| Compliance | Hourly cron — random active `hr.attendance` | `type = 'compliance'` |

### Status Flow

`pending` → `processing` → `completed`

- `pending`: audit created, not yet claimed.
- `processing`: claimed by auditor via `POST /store-audits/:id/process`. Only that auditor can complete it.
- `completed`: auditor submitted results.

### Global Constraint: One Active Audit Per Auditor

Partial unique index enforces one `processing` audit per user per company:

```sql
CREATE UNIQUE INDEX store_audits_one_active_per_auditor
  ON store_audits(company_id, auditor_user_id) WHERE status = 'processing';
```

Concurrent claim: second request hits the constraint → API catches → 409. Also 409 if already claimed (0 rows affected on optimistic update).

### Completion

- **CSS**: auditor submits star rating (1–5) + audit log text → API calls OpenAI `gpt-4o-mini` for AI report.
- **Compliance**: auditor answers Yes/No (non_idle, cellphone, uniform, hygiene, sop).

### Soft-delete for Audit Messages

`store_audit_messages.is_deleted = true`. S3 attachment cleanup is best-effort after transaction commits.

### UI Pattern for StoreAuditsPage

Category tabs (All / Customer Service / Compliance) + status tabs (Pending / Processing / Completed, default Pending) + card list (left) + right-side detail panel. Uses `/store-audits` Socket.IO namespace for real-time updates.

---

## Violation Notices

Formal disciplinary notices. Auto-numbered per company via `company_sequences` (`vn_number`).

### Status Flow

`queued` → `discussion` → `issuance` → `disciplinary_meeting` → `completed` / `rejected`

- `queued`: created, awaiting initial review.
- `discussion`: HR is reviewing the case with involved parties.
- `issuance`: notice formally issued to targets.
- `disciplinary_meeting`: meeting scheduled/in-progress.
- `completed` / `rejected`: final outcome.

### Thread Pattern

Violation notices share the same message thread pattern as case reports:
- `violation_notice_messages` — soft-deleteable, threaded via `parent_message_id`
- `violation_notice_attachments` — linked to VN and optionally to a specific message
- `violation_notice_reactions` — emoji reactions
- `violation_notice_participants` — membership, `is_muted`, `last_read_at`
- `violation_notice_mentions` — @user or @role
- `violation_notice_reads` — read receipts (unique per VN + user)

Uses room `company:{companyId}` in `/violation-notices` socket namespace.
