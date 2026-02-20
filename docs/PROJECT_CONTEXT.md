# Omnilert Project Context

This document is for AI and engineer handoff. It captures the current implementation state of the repository.

## 1) System Purpose and Domain

Omnilert is a multi-tenant internal operations platform for branch-based businesses.

Core responsibilities:
- Receive and process Odoo webhook payloads.
- Run POS verification and POS session workflows.
- Track employee shifts, logs, and authorization approvals.
- Support employee self-service pages in My Account.
- Provide role-based administration for users, roles, branches, and company settings.

Primary business context:
- Branch operations in Philippines-based deployments.
- Currency and date display in UI are typically localized for Philippine usage.

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

Key frontend areas (`apps/web/src`):
- `app/` router and app shell
- `features/` domain pages and components
- `shared/components/ui` reusable UI components
- `shared/services/api.client.ts` axios client and token refresh handling
- `shared/hooks/useSocket.ts` socket namespace connector

## 3) Source-of-Truth Config and Startup Flow

Environment schema source of truth:
- `apps/api/src/config/env.ts`

Required/defined API env vars:
- Server: `PORT`, `NODE_ENV`, `CLIENT_URL`
- Master DB: `MASTER_DB_HOST`, `MASTER_DB_PORT`, `MASTER_DB_NAME`, `MASTER_DB_USER`, `MASTER_DB_PASSWORD`
- JWT: `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`
- Uploads: `UPLOAD_DIR`, `MAX_FILE_SIZE`
- Spaces (optional): `DO_SPACES_ENDPOINT`, `DO_SPACES_CDN_ENDPOINT`, `DO_SPACES_KEY`, `DO_SPACES_SECRET_KEY`, `DO_SPACES_BUCKET`
- Odoo: `ODOO_DB`, `ODOO_URL`, `ODOO_USERNAME`, `ODOO_PASSWORD`
- Queue: `QUEUE_SCHEMA`, `EARLY_CHECKIN_QUEUE_NAME`, `EARLY_CHECKIN_RETRY_LIMIT`

Canonical env example file:
- `apps/api/.env.example`

Root startup scripts (`package.json`):
- `pnpm up:dev`: runs API master migration, tenant migration, then `turbo dev`
- `pnpm up:prod`: runs migrations, build, then starts API and web preview concurrently
- `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm clean`

## 4) Multi-Tenant Data Model and Migration Model

Tenant strategy:
- One master database for global metadata.
- One tenant database per company.

Master DB tables (key):
- `companies` (includes `theme_color`)
- `super_admins`
- `company_databases` (tracks tenant migration state)

Tenant DB migration model:
- Migration files: `apps/api/src/migrations/tenant`
- Current baseline file: `001_baseline.ts`
- Multi-tenant migration service: `apps/api/src/services/tenantMigration.service.ts`

Operational scripts (`apps/api/src/scripts`):
- `migrate-tenants.ts`
- `migration-status-tenants.ts`
- `rollback-tenants.ts`
- `migration.ts` (legacy one-time helper; not the normal migration path)

Production migration approach:
- Run `migrate:master` and `migrate:tenant` once in a controlled deploy step.
- Start app instances only after successful migration completion.

## 5) Auth and RBAC (Current Permission Keys)

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

Token behavior:
- Access token payload carries company and branch scope.
- Refresh token rotation is implemented in `auth.service.ts`.
- Frontend persists refresh token and user metadata in Zustand.

## 6) API Surface Overview

Base path: `/api/v1`

Public route groups:
- `GET /health`
- Auth: `/auth/login`, `/auth/refresh`, `/auth/logout`
- Super company public:
  - `GET /super/companies`
  - `POST /super/companies/register`
- Odoo webhooks: `/webhooks/odoo/*`

Authenticated route groups (company scoped via middleware where applicable):
- `/auth/me`
- `/super/companies/current` (Administrator-only guard in controller)
- `/branches`, `/roles`, `/users`, `/permissions`
- `/pos-verifications`, `/pos-sessions`
- `/employee-shifts`, `/shift-authorizations`
- `/authorization-requests`, `/cash-requests`
- `/account/*` including:
  - `/account/schedule`
  - `/account/schedule-branches`
  - `/account/schedule/:id`
  - authorization requests, cash requests, notifications
  - token pay detail endpoint
- `/dashboard/*`

Notable account schedule behavior:
- `/account/schedule` returns all own shifts (not future-only) sorted by `shift_start`.
- Each shift row includes `branch_name` from joined `branches`.

## 7) Realtime Model (Socket.IO)

Socket config:
- `apps/api/src/config/socket.ts`

