# Omnilert Project Context

Last updated: 2026-02-22

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
  - Bank Information verification
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
- Web push: `WEB_PUSH_ENABLED`, `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_VAPID_SUBJECT`

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
- `users` (canonical global auth users)
  - includes `last_company_id` (server-side last-used company context for auto company selection on login)
- `permissions`, `roles`, `role_permissions`, `user_roles` (global RBAC catalogs + assignments)
- `user_company_access` (which companies a global user can access)
- `user_company_branches` (per-company branch scope with `resident|borrow` assignment type)
- `refresh_tokens` (global token storage with company context)
- `registration_requests`, `registration_request_company_assignments`, `registration_request_assignment_branches` (global registration queue + approval snapshots)
- `shift_exchange_requests` (global inter-company shift exchange authorization workflow across requester + accepting shifts)

Tenant DB key additions:
- `users.employee_number`
- `users.valid_id_url`, `users.valid_id_updated_at`
- `users.address`, `users.sss_number`, `users.tin_number`, `users.pagibig_number`, `users.philhealth_number`, `users.marital_status`
- `users.emergency_contact`, `users.emergency_phone`, `users.emergency_relationship`
- `users.bank_id`, `users.bank_account_number`
- `users.department_id`, `users.position_title`, `users.date_started`
- `users.employment_status` (`active|resigned|inactive|suspended`; `is_active` compatibility remains)
- `users.push_notifications_enabled` (tenant-scoped web push preference in current implementation)
- `personal_information_verifications`
- `employment_requirement_types`
- `employment_requirement_submissions`
- `bank_information_verifications`
- `departments`
- `push_subscriptions`
- `employee_notifications.user_id` stores global user UUIDs and is not FK-bound to tenant `users`

Current implementation note:
- Auth and registration are now master-backed.
- My Account profile and `/users/me*` account endpoints are now master-user backed.
- Runtime API user/role actions have been swept to global scope:
  - user identity/profile/role hydration now uses master `users` + global RBAC tables.
  - tenant DB remains source-of-truth for operational records (shifts, verifications, notifications, departments, POS, etc.).
  - legacy tenant user/role references remain only in migration/provisioning scripts (`scripts/migration.ts`, `services/databaseProvisioner.ts`) for backward/bootstrapping paths.

Request-scoped company context (`apps/api/src/middleware/companyResolver.ts`):
- `req.companyContext.companyId`
- `req.companyContext.companySlug`
- `req.companyContext.companyName`
- `req.companyContext.companyStorageRoot` (from `getCompanyStorageRoot(company.slug)`, includes env suffix)

Company resolver also enforces active company (`companies.is_active = true`) before tenant DB resolution.

## 5) Migration and Provisioning Model

Master migrations (`apps/api/src/migrations/master`):
- `001_create_companies.ts`
- `002_create_super_admins.ts`
- `003_create_company_databases.ts`
- `004_add_theme_color_to_companies.ts`
- `005_add_company_code_and_employee_identities.ts`
- `006_global_users_and_registration.ts`
  - Includes idempotent/self-healing handling for legacy truncated constraint names on:
    - `registration_request_company_assignments`
    - `registration_request_assignment_branches`
  - Prevents repeated failure when re-running migration on partially-applied databases.
- `007_add_users_last_company.ts`
- `008_add_users_department_id.ts` (adds nullable `users.department_id` in master DB for global-profile work-info compatibility)
- `009_add_shift_exchange_requests_and_suspended_status.ts`

Tenant migrations (`apps/api/src/migrations/tenant`):
- `001_baseline.ts`
- `002_add_user_key_to_users.ts`
- `003_add_user_profile_columns.ts`
- `004_add_registration_requests_and_employee_number.ts`
- `005_employee_verifications_expansion.ts`
- `006_profile_bank_verifications.ts`
- `007_departments_employee_profiles.ts`
- `008_expand_personal_information_fields.ts`
- `009_add_employment_status_to_users.ts`
- `010_add_push_notifications.ts`
- `011_drop_employee_notifications_user_fk.ts`
- `012_add_suspended_employment_status.ts`
- `013_drop_employee_shifts_user_fk.ts` (drops tenant FK on `employee_shifts.user_id` for global-user UUID compatibility)
- Compatibility `.js` shim files exist for legacy entries recorded in `knex_migrations`
  (currently `001` to `012`) to prevent Knex "migration directory is corrupt" errors on older tenants.

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
- `employee.view_all_profiles`
- `employee.edit_work_profile`

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
- `bank_information.approve`

