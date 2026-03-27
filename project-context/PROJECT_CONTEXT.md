# Omnilert Project Context

Last updated: 2026-03-26

This document is for AI and engineer handoff. It captures the current implementation state of this repository from code-confirmed behavior.

## 1) System Purpose and Domain

Omnilert is an internal operations platform for branch-based businesses.

Core responsibilities:

- Receive and process Odoo webhook payloads.
- Run POS verification and POS session workflows.
- Track employee shifts, logs, and authorization approvals.
- Support employee self-service pages in My Account.
- Provide role-based administration for users, roles, branches, and company settings.
- Run Employee Verifications workflows:
  - Registration Request verification
  - Personal Information verification
  - Employment Requirements verification
  - Bank Information verification
- Support super-admin managed company lifecycle, including hard delete of a company.
- Run Case Reports workflow (create, discuss, resolve workplace cases with threaded chat, @mentions, attachments, corrective action / resolution lifecycle).
- Run Violation Notices workflow (create, confirm, issue, and complete employee violation notices with multi-step status lifecycle, target employee selection, file uploads, and threaded discussion).

Primary business context:

- Branch operations in Philippines-based deployments.
- Currency/date displays in UI are commonly PH-localized.

## 2) Current Architecture and Monorepo Map

Monorepo root uses pnpm workspaces and Turbo.

```text
omnilert-website/
  apps/
    api/                 Express + TypeScript API
    web/                 React + Vite frontend
  packages/
    shared/              Shared types, schemas, constants
  project-context/
    PROJECT_CONTEXT.md   This file
```

Key backend layers (`apps/api/src`):

- `routes/` endpoint definitions
- `controllers/` request/response orchestration
- `services/` business logic
- `middleware/` auth, company resolution, RBAC, validation, errors
- `config/` env, database, socket setup
- `migrations/` unified single-DB migrations (one directory)
- `utils/` shared helpers (JWT, encryption, logger, scopedQuery)

Key frontend areas (`apps/web/src`):

- `app/` router and app shell
- `features/` domain pages/components
  - `employee-verifications/` (management queue UI)
  - `authorization-requests/` (management + service crew authorization queues)
  - `employee-requirements/`
  - `registration-requests/` (compatibility feature folder)
- `shared/components/ui` reusable UI components (includes `AnimatedModal` — framer-motion portal wrapper for confirm dialogs)
- `shared/services/api.client.ts` axios client and refresh handling
- `shared/hooks/useSocket.ts` socket namespace connector

## 3) Source-of-Truth Config and Startup Flow

Environment schema source of truth:

- `apps/api/src/config/env.ts`

Defined API env vars:

- Server: `PORT`, `NODE_ENV`, `CLIENT_URL`
- Database: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- Tenant auth JWT: `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`
- Super admin auth: `SUPER_ADMIN_BOOTSTRAP_SECRET`, `SUPER_ADMIN_JWT_SECRET`, `SUPER_ADMIN_JWT_EXPIRES_IN`
- Uploads: `UPLOAD_DIR`, `MAX_FILE_SIZE`
- DigitalOcean Spaces (optional): `DO_SPACES_ENDPOINT`, `DO_SPACES_CDN_ENDPOINT`, `DO_SPACES_KEY`, `DO_SPACES_SECRET_KEY`, `DO_SPACES_BUCKET`
- Odoo: `ODOO_DB`, `ODOO_URL`, `ODOO_USERNAME`, `ODOO_PASSWORD`
- SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- Onboarding links: `DISCORD_INVITE_URL`
- Queue: `QUEUE_SCHEMA`, `EARLY_CHECKIN_QUEUE_NAME`, `EARLY_CHECKIN_RETRY_LIMIT`
- Web push: `WEB_PUSH_ENABLED`, `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_VAPID_SUBJECT`
- OpenAI: `OPENAI_API_KEY`, `OPENAI_ORGANIZATION_ID`, `OPENAI_PROJECT_ID`

Canonical env example:

- `apps/api/.env.example`

