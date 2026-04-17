---
name: database-schema
description: Complete reference for the Omnilert database schema — table inventory, company scoping rules, FK/cascade patterns, naming conventions, partial index patterns, and cross-cutting column conventions. Read this before writing any query, migration, or service that touches the DB.
type: reference
---

# Skill: Database Schema

> For how to write and run migrations, see the **Migrations** skill. This skill covers *what* the schema contains and *why* it is structured the way it is.

---

## Table Inventory

Tables grouped by domain. All live in a single PostgreSQL database; company scoping is via `company_id` columns or parent FK inheritance (see next section).

### Platform / Meta

| Table | Purpose |
|---|---|
| `companies` | One row per tenant company; `is_root = true` marks the Omnilert root company (exactly one, enforced by partial unique index) |
| `super_admins` | Platform-level admin accounts — not company-scoped |
| `company_sequences` | Atomic per-company counters for `case_number` and `vn_number`; used with `FOR UPDATE` to avoid races |
| `scheduled_job_runs` | Deduplication log for background cron jobs; unique on `(job_name, scheduled_for_key)` |

### Auth & Identity

| Table | Purpose |
|---|---|
| `users` | All employees across all companies; no `company_id` — scoped via access join tables |
| `user_sensitive_info` | 1:1 with users; stores PII (birthday, SSS, TIN, PhilHealth, Pag-IBIG, bank, emergency contact, PIN) |
| `refresh_tokens` | JWT refresh tokens; `company_id` nullable (tracks session context) |
| `registration_requests` | Pending new-user registration approvals; pre-encrypted password stored until approved |
| `registration_request_company_assignments` | Companies assigned to a pending registration |
| `registration_request_assignment_branches` | Branches per company assignment for a registration |

### RBAC

| Table | Purpose |
|---|---|
| `permissions` | Permission key registry; keys follow `category.action` pattern (e.g. `shift.view_all`) |
| `roles` | Named roles with `priority` (higher = more privileged) and `is_system` flag |
| `role_permissions` | M:M — which permissions a role grants |
| `user_roles` | M:M — which roles a user holds |

### Company / Branch Access

| Table | Purpose |
|---|---|
| `user_company_access` | Which companies a user belongs to; holds `position_title`, `date_started`, `is_active` |
| `user_branches` | Which branches a user is assigned to; `is_primary` marks home branch |
| `user_company_branches` | Branch assignment scoped per company; `assignment_type` is `resident` or `borrow` |
| `departments` | Org hierarchy; **not company-scoped** (global); `head_user_id` has a circular FK (see Gotchas) |
| `branches` | Physical store locations; `company_id` scoped; `is_main_branch` flag; `odoo_branch_id` for Odoo sync |

### POS

| Table | Purpose |
|---|---|
| `pos_sessions` | Odoo POS session mirror; `company_id` scoped; status: `open → closed → audit_complete` |
| `pos_verifications` | Individual transaction verification requests; status: `pending → awaiting_customer → confirmed/rejected` |
| `pos_verification_images` | Files attached to a verification; no direct `company_id` — inherits via `pos_verification_id` |

### Shifts & Scheduling

| Table | Purpose |
|---|---|
| `employee_shifts` | Odoo shift records synced via webhook; `company_id` scoped; unique on `(odoo_shift_id, branch_id)` |
| `schedules` | Planned schedule entries per user/branch/date; `company_id` scoped |
| `shift_logs` | Immutable event log per shift; types: `shift_updated`, `check_in`, `check_out`, `shift_ended`, `authorization_resolved`, `peer_evaluation_available`, `peer_evaluation_submitted`, `peer_evaluation_expired` |
| `shift_authorizations` | Time deviation events requiring approval; types: `early_check_in`, `tardiness`, `early_check_out`, `late_check_out`, `overtime` |
| `shift_exchange_requests` | Cross-user shift swap requests; has **both** `requester_company_id` and `accepting_company_id` to support cross-company swaps; two partial unique indexes prevent double-booking |
| `peer_evaluations` | End-of-shift peer review (3 questions scored 1–5); expires at a deadline; unique per `(evaluator, evaluated, shift)` |

### Requests / Approvals

| Table | Purpose |
|---|---|
| `authorization_requests` | General auth requests (management or service_crew level); `company_id` scoped |
| `cash_requests` | Cash disbursement requests with bank details; two-stage approval (`reviewed_by`, `disbursed_by`) |

### Store Audits

| Table | Purpose |
|---|---|
| `store_audits` | CSS (customer service) and compliance audit sessions; **single-table inheritance** — shared columns + `css_*` prefix columns for CSS audits + `comp_*` prefix columns for compliance audits |
| `store_audit_messages` | Chat messages within an audit thread; soft-deleteable |
| `store_audit_attachments` | Files attached to audit or a specific message |