Permission migration note:
- Legacy `registration.view` is migrated to `employee_verification.view` in tenant migration `005_employee_verifications_expansion.ts`.

Auth behavior highlights (`apps/api/src/services/auth.service.ts`):
- Login authenticates against master `users`.
- Login `companySlug` is optional:
  - when provided, access is validated (`user_company_access` for regular users; superusers bypass assignment checks)
  - when omitted, company is auto-selected from `users.last_company_id` if valid, otherwise first accessible active company.
- Roles and permissions are loaded from master global RBAC tables.
- Company branch scope in JWT is loaded as all active branches of the selected company from tenant `branches`.
  - `user_company_branches` is treated as Odoo provisioning/presence snapshot for UI, not JWT auth scope.
- Refresh/logout use master `refresh_tokens`.
- Refresh tokens include a random `jti` claim at issue time to guarantee uniqueness per session issuance and avoid `refresh_tokens.token_hash` collisions during rapid repeated login/switch events.
- Super admin fallback login remains supported using master `super_admins`.
- Super admins (emails present in master `super_admins`) can sign in to any active company without explicit `user_company_access` assignment.
- Super admin sessions are granted full permission keys at token issue time (no manual per-company permission assignment required).
- `GET /auth/companies` lists accessible active companies for current user context switching.
- `POST /auth/switch-company` issues a new company-context token pair, updates `users.last_company_id`, and skips login reminder nudges.
- System role default permission sets are auto-synced (additive) during auth flows to prevent drift after resets/cutovers.

Role/permission management behavior:
- Role and permission CRUD endpoints are master-backed (`roles`, `permissions`, `role_permissions`) so admin edits match JWT permission source-of-truth.
- Service Crew default permission set includes dashboard, POS verification/session view, core account actions, and own-profile view/edit permissions.

## 7) API Surface Overview

Base path: `/api/v1`

Public/general routes:
- `GET /health`
- Auth:
  - `POST /auth/login` (`{ email, password }`, optional compatibility `companySlug`)
  - `POST /auth/refresh`
  - `POST /auth/logout`
  - `POST /auth/register-request` (`firstName`, `lastName`, `email`, `password`; no `companySlug`)
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
- `/shift-exchanges`
- `/employee-verifications`
- `/registration-requests` (compatibility alias for registration-only verification endpoints)
- `/employee-requirements`
- `/departments`
- `/employee-profiles`
- `/account/*`
- `/dashboard/*`

Global User Management endpoints (`/users`, admin-scoped):
- `GET /users`
  - Lists global users across all companies with:
    - global identity fields
    - global roles
    - `companies` (allowed login companies)
    - `companyBranches` snapshot (branches where Odoo employee provisioning/presence is recorded)
- `GET /users/assignment-options`
  - Returns global roles and active companies with active branch options for assignment/provisioning UI.
- `POST /users`
  - Creates global user, assigns global roles, applies company access, provisions Odoo employees for selected target branches, stores successful branch snapshot.
- `PUT /users/:id`
  - Updates global user profile fields and active status.
- `PUT /users/:id/roles`
  - Replaces global roles (`user_roles.assigned_by` written as `null`).
- `PUT /users/:id/branches`
  - Updates company assignments and Odoo target branches (provisioning targets, not JWT branch designation).
- `DELETE /users/:id`
  - Global soft-deactivate.
- `DELETE /users/:id/permanent`
  - Global permanent delete.

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

Registration approve payload (both approval surfaces):
- `roleIds: string[]`
- `companyAssignments: Array<{ companyId: string; branchIds: string[] }>`
- `residentBranch: { companyId: string; branchId: string }`

Registration compatibility endpoints (`/registration-requests`):
- `GET /registration-requests`
- `GET /registration-requests/assignment-options`
- `POST /registration-requests/:id/approve`
- `POST /registration-requests/:id/reject`

Employee Requirements manager endpoints (`/employee-requirements`):
- `GET /employee-requirements`
- `GET /employee-requirements/:userId`

Employee Profiles endpoints (`/employee-profiles`):
- `GET /employee-profiles`
  - Supports `status=all|active|resigned|inactive|suspended`, `page`, `pageSize`, `search`
  - Supports advanced filters: `departmentId`, `roleIdsCsv` (ANY match), `sortBy`, `sortDirection`
- `GET /employee-profiles/filter-options`
- `GET /employee-profiles/:userId`
- `PATCH /employee-profiles/:userId/work-information` (`employmentStatus` preferred; `isActive` compatibility accepted)

