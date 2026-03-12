# Skill: Verification Workflows

## Four Verification Types
All managed under `/employee-verifications`. A temporary compat alias `/registration-requests` exists for registration only — do not extend it.

| Type | Approval Permission | Tenant Table |
|---|---|---|
| Registration | `registration.approve` | master `registration_requests` |
| Personal Information | `personal_information.approve` | `personal_information_verifications` |
| Employment Requirements | `employee_requirements.approve` | `employment_requirement_submissions` |
| Bank Information | `bank_information.approve` | `bank_information_verifications` |

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
- Registration request is stored globally in master `registration_requests` — no company selector at submission time.
- Approval triggers full Odoo provisioning (see `odoo-provisioning.md`).
- Approval streams progress events via `employee-verification:approval-progress` socket event to the management UI.
- Password is stored encrypted at request time; decrypted only during approval (`utils/secureText.ts`).

## Personal Information Verification
- Employee submits profile changes → creates `personal_information_verifications` record (pending).
- HR approves → Odoo sync runs for: name, email, mobile, legal name, birthday, gender, address, emergency contact.
- Fields NOT synced to Odoo (tenant DB only): SSS, TIN, Pag-IBIG, PhilHealth, marital status, emergency relationship.
- Name updates must preserve `<branch-code> - <First Last>` format.

## Employment Requirements
- Fixed requirement catalog seeded in tenant DB at provisioning time.
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
1. Write `employee_notifications` record in tenant DB.
2. Emit realtime socket event to `company:{companyId}` room.
3. Send web push if user is offline (no active socket in `/notifications` room).

## UI Pattern for Verification Pages
- Card list (left) + right-side detail panel (right) — not centered modals.
- Status tabs order: All → Pending → Approved → Rejected (default: Pending).
- Type tabs: Registration, Personal Information, Employment Requirements, Bank Information.
- Registration approval panel streams backend progress log via `employee-verification:approval-progress` event.

## Store Audits (Internal Audit)

Two audit types, both managed under `/store-audits`:

| Type | Trigger | Tenant Table |
|---|---|---|
| Customer Service Audit (CSS) | Odoo POS order webhook (10% sampling) | `store_audits` (type = `customer_service`) |
| Compliance Audit | Hourly cron — random active `hr.attendance` record | `store_audits` (type = `compliance`) |

### Status Flow
`pending` → `processing` → `completed`

- **pending**: audit created, not yet claimed.
- **processing**: claimed by an auditor via `POST /store-audits/:id/process`. Auditor is bound; only they can complete it.
- **completed**: auditor submitted results.

### Global Constraint: One Active Audit Per Auditor
A user may only hold one `processing` audit at a time across both types. Enforced by partial unique index `store_audits_one_active_per_auditor ON store_audits(auditor_user_id) WHERE status = 'processing'`.

Concurrent claim attempts: the second request hits the unique constraint → API catches and returns 409. Also returns 409 if the audit was already claimed by someone else (0 rows affected on the optimistic update).

### Completion
- **CSS**: auditor submits star rating (1–5) + audit log text. API calls OpenAI `gpt-4o-mini` to generate an AI report. Star rating is written back to master `users.css_audits` (JSONB array) keyed by `css_cashier_user_key`.
- **Compliance**: auditor answers five Yes/No questions (non_idle, cellphone, uniform, hygiene, sop). Latest result written to master `users.compliance_audit` (JSONB object).

### UI Pattern
Mirrors Employee Verifications: category tabs (All / Customer Service / Compliance) + status tabs (Pending / Processing / Completed, default Pending) + card list (left) + right-side detail panel. Uses `/store-audits` Socket.IO namespace for real-time updates (`store-audit:new`, `store-audit:claimed`, `store-audit:completed`).