### Cases

| Table | Purpose |
|---|---|
| `case_reports` | Internal incident reports; auto-numbered per company via `company_sequences`; unique `(company_id, case_number)` |
| `case_messages` | Chat thread; `parent_message_id` self-ref for threaded replies; soft-deleteable |
| `case_attachments` | Files attached to case or a specific message |
| `case_reactions` | Emoji reactions on messages; unique `(message_id, user_id, emoji)` |
| `case_participants` | Thread membership; tracks `is_joined`, `is_muted`, `last_read_at` |
| `case_mentions` | @user or @role mentions in messages; CHECK requires at least one target non-null |

### Violation Notices

| Table | Purpose |
|---|---|
| `violation_notices` | Formal disciplinary notices; auto-numbered per company; status flow: `queued → discussion → issuance → disciplinary_meeting → completed/rejected` |
| `violation_notice_targets` | Employees named in the notice |
| `violation_notice_messages` | Chat thread (message/system types); soft-deleteable; threaded via `parent_message_id` |
| `violation_notice_attachments` | Files attached to VN or a specific message |
| `violation_notice_reactions` | Emoji reactions on VN messages |
| `violation_notice_participants` | Thread membership per VN |
| `violation_notice_mentions` | @mentions in VN messages |
| `violation_notice_reads` | Read receipts; unique `(violation_notice_id, user_id)` |

### Employee Verifications

| Table | Purpose |
|---|---|
| `personal_information_verifications` | Requests to update PII; one pending per `(company_id, user_id)` enforced by partial index |
| `bank_information_verifications` | Bank account update requests; one pending per `(company_id, user_id)` |
| `employment_requirement_submissions` | Document submissions (NBI, PSA, etc.); one pending per `(company_id, user_id, requirement_code)` |
| `employment_requirement_types` | Lookup table for document types; **VARCHAR `code` PK** (not UUID) — the only non-UUID PK in the schema |

### Token Pay

| Table | Purpose |
|---|---|
| `pending_transactions` | Token Pay issuance/deduction requests; `company_id` scoped; two-stage flow: `pending → completed/failed/cancelled`; `type` is `credit` or `debit`; `category` is `reward/purchase/transfer/adjustment`; reviewer columns added in migration 036 |

### Analytics

| Table | Purpose |
|---|---|
| `employee_metric_daily_snapshots` | Daily per-employee performance metrics snapshot; `company_id` scoped; used for Employee Analytics page |

### Notifications & Push

| Table | Purpose |
|---|---|
| `employee_notifications` | In-app notifications per user; `company_id` nullable |
| `push_subscriptions` | Web Push API subscriptions per device; tracks `failure_count` and `last_failure_*` for health |

---

## Company Scoping Rules

### Direct `company_id` (root tables)

These tables own the company scope for their domain and must have `company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE`:

```
branches, pos_sessions, pos_verifications, employee_shifts, schedules,
shift_logs, shift_authorizations, authorization_requests, cash_requests,
store_audits, case_reports, violation_notices,
personal_information_verifications, bank_information_verifications,
employment_requirement_submissions, peer_evaluations, company_sequences,
user_company_access, user_branches, user_company_branches,
pending_transactions, employee_metric_daily_snapshots
```

Special cases with `company_id`:
- `shift_exchange_requests` — two company IDs: `requester_company_id` and `accepting_company_id` (cross-company swaps)
- `refresh_tokens` — `company_id` nullable (session context hint, not scoping)
- `employee_notifications` — `company_id` nullable (notification may be platform-wide)

### Inherit via parent FK (no `company_id`)

Child tables that get company scope transitively through a parent FK:

| Child Table | Parent FK |
|---|---|
| `pos_verification_images` | `pos_verification_id` |
| `store_audit_messages` | `store_audit_id` |
| `store_audit_attachments` | `store_audit_id` |
| `case_messages` | `case_id` |
| `case_attachments` | `case_id` |
| `case_reactions` | `message_id` |
| `case_participants` | `case_id` |
| `case_mentions` | `message_id` |
| `violation_notice_targets` | `violation_notice_id` |
| `violation_notice_messages` | `violation_notice_id` |
| `violation_notice_attachments` | `violation_notice_id` |
| `violation_notice_reactions` | `message_id` |
| `violation_notice_participants` | `violation_notice_id` |
| `violation_notice_mentions` | `message_id` |
| `violation_notice_reads` | `violation_notice_id` |
| `registration_request_company_assignments` | `registration_request_id` (also has `company_id` as FK to companies) |
| `registration_request_assignment_branches` | `registration_request_company_assignment_id` |

**Do not add redundant `company_id` to these tables.** Scope them via a JOIN to the parent.

### No company scope (global / platform)