Server bootstrap behavior (`apps/api/src/server.ts`):

- Initialize Socket.IO
- Initialize attendance queue
- Verify SMTP transporter connectivity (`verifyMailConnection`)
- Start HTTP server

## 4) Database Architecture

### Single Database Model

All data lives in one PostgreSQL database. There are no per-company databases.

- **One `knex` connection pool** (`apps/api/src/config/database.ts` → `db.getDb()`)
- **Company isolation by `company_id`**: Root tables have `company_id UUID NOT NULL REFERENCES companies(id)` on every row. Child/leaf tables inherit company scope through their parent FK — no redundant `company_id`.
- **`scopedQuery(table, companyId)`** helper (`apps/api/src/utils/scopedQuery.ts`): shorthand for `db.getDb()(table).where('company_id', companyId)`.

### Root Tables with `company_id`

These tables have `company_id` and are the entry point for company-scoped data:

`branches`, `user_branches`, `pos_verifications`, `pos_sessions`, `schedules`, `employee_shifts`, `shift_logs`, `shift_authorizations`, `authorization_requests`, `cash_requests`, `store_audits`, `case_reports`, `violation_notices`, `personal_information_verifications`, `employment_requirement_submissions`, `bank_information_verifications`, `peer_evaluations`

### Child Tables (no `company_id`, scoped via parent FK)

`pos_verification_images` (via `pos_verifications`), `store_audit_messages`, `store_audit_attachments` (via `store_audits`), `case_messages`, `case_attachments`, `case_reactions`, `case_participants`, `case_mentions` (via `case_reports`), `violation_notice_targets`, `violation_notice_messages`, `violation_notice_attachments`, `violation_notice_reactions`, `violation_notice_participants`, `violation_notice_mentions`, `violation_notice_reads` (via `violation_notices`)

### Global Tables (no `company_id`)

These tables are shared globally across all companies:

- `companies` (theme_color, company_code, is_active, slug, storage_root)
- `super_admins`
- `users` (global identity and auth; includes `last_company_id`, `user_key`, `employee_number`, `department_id`)
- `user_sensitive_info` (PII split from users: government IDs, bank info, emergency contacts)
- `departments` (global org structure — e.g., HR, Operations)
- `permissions`, `roles`, `role_permissions`, `user_roles` (global RBAC)
- `user_company_access` (per-company employment context: position_title, date_started)
- `user_company_branches` (Odoo provisioning snapshot — NOT auth scope)
- `refresh_tokens`
- `registration_requests`, `registration_request_company_assignments`, `registration_request_assignment_branches`
- `shift_exchange_requests`
- `employment_requirement_types` (global catalog of PH employment documents)
- `company_sequences` (thread-safe per-company sequences for case_number, vn_number)
- `push_subscriptions` (user-scoped, device-level)
- `employee_notifications` (user-scoped unified inbox; nullable company_id for display context)
- `scheduled_job_runs`

### Restored FK Constraints

With a single database, all previously-dropped cross-database FKs are enforced:

- `employee_shifts.user_id → users(id)` ON DELETE SET NULL
- `cash_requests.user_id/reviewed_by/disbursed_by → users(id)`
- `authorization_requests.user_id/reviewed_by → users(id)`
- `store_audits.auditor_user_id → users(id)` ON DELETE SET NULL
- `case_reports.created_by/closed_by → users(id)`
- `violation_notices.created_by/confirmed_by/issued_by/completed_by/rejected_by → users(id)`
- `case_messages.user_id/violation_notice_messages.user_id → users(id)`
- `push_subscriptions.user_id → users(id)` ON DELETE CASCADE
- `users.department_id → departments(id)` ON DELETE SET NULL

### Key Constraints and Indexes

