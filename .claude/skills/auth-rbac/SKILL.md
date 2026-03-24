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
admin.manage_roles | admin.manage_users | admin.manage_branches
admin.view_all_branches | admin.toggle_branch

dashboard.view | dashboard.view_performance_index | dashboard.view_payslip

pos_verification.view | pos_verification.confirm_reject | pos_verification.upload_image
pos_session.view | pos_session.audit_complete

account.view_schedule | account.view_auth_requests
account.submit_private_auth_request | account.submit_public_auth_request
account.view_cash_requests | account.submit_cash_request | account.view_notifications

employee.view_own_profile | employee.edit_own_profile
employee.view_all_profiles | employee.edit_work_profile

shift.view_all | shift.approve_authorizations | shift.end_shift

auth_request.approve_management | auth_request.view_all | auth_request.approve_service_crew
cash_request.view_all | cash_request.approve

employee_verification.view | registration.approve
personal_information.approve | employee_requirements.approve | bank_information.approve

store_audit.view | store_audit.process

case_report.view | case_report.create | case_report.close | case_report.manage

violation_notice.view | violation_notice.create | violation_notice.confirm
violation_notice.reject | violation_notice.issue | violation_notice.complete | violation_notice.manage
```

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