```
companies, super_admins, users, user_sensitive_info, departments,
permissions, roles, role_permissions, user_roles,
employment_requirement_types, scheduled_job_runs, push_subscriptions
```

---

## FK and Cascade Patterns

### ON DELETE CASCADE

Use when the child row has no meaning without the parent:
- `companies(id)` → all company-scoped root tables
- `users(id)` → `user_roles`, `user_company_access`, `user_branches`, `user_company_branches`, `refresh_tokens`, `employee_notifications`, `push_subscriptions`, `peer_evaluations`, `case_messages.user_id`, `violation_notice_messages.user_id`
- Parent entity → child message/attachment/reaction/participant/mention tables (store_audits, case_reports, violation_notices)
- `pos_verifications(id)` → `pos_verification_images`
- `roles(id)` → `role_permissions`, `user_roles`
- `permissions(id)` → `role_permissions`

### ON DELETE SET NULL

Use for "who performed this action" actor columns — the action record should survive even if the actor is deleted:
- `users.department_id` → `departments(id)` SET NULL
- `users.last_company_id` → `companies(id)` SET NULL
- Any `{action}_by` column (reviewed_by, resolved_by, confirmed_by, issued_by, completed_by, rejected_by, deleted_by, hr_decision_by, disbursed_by, auditor_user_id, uploaded_by, cashier_user_id, customer_user_id) → `users(id)` SET NULL

### branches FK — no cascade

Most tables reference `branches(id)` **without** an explicit `onDelete` (defaults to RESTRICT / NO ACTION in Knex). Don't delete a branch that has associated records without clearing those references first.

---

## Naming Conventions

### Columns

| Pattern | Convention |
|---|---|
| Primary key | `id UUID NOT NULL DEFAULT gen_random_uuid()` |
| Timestamps | `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` |
| Status column | `status VARCHAR(20–30) NOT NULL DEFAULT 'pending'` — always has a default |
| Active flag | `is_active BOOLEAN NOT NULL DEFAULT true` |
| System/delete flag | `is_system`, `is_deleted` BOOLEAN NOT NULL DEFAULT false |
| Actor columns | `{action}_by UUID nullable REFERENCES users(id) ON DELETE SET NULL` |
| Timestamp for actor | `{action}_at TIMESTAMPTZ nullable` — always paired with `{action}_by` |
| Odoo integer IDs | `odoo_{entity}_id INTEGER` (e.g. `odoo_shift_id`, `css_odoo_order_id`) |
| Odoo string IDs | `odoo_{entity}_id VARCHAR(100)` (e.g. `odoo_session_id`, `odoo_branch_id`) |
| Domain-prefix (STI) | `css_*` for customer_service columns, `comp_*` for compliance columns in `store_audits` |

### Index Names

| Type | Pattern | Example |
|---|---|---|
| Regular index | `{table}_{cols}_idx` | `store_audits_company_type_status_created_at_idx` |
| Unique index | `{table}_{cols}_unique` | `user_roles_user_id_role_id_unique` |
| Partial index | `{table}_{description}_unique` or `_idx` | `store_audits_one_active_per_auditor` |

### Constraint Names

| Type | Pattern |
|---|---|
| CHECK on column | `{table}_{column}_check` |
| CHECK requiring a target | `{table}_must_have_target` |

### Permission Keys

Format: `{category}.{action}` — e.g. `shift.view_all`, `store_audit.process`.

Exception: `employee_verifications` category uses dot-separated sub-namespaces: `employee_verification.view`, `registration.approve`, `personal_information.approve`, `employee_requirements.approve`, `bank_information.approve`.

---

## Partial / Unique Index Patterns

Three recurring scenarios:

### 1. One-active-per-actor (race condition protection)

Catch a unique constraint violation (→ 409) instead of letting two concurrent requests succeed:

```sql
-- One processing audit per auditor
CREATE UNIQUE INDEX store_audits_one_active_per_auditor
  ON store_audits (company_id, auditor_user_id)
  WHERE status = 'processing';

-- One pending PII verification per user
CREATE UNIQUE INDEX personal_information_verifications_one_pending_per_user
  ON personal_information_verifications (company_id, user_id)
  WHERE status = 'pending';

-- One pending employment doc submission per (user, doc type)
CREATE UNIQUE INDEX employment_requirement_submissions_one_pending
  ON employment_requirement_submissions (company_id, user_id, requirement_code)
  WHERE status = 'pending';

-- One pending bank verification per user
CREATE UNIQUE INDEX bank_information_verifications_one_pending_per_user
  ON bank_information_verifications (company_id, user_id)
  WHERE status = 'pending';

-- One pending shift swap per shift (both sides)
CREATE UNIQUE INDEX shift_exchange_requests_requester_shift_pending_unique
  ON shift_exchange_requests (requester_company_id, requester_shift_id)
  WHERE status = 'pending';
```