Shift Exchange endpoints (`/shift-exchanges`):
- `GET /shift-exchanges/options?fromShiftId=<uuid>`
- `POST /shift-exchanges` (`fromShiftId`, `toShiftId`, `toCompanyId`)
- `GET /shift-exchanges/:id`
- `POST /shift-exchanges/:id/respond` (`action=accept|reject`, optional reason)
- `POST /shift-exchanges/:id/approve`
- `POST /shift-exchanges/:id/reject` (required `reason`)

My Account verification/requirements endpoints (`/account`):
- `GET /account/profile`
- `PATCH /account/email`
- `POST /account/personal-information/verifications`
- `POST /account/bank-information/verifications`
- `POST /account/valid-id` (multipart field: `document`)
- `GET /account/employment/requirements`
- `POST /account/employment/requirements/:requirementCode/submit` (multipart field: `document`)
- Push endpoints:
  - `GET /account/push/config`
  - `GET /account/push/preferences`
  - `PATCH /account/push/preferences`
  - `POST /account/push/subscriptions`
  - `DELETE /account/push/subscriptions`

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
- Notification offline detection for push uses `/notifications` room presence (`user:{userId}` has zero sockets => offline).

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
- Registration request creation is global (`master.registration_requests`) and no longer includes a company selector.
- Approval validates:
  - `roleIds` (required, global roles)
  - `companyAssignments` (required, at least one branch per selected company)
  - `residentBranch` (required and must be part of selected branches)
- Resolves or creates global identity (`employee_identities`) by normalized email.
- Encrypts password at rest for requests; decrypts only during approval (`apps/api/src/utils/secureText.ts`).
- Uses global employee number with barcode collision checks against Odoo.
- Resolves one shared PIN per approval run:
  - Reuse existing PIN for same `x_website_key` if present.
  - Otherwise generate one random 4-digit PIN and apply to all branches.
- Creates/updates `hr.employee` across active branches with prefixed name and barcode.
- Registration approval always also creates/updates one `hr.employee` on Odoo `company_id = 1`.
- Creates/updates global user + role assignments + company access/branch scope in master tables.
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
- Current expanded personal verification fields include:
  - name, birthday, gender, address
  - SSS, TIN, Pag-IBIG, PhilHealth, marital status
  - emergency contact name/phone/relationship
- Odoo sync scope on personal verification approval:
  - synced: name, email, mobile, legal name, birthday, gender, address (`private_street`), emergency contact name/phone
  - tenant DB only (not synced to Odoo): SSS, TIN, Pag-IBIG, PhilHealth, marital status, emergency relationship

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
  - login link with redirect to profile tab (`/login?redirect=/account/profile`)
  - optional `companySlug` query for preselection

Login-triggered employee notifications (`auth.service.ts`):
- `Complete Your Profile` when profile is not yet marked updated.
- `Submit Your Requirements` when zero requirements submitted.
- `Complete Your Requirements` when some but not all submitted.

Verification decision notifications:
- Personal information and employment requirement submit/approve/reject paths create `employee_notifications` and emit realtime notification events.
- Shift assignment notifications:
  - Planning slot upsert flow (`webhook.service.ts` -> `processEmployeeShift`) sends `New Shift Assigned`
    when a shift is newly assigned or reassigned to a different user.
  - Notification link target is `/account/schedule`.
- Shift exchange notifications:
  - Accepting employee receives `Shift Exchange Request` and can open details/actions from Notifications.
  - Employee acceptance moves request to HR stage and notifies Human Resources (fallback Management) across involved companies.
  - Employee reject (optional reason) notifies requester and resolves request as rejected.
  - HR reject requires reason and notifies both employees.
  - HR approval performs Odoo planning-slot draft -> resource swap -> publish flow, then notifies both employees.
- Notification fanout is centralized in `apps/api/src/services/notification.service.ts`:
  - writes `employee_notifications`
  - emits realtime `/notifications` socket events
  - sends web push when all conditions are met:
    - `WEB_PUSH_ENABLED` + VAPID config are valid
    - user has `push_notifications_enabled = true`
    - user has no active socket connection in `/notifications` room `user:{userId}` (offline-only push policy)
    - user has at least one active `push_subscriptions` record
- Failed web push deliveries increment failure metadata and deactivate subscriptions on provider `404/410`.

## 11) Tenant-Rooted S3 Storage and Company Hard Delete