```sql
-- One active audit per auditor (race condition protection)
CREATE UNIQUE INDEX store_audits_one_active_per_auditor
  ON store_audits(company_id, auditor_user_id) WHERE status = 'processing';

-- Prevent duplicate CSS audit for same POS order
CREATE UNIQUE INDEX store_audits_css_order_unique
  ON store_audits(company_id, css_odoo_order_id)
  WHERE type = 'customer_service' AND status != 'completed';

-- Thread-safe per-company sequences
CREATE UNIQUE INDEX company_sequences_unique ON company_sequences(company_id, sequence_name);
```

### Request-Scoped Company Context

`apps/api/src/middleware/companyResolver.ts` populates `req.companyContext`:

- `req.companyContext.companyId`
- `req.companyContext.companySlug`
- `req.companyContext.companyName`
- `req.companyContext.companyStorageRoot` (from `getCompanyStorageRoot(company.slug)`, includes env suffix)

Resolver enforces `companies.is_active = true` before resolving — this is a security boundary.

**No more `req.tenantDb`.** Controllers extract `companyId` from `req.companyContext` and pass it to services.

## 5) Migration Model

Single migration directory: `apps/api/src/migrations/`

One migration (`001_single_db_redesign.ts`) creates the entire schema from scratch: ~50 tables, all FK constraints, indexes, and seeds (permissions, roles, role_permissions, employment_requirement_types).

### Running Migrations

```bash
# From apps/api/
pnpm migrate           # run pending migrations (knex migrate:latest)
pnpm migrate:rollback  # rollback last batch
pnpm migrate:status    # check migration status
```

Or from root:

```bash
pnpm up:dev  # runs pnpm -C apps/api migrate, then turbo dev
```

### Adding a New Migration

1. Create `apps/api/src/migrations/0NN_description.ts`
2. Export `up` and `down` using the Knex migration interface
3. Run `pnpm migrate` from `apps/api/`

### Company Provisioning

New company = `INSERT INTO companies`. No database creation, no migrations to run, no seeding required. The global schema already has all tables.

## 6) Auth and RBAC

Permission source:

- `packages/shared/src/constants/permissions.ts`

Current permission keys (38 total across 12 categories — migration `013_rbac_permission_rework.ts`):

Administration

- `admin.manage_companies` — Full company/branch/department configuration
- `admin.manage_departments` — Department management
- `admin.manage_roles` — Role and permission management
- `admin.manage_users` — User account and access management

Dashboard

- `dashboard.view` — View the main dashboard
- `dashboard.view_epi` — View EPI/KPI performance metrics and leaderboard

POS

- `pos.view` — Access POS Verification and POS Session pages

Account (My Account — personal, no permission gate on payslip/notifications/profile)

- `account.view_schedule` — View personal shift schedule
- `account.manage_schedule` — Request schedule changes (prerequisite: `account.view_schedule`)
- `account.submit_auth_request` — Submit shift authorization requests
- `account.submit_cash_request` — Submit cash advance/loan requests

Authorization Requests

- `authorization_requests.view` — View all authorization requests queue
- `authorization_requests.process` — Approve or reject authorization requests (prerequisite: `authorization_requests.view`)

Employee Verifications

- `employee_verifications.view` — View employee verification queue
- `employee_verifications.approve_registration` — Approve registration requests
- `employee_verifications.approve_personal_info` — Approve personal information updates
- `employee_verifications.approve_employee_requirements` — Approve employment requirements
- `employee_verifications.approve_bank_info` — Approve bank information updates

Case Reports

- `case_reports.view` — View case reports
- `case_reports.create` — Create new case reports (prerequisite: `case_reports.view`)
- `case_reports.manage` — Manage case report lifecycle (prerequisite: `case_reports.view`)

Store Audits

- `store_audits.view` — View store audit records
- `store_audits.manage` — Create and process store audits (prerequisite: `store_audits.view`)

Employee Profiles

- `employee_profiles.view_all` — View all employee profiles
- `employee_profiles.edit` — Edit employee work profiles (prerequisite: `employee_profiles.view_all`)

Employee Schedule

- `employee_schedule.view` — View company-wide shift schedules
- `employee_schedule.manage` — Manage shifts and approve authorizations (prerequisite: `employee_schedule.view`)