Namespaces:
- `/pos-verification`
- `/pos-session`
- `/employee-shifts`
- `/notifications`

Room model:
- Branch-scoped rooms: `branch:{branchId}`
- User-scoped notifications room: `user:{userId}`

Common server events:
- POS: `pos-verification:new`, `pos-verification:updated`, `pos-verification:image-uploaded`
- Sessions: `pos-session:new`, `pos-session:updated`
- Shifts: `shift:new`, `shift:updated`, `shift:deleted`, `shift:log-new`, `shift:authorization-new`, `shift:authorization-updated`
- Notifications: `notification:new`, `notification:count`, `user:branch-assignments-updated`

Frontend behavior:
- `useSocket` connects per namespace with access token.
- Top bar listens for branch assignment updates and shift events to keep selected branch state synchronized.

## 8) Queue Subsystem (Delayed Early Check-In Authorization)

Queue implementation:
- `apps/api/src/services/attendanceQueue.service.ts`
- Uses `pg-boss` backed by master Postgres schema (default `pgboss`).

Startup lifecycle:
- Initialized in `apps/api/src/server.ts` via `initAttendanceQueue()`.
- Gracefully stopped on shutdown via `stopAttendanceQueue()`.

Behavior:
- When attendance check-in is early and shift start is in the future, webhook path schedules a queue job for `shift_start + 1 minute`.
- Worker rechecks shift/log state before insert.
- Worker creates `early_check_in` authorization only when still valid.

Idempotency and duplicate protection:
- Deterministic singleton key: `companyDbName:shiftLogId:early_check_in`.
- Worker skips insert if matching authorization already exists.
- Worker no-ops safely for missing/invalid shift or log states.

## 9) Notable Current Features

Authentication and company onboarding:
- Login page supports company selection and sign in.
- Login page also supports public company registration with initial admin credentials.
- Successful company registration auto-logs in the new admin user.

Company theming and admin company settings:
- Company theme color stored in master `companies.theme_color`.
- Login returns `companyThemeColor`; frontend applies theme variables at runtime.
- Admin route `/admin/company` allows editing company name and theme color.
- Sidebar shows company name under the Omnilert brand label.

Scheduling and branch behavior:
- My Account schedule can display shifts across all branches where the user has rows.
- Branch names come from API (`branch_name`) with fallback to `Unknown Branch`.
- My Account schedule has filter UX aligned with Employee Schedule, with branch/date/sort controls.
- Top bar branch selection auto-syncs on relevant realtime shift activity.

UI actions and intent colors:
- Shared button supports `success`, `danger`, and `standard` intents.
- Approve/Confirm/Save Changes actions are mapped to success intent.
- Reject actions are mapped to danger intent.

## 10) Operational Runbooks

Development boot:
1. Start Postgres (for local Docker setup): `docker-compose up -d`
2. Install deps: `pnpm install`
3. Create API env file from `apps/api/.env.example`
4. Start: `pnpm up:dev`

Production runbook (recommended):
1. Controlled migration job:
   - `pnpm -C apps/api migrate:master`
   - `pnpm -C apps/api migrate:tenant`
2. Build artifacts:
   - `pnpm build`
3. Start app processes separately:
   - `pnpm -C apps/api start`
   - `pnpm -C apps/web preview -- --host`

Rollback support:
- Tenant rollback script exists (`migrate:tenant:rollback`) and should be used cautiously in controlled ops windows.

## 11) Engineering Guardrails

Do not casually change without impact analysis:
- JWT payload shape and refresh rotation in `auth.service.ts`.
- Permission keys in `packages/shared/src/constants/permissions.ts`.
- Tenant migration flow and `company_databases` version tracking.
- Socket auth and namespace permission checks.
- Queue singleton and recheck logic for early check-in jobs.

DB and migration guardrails:
- Master migrations and tenant migrations have different lifecycles.
- Tenant changes must be applied across all active company databases.
- Avoid ad hoc schema drift outside migration scripts.

Security guardrails:
- Never commit real secrets or production credentials.
- Keep `.env` untracked; keep placeholders in `.env.example` only.

## 12) Known Risks and Gaps

Operational:
- No dedicated queue admin UI; monitoring relies on logs and DB inspection.
- `apps/api/src/scripts/migration.ts` is a legacy one-time script and may diverge from standard migration flows.

Product/technical debt:
- Several dashboards still depend on placeholder or partial integrations.
- Some frontend files include encoding artifacts from prior edits; avoid propagating non-UTF8 text.

This file should be updated whenever route contracts, permission keys, migration strategy, or queue behavior changes.