Storage service source:
- `apps/api/src/services/storage.service.ts`

Tenant-rooted object key strategy:
- `buildTenantStoragePrefix(companyStorageRoot, ...parts)`
- `companyStorageRoot` is derived from slug + environment suffix:
  - production: `${company.slug}-prod`
  - non-production: `${company.slug}-dev`

Current upload paths:
- Cash requests: `${companyStorageRoot}/Cash Requests/${userId}`
- Valid IDs: `${companyStorageRoot}/Valid IDs/${userId}`
- Employment requirements: `${companyStorageRoot}/Employment Requirements/${userId}/${requirementCode}`
- Profile pictures: `${companyStorageRoot}/Profile Pictures/${userId}`
- POS verification images: `${companyStorageRoot}/POS Verifications/${userId}`

Company hard delete flow (`apps/api/src/services/company.service.ts`):
1. Validate current tenant user is an active superuser (email exists in master `super_admins`).
2. Re-authenticate with submitted super-admin credentials and enforce same email as current session.
3. Validate typed company name matches current company name.
4. Set `companies.is_active = false` immediately.
5. Revoke tenant refresh tokens.
6. Emit `auth:force-logout` to tenant users (best effort).
7. Storage cleanup in order:
   - Recursive tenant prefix sweep: `${companyStorageRoot}/`
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
- Dashboard topbar is sticky on mobile (`<= 767px`) and stays fixed at the top while content scrolls.
- Branch designation is no longer auto-applied from user branch assignment updates; designation changes are driven by active shift/check-in flow.
- Sidebar top company header is an interactive button (with right-side chevron) for users with multiple accessible companies.
- Clicking the company header toggles an animated floating dropdown list of accessible companies with theme-color indicator dots.
- Company switch applies new company theme and redirects to `/dashboard`.
- Mobile drawer close UX:
  - floating top-right `X` close button removed
  - overlay includes a visible left-chevron hint that follows drawer slide animation and indicates tap-to-close behavior.

Login page (`apps/web/src/features/auth/components/LoginForm.tsx`):
- Modes:
  - Sign In
  - Register (submits `/auth/register-request`)
  - Create Company (super-admin driven)
- Supports `redirect` query param and optional `companySlug` preselection.
- Register form no longer includes company selection.
- Sign In no longer includes company selection; backend auto-selects company context.

Employee Verifications UI:
- Card list with right-side detail panel for approve/reject actions.
- Type tabs: Registration, Personal Information, Employment Requirements, Bank Information.
- Status tabs order: All, Pending, Approved, Rejected (default Pending).
- Registration approval panel includes backend progress log stream from realtime event.
- Registration approval now requires:
  - global role selection
  - company selection
  - per-company branch selection
  - single resident branch selection across selected branches
- The same registration assignment model is used in `/registration-requests` approval UI.

My Account Profile tab and Employee Requirements page:
- Requirement cards support image/PDF previews (inline modal).
- Status language uses Incomplete for not-yet-submitted state.
- Profile personal verification form is grouped into subsections:
  - Personal Information
  - Private Contact
  - Government Identification & Contributions
- POS PIN Code UI is placed under the `Work Information` section in the Profile tab.
- Work Information now shows company, resident branch, home resident branch (when current company is non-resident), and borrow branches.
- Valid ID upload updates only valid-ID state and requirements state; it does not rehydrate profile form fields,
  so in-progress Profile input is preserved until a hard browser refresh/page reload.
- Pending verification helper text for Personal and Bank sections is rendered directly below each disabled submit button.
- Settings tab includes a single global Device Notifications on/off control, browser permission prompt, and push subscription lifecycle calls to `/account/push/*`.
- Profile, valid-ID upload, employment requirement valid-ID reuse, and settings user reads/writes are resolved against master `users` (not tenant `users`), preventing `User not found` for global-user UUID sessions.

Employee Schedule page:
- Filter panel now uses staged controls with explicit `Clear`, `Apply`, and `Cancel` actions (instead of live-apply on input change).
- Displays small `Filters applied` helper text when any non-default filter is active.
- `Pending Approvals` filter control is rendered as a toggle switch (not a checkbox).
- Mobile filter toggle header groups icon/label/badge together on the left, with chevron on the right.
- Exchange Shift is enabled for owner-open shifts when the signed-in user is not suspended.
  - Clicking Exchange Shift opens a two-step modal:
    - Step 1: eligible open shifts (same-company and inter-company, filtered by suspension + pending-request rules)
      - same-company: not gated by cross-branch designation
      - inter-company: requires bilateral destination designation checks using master `user_company_branches`
        with tenant `user_branches` fallback enrichment
    - Step 2: Confirm/Cancel prompt targeting the selected employee.