Violation Notices

- `violation_notices.view` — View violation notices
- `violation_notice.create` — Create new violation notices (prerequisite: `violation_notices.view`)
- `violation_notice.confirm` — Confirm violation notices (prerequisite: `violation_notices.view`)
- `violation_notice.reject` — Reject violation notices (prerequisite: `violation_notices.view`)
- `violation_notice.issue` — Issue formal notices (prerequisite: `violation_notices.view`)
- `violation_notice.complete` — Mark violation notices complete (prerequisite: `violation_notices.view`)
- `violation_notice.manage` — Full lifecycle management (prerequisite: `violation_notices.view`)

Workplace Relations

- `peer_evaluations.view` — View peer evaluations
- `peer_evaluations.manage` — Create and manage peer evaluations (prerequisite: `peer_evaluations.view`)

Cash Requests

- `cash_requests.view` — View all cash requests
- `cash_requests.manage` — Approve or reject cash requests (prerequisite: `cash_requests.view`)

Auth behavior highlights (`apps/api/src/services/auth.service.ts`):

- Login authenticates against `users`.
- Login `companySlug` is optional:
  - when provided, access is validated (`user_company_access` for regular users; superusers bypass assignment checks)
  - when omitted, company is auto-selected from `users.last_company_id` if valid, otherwise first accessible active company.
- Roles and permissions are loaded from global RBAC tables.
- Company branch scope in JWT is loaded as all active branches of the selected company from `branches`.
- Refresh/logout use `refresh_tokens`.
- Refresh tokens include a random `jti` claim at issue time.
- Super admins (emails in `super_admins`) can sign in to any active company without explicit `user_company_access`.
- Super admin sessions are granted full permission keys at token issue time.
- `GET /auth/companies` lists accessible active companies for current user context switching.
- `POST /auth/switch-company` issues a new company-context token pair, updates `users.last_company_id`.
- System role default permission sets are auto-synced (additive) during auth flows.

Role/permission management:

- Role and permission CRUD endpoints are backed by global `roles`, `permissions`, `role_permissions`.
- **Never rename or delete a permission key without a migration** — role assignments reference keys by string.

## 7) API Surface Overview

Base path: `/api/v1`

Public/general routes:

- `GET /health`
- Auth:
  - `POST /auth/login` (`{ email, password }`, optional compatibility `companySlug`)
  - `POST /auth/refresh`
  - `POST /auth/logout`
  - `POST /auth/register-request` (`firstName`, `lastName`, `email`, `password`)
  - `GET /auth/me` (authenticated)
  - `GET /auth/companies` (authenticated)
  - `POST /auth/switch-company` (authenticated)
- Super:
  - `GET /super/companies` (public list)
  - `POST /super/bootstrap`
  - `POST /super/auth/login`
  - `GET /super/auth/me` (super-admin token)
- Webhooks:
  - `/webhooks/odoo/*`

Super company management routes:

- `GET /super/companies/current` (tenant JWT, admin role check in controller)
- `PUT /super/companies/current` (tenant JWT, admin role check in controller)
- `POST /super/companies/current/delete` (tenant JWT + superuser re-auth checks)
- `POST /super/companies` (super-admin token)
- `GET /super/companies/:id` (super-admin token)
- `PUT /super/companies/:id` (super-admin token)

Company-scoped authenticated route groups:

- `/branches`, `/roles`, `/permissions`, `/users`
- `/pos-verifications`, `/pos-sessions`
- `/employee-shifts`, `/shift-authorizations`
- `/authorization-requests`, `/cash-requests`
- `/shift-exchanges`
- `/employee-verifications`
- `/registration-requests` (compatibility alias for registration-only verification endpoints)
- `/employee-requirements`
- `/departments`
- `/employee-profiles`
- `/account/*`
- `/dashboard/*`
- `/store-audits`
- `/case-reports`
- `/violation-notices`

Global User Management endpoints (`/users`, admin-scoped):

