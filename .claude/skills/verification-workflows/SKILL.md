# Skill: Verification Workflows

## Four Verification Types

All managed under `/employee-verifications`. A temporary compat alias `/registration-requests` exists for registration only — do not extend it.

| Type | Approval Permission | Table |
| --- | --- | --- |
| Registration | `registration.approve` | `registration_requests` |
| Personal Information | `personal_information.approve` | `personal_information_verifications` |
| Employment Requirements | `employee_requirements.approve` | `employment_requirement_submissions` |
| Bank Information | `bank_information.approve` | `bank_information_verifications` |

All tables above have `company_id` for company scoping (except `registration_requests`, which is global).

## Registration Approval

Endpoint: `POST /employee-verifications/registration/:id/approve`

Required payload:

```ts
{
  roleIds: string[]                                      // required, at least one
  companyAssignments: { companyId: string; branchIds: string[] }[]  // required, ≥1 branch per company
  residentBranch: { companyId: string; branchId: string }           // required, must be in selected branches
}
```

- Registration request stored globally in `registration_requests` — no company selector at submission time.
- Approval triggers full Odoo provisioning (see `odoo-provisioning.md`).
- Approval streams progress events via `employee-verification:approval-progress` socket event to the management UI.
- Password is stored encrypted at request time; decrypted only during approval (`utils/secureText.ts`).

## Personal Information Verification

- Employee submits profile changes → creates `personal_information_verifications` record (pending).
- HR approves → Odoo sync runs for: name, email, mobile, legal name, birthday, gender, address, emergency contact.
- Fields NOT synced to Odoo (DB only): SSS, TIN, Pag-IBIG, PhilHealth, marital status, emergency relationship.
- Name updates must preserve `<branch-code> - <First Last>` format.

## Employment Requirements

- Fixed requirement catalog in global `employment_requirement_types` table (seeded once, shared by all companies).
- Employee submits document → `employment_requirement_submissions` record.
- Display status mapping:
  - `approved` → `complete`
  - `pending` → `verification`
  - missing submission → `pending` (displayed as "Incomplete" in UI)
  - `rejected` → `rejected`

## Bank Information Verification

- Employee submits bank details → `bank_information_verifications` record.
- On user create via User Management, an approved record is seeded automatically (best-effort) so employee sees verified state on first login.

## Notifications on Verification Events

All verification approve/reject paths:

1. Write `employee_notifications` record (global table, queried by `user_id`).
2. Emit realtime socket event to `company:{companyId}` room.
3. Send web push if user is offline (no active socket in `/notifications` room).

## UI Pattern for Verification Pages (`EmployeeVerificationsPage`)

- **Layout**: Responsive **grid of compact cards** (not only a single-column list) + **slide-over detail panel** (backdrop + panel **`createPortal`** to `document.body`). No centered modal for record detail.
- **Type tabs** (underline strip): Registration, Personal Information, Employment Requirements, Bank Information — **pending count badges** per type when count > 0; switching type **resets status filter to Pending**.
- **Status sub-tabs** (second underline row): All → Pending → Approved → Rejected (default **Pending**); icons + labels; pagination resets when status changes.
- **Cards**: **`Badge`** for status; summary lines + date footer; **empty state** row with type icon when filtered list is empty.
- **Loading**: **Skeleton** matching header + tabs + grid (not a lone spinner).
- **Panel body**: icon + **`dl`** sections for metadata; rejection callouts with **`AlertCircle`** and bordered red panel; bank detail includes copy-to-clipboard for account number where applicable.
- **Approve / reject confirm**: **`AnimatedModal`** + **`AnimatePresence`**, **`zIndexClass="z-[60]"`** above the panel; backdrop dismiss disabled while saving.
- Registration approval panel streams backend progress log via **`employee-verification:approval-progress`** socket event.

## Store Audits (Internal Audit)

Two audit types, both stored in `store_audits` table with `company_id` scoping:

| Type | Trigger | Discriminator |
| --- | --- | --- |
| Customer Service Audit (CSS) | Odoo POS order webhook (10% sampling) | `type = 'customer_service'` |
| Compliance Audit | Hourly cron — random active `hr.attendance` record | `type = 'compliance'` |

### Status Flow

`pending` → `processing` → `completed`

- **pending**: audit created, not yet claimed.
- **processing**: claimed by an auditor via `POST /store-audits/:id/process`. Auditor is bound; only they can complete it.
- **completed**: auditor submitted results.

### Global Constraint: One Active Audit Per Auditor

A user may only hold one `processing` audit at a time across both types. Enforced by partial unique index:

```sql
CREATE UNIQUE INDEX store_audits_one_active_per_auditor
  ON store_audits(company_id, auditor_user_id) WHERE status = 'processing';
```

Concurrent claim attempts: the second request hits the unique constraint → API catches and returns 409. Also returns 409 if the audit was already claimed by someone else (0 rows affected on the optimistic update).

### Completion

- **CSS**: auditor submits star rating (1–5) + audit log text. API calls OpenAI `gpt-4o-mini` to generate an AI report.
- **Compliance**: auditor answers Yes/No questions (non_idle, cellphone, uniform, hygiene, sop).

### Soft-delete Pattern for Audit Messages

`store_audit_messages` uses `is_deleted = true` soft-delete. Attachments deleted from S3 best-effort after transaction commits.

### UI Pattern

Category tabs (All / Customer Service / Compliance) + status tabs (Pending / Processing / Completed, default Pending) + card list (left) + right-side detail panel. Uses `/store-audits` Socket.IO namespace for real-time updates.