### 2. Nullable-but-unique columns

Unique only when the value is present (NULL rows are never compared as equal by PostgreSQL unique indexes, but a partial index makes the intent explicit and avoids surprises):

```sql
CREATE UNIQUE INDEX companies_company_code_unique
  ON companies (company_code)
  WHERE company_code IS NOT NULL;

-- Exactly one root company
CREATE UNIQUE INDEX companies_is_root_unique
  ON companies (is_root)
  WHERE is_root = true;
```

### 3. Case-insensitive unique

```sql
-- Unique email for pending registrations (case-insensitive)
CREATE UNIQUE INDEX registration_requests_email_pending_unique
  ON registration_requests (LOWER(email))
  WHERE status = 'pending';

-- Unique department name (case-insensitive)
CREATE UNIQUE INDEX departments_name_lower_unique
  ON departments (LOWER(name));
```

---

## Cross-Cutting Column Patterns

### Soft Delete

Used in all message tables (`case_messages`, `store_audit_messages`, `violation_notice_messages`):

```sql
is_deleted    BOOLEAN NOT NULL DEFAULT false
deleted_by    UUID nullable REFERENCES users(id) ON DELETE SET NULL
```

Records are never hard-deleted. Filter with `WHERE NOT is_deleted` in queries.

### Workflow Stage Columns

Multi-step approvals pair an actor + timestamp per stage:

```sql
reviewed_by   UUID nullable REFERENCES users(id) ON DELETE SET NULL
reviewed_at   TIMESTAMPTZ nullable
```

Examples: `reviewed_by/at`, `disbursed_by/at`, `confirmed_by`, `issued_by`, `completed_by`, `resolved_by/at`, `hr_decision_by/at`.

### Auto-Numbered Per Company

`case_reports.case_number` and `violation_notices.vn_number` are auto-incremented per company using `company_sequences`:

```sql
-- Unique within company
UNIQUE (company_id, case_number)
UNIQUE (company_id, vn_number)
```

Use `SELECT current_value FROM company_sequences WHERE company_id = ? AND sequence_name = ? FOR UPDATE` to atomically increment and get the next number.

### JSONB for External Payloads

Raw Odoo webhook payloads stored for debugging/replay — never relied on for business logic:

```sql
odoo_payload JSONB NOT NULL   -- on: pos_sessions, employee_shifts, shift_logs, pos_verifications
```

### Message Thread Pattern

Reused identically across `store_audits`, `case_reports`, and `violation_notices`:

- **messages** — `is_deleted`, `deleted_by`, `parent_message_id` (self-ref for threading), `type` (message/system)
- **attachments** — linked to parent entity AND optionally to a specific message (`message_id` nullable SET NULL)
- **reactions** — unique `(message_id, user_id, emoji)`
- **participants** — `is_joined`, `is_muted`, `last_read_at`
- **mentions** — CHECK: `mentioned_user_id IS NOT NULL OR mentioned_role_id IS NOT NULL`

When adding a new thread-capable entity, replicate this full set of 5 child tables.

---

## Gotchas & Exceptions

### Circular FK: departments ↔ users

`departments.head_user_id → users(id)` and `users.department_id → departments(id)` form a cycle. Resolved in migration by:
1. Create `departments` with `head_user_id` as plain UUID (no FK)
2. Create `users` with FK to `departments`
3. `ALTER TABLE departments ADD FOREIGN KEY (head_user_id) REFERENCES users(id) ON DELETE SET NULL`

### Non-UUID PK: employment_requirement_types

`employment_requirement_types` uses `code VARCHAR(100)` as its primary key. Referenced by `employment_requirement_submissions.requirement_code`. This is the **only** table in the schema with a non-UUID PK.

### Manila Time Column

`scheduled_job_runs.scheduled_for_manila` is intentionally `TIMESTAMP WITHOUT TIME ZONE` (no `useTz: true`). It stores Manila local time. All other timestamp columns must use `TIMESTAMPTZ`.

### user_company_branches has redundant company_id

`user_company_branches` has both `branch_id` and `company_id`. The `company_id` is technically derivable via `branch.company_id` but is kept for query performance (avoids a join). This is an intentional denormalization — not a mistake.

### store_audits: single-table inheritance

`store_audits` uses one table for both audit types with prefixed columns:
- `css_*` columns are only populated when `type = 'customer_service'`
- `comp_*` columns are only populated when `type = 'compliance'`
- Do not add a new audit type without adding its own column prefix group

### Permission key format

Most permission keys: `{category}.{action}` → `shift.view_all`

The `employee_verifications` category is an exception — keys are already fully qualified with their own sub-namespace: `employee_verification.view`, `registration.approve`, etc. The category is `employee_verifications` but the key prefix varies.