- `GET /users`
- `GET /users/assignment-options`
- `POST /users`
- `PUT /users/:id`
- `PUT /users/:id/roles`
- `PUT /users/:id/branches`
- `DELETE /users/:id`
- `DELETE /users/:id/permanent`

Employee Verifications endpoints (`/employee-verifications`):

- `GET /employee-verifications`
- `GET /employee-verifications/registration/assignment-options`
- `POST /employee-verifications/registration/:id/approve`
- `POST /employee-verifications/registration/:id/reject`
- `POST /employee-verifications/personal-information/:id/approve`
- `POST /employee-verifications/personal-information/:id/reject`
- `POST /employee-verifications/employment-requirements/:id/approve`
- `POST /employee-verifications/employment-requirements/:id/reject`
- `POST /employee-verifications/bank-information/:id/approve`
- `POST /employee-verifications/bank-information/:id/reject`

Registration approve payload:

- `roleIds: string[]`
- `companyAssignments: Array<{ companyId: string; branchIds: string[] }>`
- `residentBranch: { companyId: string; branchId: string }`

Case Reports endpoints (`/case-reports`):

- `GET /case-reports` (filters: status, search, date_from, date_to, sort_order, vn_only)
- `POST /case-reports`
- `GET /case-reports/:id`
- `PATCH /case-reports/:id/corrective-action`
- `PATCH /case-reports/:id/resolution`
- `POST /case-reports/:id/close`
- `POST /case-reports/:id/request-vn`
- `POST /case-reports/:id/attachments`
- `DELETE /case-reports/:id/attachments/:attachmentId`
- `GET /case-reports/:id/messages`
- `POST /case-reports/:id/messages`
- `PATCH /case-reports/:id/messages/:messageId`
- `DELETE /case-reports/:id/messages/:messageId`
- `POST /case-reports/:id/messages/:messageId/reactions`
- `POST /case-reports/:id/read`
- `POST /case-reports/:id/leave`
- `POST /case-reports/:id/mute`
- `GET /case-reports/mentionables`

Violation Notices endpoints (`/violation-notices`):

- `GET /violation-notices` (filters: status, search, date_from, date_to, sort_order, category, target_user_id)
- `POST /violation-notices`
- `GET /violation-notices/grouped-users`
- `GET /violation-notices/mentionables`
- `POST /violation-notices/from-case-report`
- `POST /violation-notices/from-store-audit`
- `GET /violation-notices/:id`
- `POST /violation-notices/:id/confirm`
- `POST /violation-notices/:id/reject`
- `POST /violation-notices/:id/issue`
- `POST /violation-notices/:id/issuance-upload`
- `POST /violation-notices/:id/confirm-issuance`
- `POST /violation-notices/:id/disciplinary-upload`
- `POST /violation-notices/:id/complete`
- `GET /violation-notices/:id/messages`
- `POST /violation-notices/:id/messages`
- `PATCH /violation-notices/:id/messages/:messageId`
- `DELETE /violation-notices/:id/messages/:messageId`
- `POST /violation-notices/:id/messages/:messageId/reactions`
- `POST /violation-notices/:id/read`
- `POST /violation-notices/:id/leave`
- `POST /violation-notices/:id/mute`

Store Audits endpoints (`/store-audits`):

- `GET /store-audits` (filters: type, status, page, pageSize)
- `GET /store-audits/:id`
- `POST /store-audits/:id/process`
- `POST /store-audits/:id/complete`
- `GET /store-audits/:id/messages`
- `POST /store-audits/:id/messages`
- `PATCH /store-audits/:id/messages/:messageId`
- `DELETE /store-audits/:id/messages/:messageId`

My Account verification/requirements endpoints (`/account`):

- `GET /account/profile`
- `PATCH /account/email`
- `POST /account/personal-information/verifications`
- `POST /account/bank-information/verifications`
- `POST /account/valid-id`
- `GET /account/employment/requirements`
- `POST /account/employment/requirements/:requirementCode/submit`
- `GET /account/audit-results`
- `GET /account/audit-results/:auditId`
- Push endpoints: `GET/PATCH /account/push/preferences`, `POST/DELETE /account/push/subscriptions`

