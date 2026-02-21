# Omnilert Project Context

Last updated: 2026-02-21

This document is for AI and engineer handoff. It captures the current implementation state of this repository from code-confirmed behavior.

## 1) System Purpose and Domain

Omnilert is a multi-tenant internal operations platform for branch-based businesses.

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
- Support super-admin managed tenant lifecycle, including hard delete of a tenant company.

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
  docs/
    PROJECT_CONTEXT.md   This file
```

Key backend layers (`apps/api/src`):
- `routes/` endpoint definitions
- `controllers/` request/response orchestration
- `services/` business logic
- `middleware/` auth, company resolution, RBAC, validation, errors
- `config/` env, database, socket setup
- `migrations/master` and `migrations/tenant`
- `scripts/` tenant migration helpers
- `utils/` shared helpers (JWT, encryption, logger)

Key frontend areas (`apps/web/src`):
- `app/` router and app shell
- `features/` domain pages/components
  - `employee-verifications/`
  - `employee-requirements/`
  - `registration-requests/` (compatibility feature folder)
- `shared/components/ui` reusable UI components
- `shared/services/api.client.ts` axios client and refresh handling
- `shared/hooks/useSocket.ts` socket namespace connector

## 3) Source-of-Truth Config and Startup Flow

Environment schema source of truth:
- `apps/api/src/config/env.ts`

Defined API env vars:
- Server: `PORT`, `NODE_ENV`, `CLIENT_URL`
- Master DB: `MASTER_DB_HOST`, `MASTER_DB_PORT`, `MASTER_DB_NAME`, `MASTER_DB_USER`, `MASTER_DB_PASSWORD`
- Tenant auth JWT: `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`
- Super admin auth: `SUPER_ADMIN_BOOTSTRAP_SECRET`, `SUPER_ADMIN_JWT_SECRET`, `SUPER_ADMIN_JWT_EXPIRES_IN`
- Uploads: `UPLOAD_DIR`, `MAX_FILE_SIZE`
- DigitalOcean Spaces (optional): `DO_SPACES_ENDPOINT`, `DO_SPACES_CDN_ENDPOINT`, `DO_SPACES_KEY`, `DO_SPACES_SECRET_KEY`, `DO_SPACES_BUCKET`
- Odoo: `ODOO_DB`, `ODOO_URL`, `ODOO_USERNAME`, `ODOO_PASSWORD`
- SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- Onboarding links: `DISCORD_INVITE_URL`
- Queue: `QUEUE_SCHEMA`, `EARLY_CHECKIN_QUEUE_NAME`, `EARLY_CHECKIN_RETRY_LIMIT`

Canonical env example:
- `apps/api/.env.example`

Server bootstrap behavior (`apps/api/src/server.ts`):
- Initialize Socket.IO
- Initialize attendance queue
- Verify SMTP transporter connectivity (`verifyMailConnection`)
- Start HTTP server

## 4) Multi-Tenant Model and Runtime Company Context

Tenant strategy:
- One master database for global metadata.
- One tenant database per company.

Master DB key tables:
- `companies` (includes `theme_color`, `company_code`, `is_active`)
- `company_databases` (tenant migration tracking metadata)
- `super_admins`
- `employee_identities` (global identity reuse by normalized email)

Tenant DB key additions:
- `users.employee_number`
- `users.valid_id_url`, `users.valid_id_updated_at`
- `registration_requests`
- `personal_information_verifications`
- `employment_requirement_types`
- `employment_requirement_submissions`

Request-scoped company context (`apps/api/src/middleware/companyResolver.ts`):
- `req.companyContext.companyId`
- `req.companyContext.companySlug`
- `req.companyContext.companyName`
- `req.companyContext.companyStorageRoot` (currently `company.slug`)

Company resolver also enforces active company (`companies.is_active = true`) before tenant DB resolution.

## 5) Migration and Provisioning Model

Master migrations (`apps/api/src/migrations/master`):
- `001_create_companies.ts`
- `002_create_super_admins.ts`
- `003_create_company_databases.ts`
- `004_add_theme_color_to_companies.ts`
- `005_add_company_code_and_employee_identities.ts`

Tenant migrations (`apps/api/src/migrations/tenant`):
- `001_baseline.ts`
- `002_add_user_key_to_users.ts`
- `003_add_user_profile_columns.ts`
- `004_add_registration_requests_and_employee_number.ts`
- `005_employee_verifications_expansion.ts`

Operational scripts (`apps/api/src/scripts`):
- `migrate-tenants.ts`
- `migration-status-tenants.ts`
- `rollback-tenants.ts`
- `migration.ts` (legacy helper)

Tenant provisioning (`apps/api/src/services/databaseProvisioner.ts`):
- Creates current tenant schema for new companies.
- Seeds permissions/roles and fixed employment requirement catalog.
- Runs versioned tenant migrations after initial table creation.

## 6) Auth and RBAC

Permission source:
- `packages/shared/src/constants/permissions.ts`

Current permission keys:

Admin
- `admin.manage_roles`
- `admin.manage_users`
- `admin.manage_branches`
- `admin.view_all_branches`
- `admin.toggle_branch`

Dashboard
- `dashboard.view`
- `dashboard.view_performance_index`
- `dashboard.view_payslip`

POS Verification
- `pos_verification.view`
- `pos_verification.confirm_reject`
- `pos_verification.upload_image`

POS Session
- `pos_session.view`
- `pos_session.audit_complete`

Account
- `account.view_schedule`
- `account.view_auth_requests`
- `account.submit_private_auth_request`
- `account.submit_public_auth_request`
- `account.view_cash_requests`
- `account.submit_cash_request`
- `account.view_notifications`

Employee
- `employee.view_own_profile`
- `employee.edit_own_profile`

Shifts
- `shift.view_all`
- `shift.approve_authorizations`
- `shift.end_shift`

Authorization Requests
- `auth_request.approve_management`
- `auth_request.view_all`
- `auth_request.approve_service_crew`

Cash Requests
- `cash_request.view_all`
- `cash_request.approve`

Employee Verifications
- `employee_verification.view`
- `registration.approve`
- `personal_information.approve`
- `employee_requirements.approve`

Permission migration note:
- Legacy `registration.view` is migrated to `employee_verification.view` in tenant migration `005_employee_verifications_expansion.ts`.

Auth behavior highlights (`apps/api/src/services/auth.service.ts`):
- Tenant login checks active company by slug.
- Super admin fallback login is supported: if tenant user auth fails but master `super_admins` auth succeeds, a mirrored tenant user is created/used.
- Refresh flow validates company is still active before tenant operations.

## 7) API Surface Overview

Base path: `/api/v1`

Public/general routes:
- `GET /health`
- Auth:
  - `POST /auth/login`
  - `POST /auth/refresh`
  - `POST /auth/logout`
  - `POST /auth/register-request`
  - `GET /auth/me` (authenticated)
- Super:
  - `GET /super/companies` (public list)
  - `POST /super/bootstrap`
  - `POST /super/auth/login`
  - `GET /super/auth/me` (super-admin token)
- Webhooks:
  - `/webhooks/odoo/*`

Super company management routes (`apps/api/src/routes/super.routes.ts`):
- `GET /super/companies/current` (tenant JWT, admin role check in controller)
- `PUT /super/companies/current` (tenant JWT, admin role check in controller)
- `POST /super/companies/current/delete` (tenant JWT + superuser re-auth checks)
- `POST /super/companies` (super-admin token)
- `GET /super/companies/:id` (super-admin token)
- `PUT /super/companies/:id` (super-admin token)

Company-scoped authenticated route groups (`apps/api/src/routes/index.ts`):
- `/branches`, `/roles`, `/permissions`, `/users`
- `/pos-verifications`, `/pos-sessions`
- `/employee-shifts`, `/shift-authorizations`
- `/authorization-requests`, `/cash-requests`
- `/employee-verifications`
- `/registration-requests` (compatibility alias for registration-only verification endpoints)
- `/employee-requirements`
- `/account/*`
- `/dashboard/*`

Employee Verifications endpoints (`/employee-verifications`):
- `GET /employee-verifications`
- `POST /employee-verifications/registration/:id/approve`
- `POST /employee-verifications/registration/:id/reject`
- `POST /employee-verifications/personal-information/:id/approve`
- `POST /employee-verifications/personal-information/:id/reject`
- `POST /employee-verifications/employment-requirements/:id/approve`
- `POST /employee-verifications/employment-requirements/:id/reject`

Registration compatibility endpoints (`/registration-requests`):
- `GET /registration-requests`
- `POST /registration-requests/:id/approve`
- `POST /registration-requests/:id/reject`

Employee Requirements manager endpoints (`/employee-requirements`):
- `GET /employee-requirements`
- `GET /employee-requirements/:userId`

My Account verification/requirements endpoints (`/account`):
- `POST /account/personal-information/verifications`
- `POST /account/valid-id` (multipart field: `document`)
- `GET /account/employment/requirements`
- `POST /account/employment/requirements/:requirementCode/submit` (multipart field: `document`)

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

Room model:
- Branch rooms: `branch:{branchId}`
- Company rooms (verifications/requirements): `company:{companyId}`
- User rooms: `user:{userId}`

Notable server events:
- Verification events:
  - `employee-verification:updated`
  - `employee-verification:approval-progress`
- Requirement events:
  - `employee-requirement:updated`
- Auth/session control:
  - `auth:force-logout`
- Existing operational events:
  - POS, session, shift, and notification events remain active.

## 9) Odoo and Verification Workflow Notes

Registration approval flow (`apps/api/src/services/registration.service.ts`):
- Validates roles/branches and company setup.
- Resolves or creates global identity (`employee_identities`) by normalized email.
- Encrypts password at rest for requests; decrypts only during approval (`apps/api/src/utils/secureText.ts`).
- Uses global employee number with barcode collision checks against Odoo.
- Resolves one shared PIN per approval run:
  - Reuse existing PIN for same `x_website_key` if present.
  - Otherwise generate one random 4-digit PIN and apply to all branches.
- Creates/updates `hr.employee` across active branches with prefixed name and barcode.
- Merges active contacts by email in `res.partner`, selects canonical contact, then writes:
  - `company_id = false`
  - `x_website_key`
  - prefixed canonical name
  - append `category_id` tag `3`

Name formatting helpers (`apps/api/src/services/odoo.service.ts`):
- `formatBranchEmployeeCode(odooBranchId, employeeNumber)`
- `formatEmployeeDisplayName(...)` -> `<branch-code> - <First Last>`

Personal information verification:
- User profile changes are submitted as a verification first.
- Odoo profile sync happens on approval (`employeeVerification.service.ts` + `odoo.service.ts`).
- Name updates preserve prefixed naming format when context is available.

Avatar sync:
- Avatar upload updates website user avatar and asynchronously syncs Odoo `image_1920` on:
  - canonical `res.partner`
  - linked `hr.employee` records

Employment requirements:
- Fixed requirement catalog is seeded in tenant DB.
- Display statuses are mapped as:
  - `approved` -> `complete`
  - `pending` -> `verification`
  - missing submission -> `pending` (displayed in UI as Incomplete)
  - `rejected` -> `rejected`

## 10) Email and Notification Behavior

Mail service (`apps/api/src/services/mail.service.ts`):
- SMTP delivery uses `SMTP_*` env vars.
- Sender display name is controlled via `SMTP_FROM` (for example `Omnilert Onboarding <...>`).
- Registration approved email includes:
  - account credentials
  - onboarding steps
  - employment reminder
  - login link with redirect to employment tab (`/login?redirect=/account/employment`)
  - optional `companySlug` query for preselection

Login-triggered employee notifications (`auth.service.ts`):
- `Complete Your Profile` when profile is not yet marked updated.
- `Submit Your Requirements` when zero requirements submitted.
- `Complete Your Requirements` when some but not all submitted.

Verification decision notifications:
- Personal information and employment requirement submit/approve/reject paths create `employee_notifications` and emit realtime notification events.

## 11) Tenant-Rooted S3 Storage and Company Hard Delete

Storage service source:
- `apps/api/src/services/storage.service.ts`

Tenant-rooted object key strategy:
- `buildTenantStoragePrefix(companyStorageRoot, ...parts)`
- `companyStorageRoot` currently equals `company.slug` from resolver context.

Current upload paths:
- Cash requests: `${company.slug}/Cash Requests/${userId}`
- Valid IDs: `${company.slug}/Valid IDs/${userId}`
- Employment requirements: `${company.slug}/Employment Requirements/${userId}/${requirementCode}`
- Profile pictures: `${company.slug}/Profile Pictures/${userId}`
- POS verification images: `${company.slug}/POS Verifications/${userId}`

Company hard delete flow (`apps/api/src/services/company.service.ts`):
1. Validate current tenant user is an active superuser (email exists in master `super_admins`).
2. Re-authenticate with submitted super-admin credentials and enforce same email as current session.
3. Validate typed company name matches current company name.
4. Set `companies.is_active = false` immediately.
5. Revoke tenant refresh tokens.
6. Emit `auth:force-logout` to tenant users (best effort).
7. Storage cleanup in order:
   - Recursive tenant prefix sweep: `${company.slug}/`
   - Legacy URL-based file cleanup
   - Legacy per-user folder cleanup (`Cash Requests`, `Employment Requirements`, `Valid IDs`, `Profile Pictures`)
8. Best-effort queue cleanup by `companyDbName` in pg-boss tables.
9. Close tenant pool, terminate DB connections, drop tenant database.
10. Delete master company row.
11. Return warnings for partial cleanup failures.

Scope note:
- Deletion targets Omnilert-managed data only. It does not delete Odoo-side records.

## 12) Frontend State Snapshot

Router and navigation (`apps/web/src/app/router.tsx`, `Sidebar.tsx`):
- Management label is `Employee Verifications`.
- Primary route: `/employee-verifications`.
- Compatibility alias route: `/registration-requests` redirects to `/employee-verifications`.
- Service Crew section includes `Employee Requirements` route/page.

Login page (`apps/web/src/features/auth/components/LoginForm.tsx`):
- Modes:
  - Sign In
  - Register (submits `/auth/register-request`)
  - Create Company (super-admin driven)
- Supports `redirect` query param and optional `companySlug` preselection.

Employee Verifications UI:
- Card list with right-side detail panel for approve/reject actions.
- Type tabs: Registration, Personal Information, Employment Requirements.
- Status tabs order: All, Pending, Approved, Rejected (default Pending).
- Registration approval panel includes backend progress log stream from realtime event.

My Account Employment tab and Employee Requirements page:
- Requirement cards support image/PDF previews (inline modal).
- Status language uses Incomplete for not-yet-submitted state.

Company page:
- Includes Danger Zone delete action shown only when `canDeleteCompany` is true.

## 13) Queue Subsystem (Delayed Early Check-In Authorization)

Queue implementation:
- `apps/api/src/services/attendanceQueue.service.ts`
- Uses `pg-boss` with master Postgres schema (default `pgboss`).

Startup/shutdown lifecycle:
- Initialized from `apps/api/src/server.ts` via `initAttendanceQueue()`.
- Gracefully stopped via `stopAttendanceQueue()`.

Behavior:
- Early check-in webhook paths can schedule delayed authorization jobs at `shift_start + 1 minute`.
- Worker revalidates shift/log state before insert.
- Worker inserts `early_check_in` authorization only when still valid.

Idempotency:
- Deterministic singleton key: `companyDbName:shiftLogId:early_check_in`.
- Duplicate authorization creation is guarded in both queue keying and worker checks.

## 14) Operational Guardrails and Known Risks

Guardrails:
- Do not change permission keys without migration impact review.
- Keep master and tenant migration lifecycles separate and coordinated.
- Company resolver active-company checks are critical for post-delete token safety.
- Socket namespace permission guards are enforced per namespace.

Known risks/gaps:
- Company hard delete is intentionally non-transactional across DB + storage + queue cleanup.
- Storage and queue cleanup are best effort; warning payloads must be monitored.
- Compatibility alias `/registration-requests` is temporary and should be removed after client transition.
- Legacy migration helper `apps/api/src/scripts/migration.ts` may diverge from standard migration flow.

This file should be updated whenever route contracts, permission keys, migrations, realtime contracts, queue behavior, storage topology, or deletion behavior changes.