Employee Profiles page:
- Uses card list + right-side detail panel.
- Data scope is global across assigned users (not limited to the currently selected company context).
  - one card per user across all active company assignments.
- Card summary includes `PIN` alongside Department/Position/Mobile.
- Superuser accounts (emails present in master `super_admins`) are excluded from Employee Profiles list/detail/work-update flows.
- Responsive pagination is enabled for card list:
  - Desktop: 12 cards per page
  - Mobile: 6 cards per page
- Status model supports `Active`, `Resigned`, `Inactive`, and `Suspended` (work edit + filters + badges).
- Employee Profiles controls now mirror Employee Schedule layout:
  - status tabs + single filter toggle row
  - filter panel contains search + advanced filters
- Filter button provides: department dropdown, roles filter, sort by date started, sort by days of employment.
- Filter button is toggleable (click again to hide filter panel).
- Mobile filter toggle header groups icon/label/badge together on the left, with chevron on the right.
- Panel includes conditional call actions:
  - `Call Employee` (shown only when employee mobile exists)
  - `Call Emergency` (shown only when emergency phone exists)
- Call links use `tel:` and normalize common PH formats (`+639...`/`639...` -> `09...`) in display and dial target.
- Work Information edit in the detail panel now shows explicit in-panel success/error feedback on save.
- Work Information panel displays company/resident/home-resident/borrow branch fields from master-backed branch assignments.
- Company and Borrow Branch displays use compact chips with overflow compaction (`+XX more`) when counts exceed the visible limit.
- Company chips in Employee Profiles are theme-aware and use each company's `theme_color`.
- Work Information edit now includes resident branch editing:
  - resident company selector
  - resident branch selector (filtered by selected resident company)
  - save updates global `user_company_branches.assignment_type` to enforce exactly one resident branch and set other assigned branches to borrow.

My Account Schedule + Notifications + Authorization Requests:
- My Account Schedule now enables owner-open shift exchange with the same two-step flow used in Employee Schedule.
- Notifications tab recognizes shift-exchange links and opens a detailed request modal showing both shifts and action buttons.
- Authorization Requests service-crew list now includes `shift_exchange` items with stage-aware labels:
  - `Awaiting Employee Acceptance`
  - `Pending HR Approval`
- Shift exchange details/actions in Authorization Requests are served through `/shift-exchanges/:id*` endpoints and enforce HR/fallback-management policy server-side.

User Management page:
- Hard-cutover to global master-backed user management (no tenant-local admin user CRUD path).
- Lists users globally across companies, showing:
  - global roles
  - company access (which companies user can log into)
  - per-company branch snapshot for Odoo employee provisioning/presence.
- Uses card-list + right-side detail panel interaction (selection opens editable user panel).
- Create/edit flows use:
  - global role assignment
  - company selection
  - per-company branch targets used for Odoo employee provisioning.
- User Management Odoo provisioning reuses an existing 4-digit employee PIN for the same `x_website_key` when present;
  only generates a new PIN when no existing employee PIN is found.
- User Management create flow now attempts best-effort bank auto-fill from Odoo:
  - reads first employee-linked `bank_account_id` from `hr.employee` by `x_website_key`
  - resolves `res.partner.bank` (`bank_id`, `acc_number`)
  - writes master `users.bank_id` and `users.bank_account_number` when valid
  - never blocks user creation if Odoo lookup fails.
- Company and branch summaries are displayed as pills with overflow compaction (`+N more`) when counts exceed display limits.
- Branch target selection in User Management is not used as JWT branch authorization scope.

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
- When adding new runtime features, avoid tenant joins to `users`/`roles`; hydrate user data from master DB by UUIDs.
- Socket namespace permission guards are enforced per namespace.

Known risks/gaps:
- Company hard delete is intentionally non-transactional across DB + storage + queue cleanup.
- Storage and queue cleanup are best effort; warning payloads must be monitored.
- Compatibility alias `/registration-requests` is temporary and should be removed after client transition.
- Legacy migration helper `apps/api/src/scripts/migration.ts` may diverge from standard migration flow.

This file should be updated whenever route contracts, permission keys, migrations, realtime contracts, queue behavior, storage topology, or deletion behavior changes.