## 8) Realtime Model (Socket.IO)

Socket config source:

- `apps/api/src/config/socket.ts`
- Event typings: `packages/shared/src/types/socket.types.ts`

Namespaces:

- `/pos-verification`
- `/pos-session`
- `/employee-shifts`
- `/employee-verifications`
- `/employee-requirements`
- `/notifications`
- `/store-audits`
- `/case-reports`
- `/violation-notices`

Room model:

- Branch rooms: `branch:{branchId}`
- Company rooms: `company:{companyId}`
- User rooms: `user:{userId}`
- Notification offline detection for push uses `/notifications` room presence (`user:{userId}` has zero sockets => offline).

Notable server events:

- `employee-verification:updated`, `employee-verification:approval-progress`
- `employee-requirement:updated`
- `auth:force-logout`
- Case Reports events (room `company:{companyId}`): `case-report:created`, `case-report:updated`, `case-report:message`, `case-report:reaction`, `case-report:attachment`, `case-report:message:edited`, `case-report:message:deleted`
- Violation Notices events (room `company:{companyId}`): `violation-notice:created`, `violation-notice:updated`, `violation-notice:status-changed`, `violation-notice:message`, `violation-notice:reaction`, `violation-notice:message:edited`, `violation-notice:message:deleted`
- Store Audits events: `store-audit:new`, `store-audit:claimed`, `store-audit:completed`, `store-audit:updated`

## 9) Odoo and Verification Workflow Notes

Registration approval flow (`apps/api/src/services/registration.service.ts`):

- Registration request creation is global (`registration_requests`) and does not include a company selector.
- Approval validates: `roleIds`, `companyAssignments`, `residentBranch`.
- Resolves or creates global identity (`employee_identities`) by normalized email.
- Encrypts password at rest; decrypts only during approval (`apps/api/src/utils/secureText.ts`).
- Resolves one shared PIN per approval run (reuse existing for same `x_website_key`, otherwise generate random 4-digit).
- Creates/updates `hr.employee` across active branches with prefixed name and barcode.
- Always creates/updates one `hr.employee` on Odoo `company_id = 1`.
- Creates/updates global user + role assignments + company access in global tables.
- Merges active contacts by email in `res.partner`, selects canonical, writes `company_id = false`, `x_website_key`, prefixed name, appends `category_id` tag `3`.

Name formatting helpers (`apps/api/src/services/odoo.service.ts`):

- `formatBranchEmployeeCode(odooBranchId, employeeNumber)` → barcode
- `formatEmployeeDisplayName(...)` → `<branch-code> - <First Last>`

Personal information verification:

- User profile changes submitted as a verification record first.
- Odoo profile sync happens on approval.
- Synced to Odoo: name, email, mobile, legal name, birthday, gender, address, emergency contact name/phone.
- NOT synced (DB only): SSS, TIN, Pag-IBIG, PhilHealth, marital status, emergency relationship.

Avatar sync:

- `/users/me/avatar` upload updates website user avatar and asynchronously syncs Odoo `image_1920` on canonical `res.partner` + linked `hr.employee` records.
- User Management create flow: fill-if-empty Odoo → website avatar import (continues with warning on failure).

Employment requirements:

- Fixed requirement catalog is seeded via `employment_requirement_types` global table.
- Display status mapping: `approved → complete`, `pending → verification`, missing → `pending` (Incomplete in UI), `rejected → rejected`.

Bank information verification (approval → Odoo, `odoo.service.ts`):

- Resolves canonical `res.partner` by `x_website_key` (fallback: email).
- **`res.partner.bank`**: If a row already exists for the same partner + trimmed account number, it is **updated** (`bank_id`, `allow_out_payment`); otherwise **created**. Avoids Odoo uniqueness errors on duplicate approval.
- **`hr.employee`**: Links the partner bank to employees via **`bank_account_ids`** (many2many). Writes use Odoo command **`(6, 0, [partnerBankId])`** to set the employee’s linked bank record(s). Older Odoo builds used a singular `bank_account_id` field — this codebase targets the m2m field.

