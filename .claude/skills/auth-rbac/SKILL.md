# Skill: Auth & RBAC

## Auth Flow

- Login authenticates against `users`.
- `companySlug` is optional on login:
  - provided → validates via `user_company_access` (superusers bypass this)
  - omitted → auto-selects from `users.last_company_id`, fallback to first accessible active company
- JWT contains: global roles/permissions + all active branches of selected company (from `branches`).
- `POST /auth/switch-company` → issues new token pair, updates `users.last_company_id`.
- Refresh tokens stored in `refresh_tokens` with random `jti` per issuance.
- System role default permission sets are additive-synced during auth flows — do not manually patch permissions after role resets.

## Super Admins

- Identified by email present in `super_admins`.
- Bypass `user_company_access` — can sign in to any active company.
- Receive full permission key set at token issue time. No manual per-company assignment needed.
- Excluded from Employee Profiles list/detail/work-update flows.
- Super admin routes use a separate JWT (`SUPER_ADMIN_JWT_SECRET`), not the tenant JWT.

## RBAC Source of Truth

Permission keys defined in: `packages/shared/src/constants/permissions.ts`
Role/permission CRUD is backed by global `roles`, `permissions`, `role_permissions` tables.

**Never rename or delete a permission key without a migration.** Existing role assignments reference keys by string — renaming silently breaks them.

## All Permission Keys

```text
admin.manage_roles | admin.manage_users | admin.view_all_branches | admin.manage_companies | admin.manage_departments

pos.view | pos.manage_verifications | pos.manage_audits

account.view_schedule | account.manage_schedule | account.manage_auth_request | account.submit_private_auth_request | account.manage_cash_request | account.manage_employee_requirements | account.view_audit_results

auth_request.view_page | auth_request.view_private | auth_request.view_public | auth_request.manage_private | auth_request.manage_public

employee_verification.view_page | employee_verification.manage_registration | employee_verification.manage_personal | employee_verification.manage_requirements | employee_verification.manage_bank

case_report.view | case_report.manage

store_audit.view | store_audit.manage

employee_profiles.view | employee_profiles.manage_work

schedule.view | schedule.end_shift

violation_notice.view | violation_notice.manage

workplace_relations.view

cash_requests.view | cash_requests.manage
```

## Permission Prerequisites

`PERMISSION_PREREQUISITES` in `packages/shared/src/constants/permissions.ts` encodes prerequisite relationships between permission keys (e.g., `pos.manage_verifications` requires `pos.view`). These are **UI-only** — the role editor walks the chain transitively when enabling permissions. They are **not enforced on the backend**; the backend checks only whether the user holds the specific permission key.

## `req.companyContext` is your runtime company handle

Populated by `middleware/companyResolver.ts`. Fields: `companyId`, `companySlug`, `companyName`, `companyStorageRoot`. The resolver enforces `companies.is_active = true` before resolving — this is a security boundary, do not short-circuit it.

**No more `req.tenantDb`.** Controllers extract `companyId` from `req.companyContext` and pass it to services. Services use `db.getDb()(table).where('company_id', companyId)` or the `scopedQuery(table, companyId)` helper.

## `user_company_branches` is an Odoo provisioning snapshot — not JWT auth scope

JWT branch scope = all active branches of the selected company from `branches`. Do not use `user_company_branches` to gate any runtime access or permission check.

## Socket Namespace Auth

Permission guards are enforced per namespace — do not assume a valid JWT is sufficient for all namespaces.

## Realtime Namespaces & Rooms

Namespaces: `/pos-verification`, `/pos-session`, `/employee-shifts`, `/employee-verifications`, `/employee-requirements`, `/notifications`, `/store-audits`, `/case-reports`, `/violation-notices`

Rooms: `branch:{branchId}`, `company:{companyId}`, `user:{userId}`

`/case-reports` namespace uses room `company:{companyId}` only.
`/violation-notices` namespace uses room `company:{companyId}` only.
Push offline rule: user has zero sockets in `/notifications` room `user:{userId}` → eligible for web push.