## 10) Email and Notification Behavior

Mail service (`apps/api/src/services/mail.service.ts`):

- SMTP delivery uses `SMTP_*` env vars.
- Registration approved email includes: account credentials, onboarding steps, employment reminder, login link.

Login-triggered employee notifications:

- `Complete Your Profile` when profile not yet updated.
- `Submit Your Requirements` when zero requirements submitted.
- `Complete Your Requirements` when some but not all submitted.

Notification fanout (`apps/api/src/services/notification.service.ts`):

- Writes `employee_notifications` (global table, queried by `user_id`).
- Emits realtime `/notifications` socket events.
- Sends web push when: `WEB_PUSH_ENABLED` + VAPID valid, `push_notifications_enabled = true`, user offline (no socket in `/notifications` room `user:{userId}`), user has active `push_subscriptions` record.
- Failed web push deliveries increment failure metadata; deactivate subscriptions on provider `404/410`.

## 11) S3 Storage and Company Hard Delete

Storage service source: `apps/api/src/services/storage.service.ts`

Storage key strategy: `buildTenantStoragePrefix(companyStorageRoot, ...parts)`

`companyStorageRoot` = `${company.slug}-prod` or `${company.slug}-dev`

Upload paths:

- Cash requests: `${companyStorageRoot}/Cash Requests/${userId}`
- Valid IDs: `${companyStorageRoot}/Valid IDs/${userId}`
- Employment requirements: `${companyStorageRoot}/Employment Requirements/${userId}/${requirementCode}`
- Profile pictures: `${companyStorageRoot}/Profile Pictures/${userId}`
- POS verification images: `${companyStorageRoot}/POS Verifications/${userId}`
- Case report attachments: `${companyStorageRoot}/Case Reports/CASE-{caseNumber}/{filename}`
- Violation notice files: `${companyStorageRoot}/Violation Notices/VN-{vnNumber}/{filename}`

Company hard delete flow (`apps/api/src/services/company.service.ts`):

1. Validate current user is active superuser.
2. Re-authenticate with super-admin credentials (must match current session email).
3. Validate typed company name matches.
4. Set `companies.is_active = false`.
5. Revoke refresh tokens + emit `auth:force-logout`.
6. Storage cleanup (recursive prefix sweep + legacy paths).
7. Best-effort pg-boss queue cleanup by company ID.
8. Delete company row (cascades to all `company_id`-scoped rows via DB FK ON DELETE CASCADE).

Note: Since all company data is in one DB and the company row FK has CASCADE deletes, step 8 removes all company-scoped data atomically. No per-pool teardown needed.

## 12) Store Audits (Internal Audit)

Two audit types managed under `/store-audits`, both stored in the `store_audits` table:

| Type | Trigger | Discriminator |
| --- | --- | --- |
| Customer Service Audit (CSS) | Odoo POS order webhook (10% sampling) | `type = 'customer_service'` |
| Compliance Audit | Hourly cron — random active `hr.attendance` record | `type = 'compliance'` |

Status flow: `pending` → `processing` → `completed`

### Global Constraint: One Active Audit Per Auditor

Enforced by partial unique index `store_audits_one_active_per_auditor ON store_audits(company_id, auditor_user_id) WHERE status = 'processing'`.

Concurrent claim attempts: second request hits the unique constraint → API catches and returns 409.

### Completion

- **CSS**: auditor submits star rating (1–5) + audit log text. AI report generated via OpenAI `gpt-4o-mini`.
- **Compliance**: auditor answers Yes/No checks (non_idle, cellphone, uniform, hygiene, sop).

### Account Audit Results

Completed audits are viewable by the employee who was audited via `/account/audit-results`. Ownership is determined by:
- CSS: `css_cashier_user_key` matches user's `user_key`
- Compliance: `comp_odoo_employee_id` matches one of the user's linked Odoo employee IDs

## 13) Frontend State Snapshot

Router and navigation (`apps/web/src/app/router.tsx`, `Sidebar.tsx`):

- Management label is `Employee Verifications`.
- Primary route: `/employee-verifications`.
- Compatibility alias route: `/registration-requests` redirects to `/employee-verifications`.
- Account routing is flattened: `/account` redirects to `/account/schedule`, `/account/employment` redirects to `/account/profile`.
- Sidebar navigation:
  - `My Account`: Schedule, Payslip (gated: `dashboard.view_payslip`), Authorization Requests, Cash Requests, Notifications, Profile, Settings
  - `Management`: Authorization Requests, Employee Verifications
  - `Human Resources` (collapsible): Employee Profiles, Employee Schedule, Employee Requirements, Violation Notices (gated: `violation_notice.view`)
  - `Accounting and Finance` (collapsible): Cash Requests
  - `Internal Audit` (collapsible): Store Audits (gated: `store_audit.view`)
  - HR/Finance/Internal Audit groups auto-expand when a child route is active.
- Company switch applies new company theme and redirects to `/dashboard`.
- Mobile drawer: overlay includes left-chevron hint tap-to-close indicator.

Login page:

- Modes: Sign In, Register (submits `/auth/register-request`), Create Company (super-admin driven).
- Sign In and Register no longer include company selection — backend auto-selects.

Employee Verifications UI (`features/employee-verifications/pages/EmployeeVerificationsPage.tsx`):

- **Grid** of compact equal-height cards (`sm:grid-cols-2` / `lg:grid-cols-3`) + **slide-over detail panel**; backdrop and panel are **`createPortal(..., document.body)`** (stacking above page chrome).
- **Type tabs** (underline): Registration, Personal Information, Employment Requirements, Bank Information — **pending count badges** per type; switching type **resets status filter to Pending**.
- **Status sub-tabs** (second underline row): All, Pending, Approved, Rejected (default **Pending**); pagination resets on status change.
- **Badge** for status on cards and panel header; **skeleton** loading state for header + tabs + grid; typed **empty state** when a filter has no rows.
- Panel sections use icon + definition lists; rejection callouts with bordered alert styling; bank detail supports **copy account number**.
- **Approve / reject confirmation**: **`AnimatedModal`** + **`AnimatePresence`** (`framer-motion`), with **`zIndexClass="z-[60]"`** so the dialog stacks above the `z-50` panel.
- Realtime: `useSocket('/employee-verifications')`; registration approval still streams **`employee-verification:approval-progress`**.

Authorization Requests UI (`features/authorization-requests/pages/AuthorizationRequestsPage.tsx`):

- Management requests and service crew (shift authorization) queues: card list + slide-over detail panels (existing layout).
- **Approve / reject confirmation** uses the same **`AnimatedModal`** + **`AnimatePresence`** pattern with **`z-[60]`** above the drawer.

Employee Schedule page:

- Filter panel uses staged controls with explicit Apply/Clear/Cancel actions.
- `Pending Approvals` filter renders as toggle switch.
- Exchange Shift enabled for owner-open shifts when user is not suspended.

Employee Profiles page:

- Card list + right-side detail panel.
- Global scope: one card per user across all active company assignments.
- Responsive pagination: Desktop 12 per page, Mobile 6 per page.
- Superusers excluded from list/detail/work-update flows.
- Status model: Active, Resigned, Inactive, Suspended.

Store Audits UI:

- Category tabs (All / Customer Service / Compliance) + status tabs (Pending / Processing / Completed, default Pending) + card list + right-side detail panel.
- Uses `/store-audits` Socket.IO namespace.

Violation Notices UI:

- Card list + right-side detail panel. Deep-link: `/violation-notices?vnId=X`.
- Status workflow: `queued → discussion → issuance → disciplinary_meeting → completed`. Rejection (`rejected`) at queued or discussion.
- Reuses `ChatSection` from case reports. Connects via `useSocket('/violation-notices')`.
