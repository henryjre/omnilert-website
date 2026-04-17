---
name: auth-rbac
description: Auth & RBAC patterns for Omnilert — JWT flow, company switching, super admins, permission keys, companyContext middleware, socket namespace guards. Read this before writing any auth, permission check, middleware, login flow, or socket namespace code.
type: reference
---

# Skill: Auth & RBAC

## Auth Flow

1. `POST /auth/login` with `{ email, password, companySlug? }`.
2. `companySlug` optional:
   - Provided → validated via `user_company_access` (`is_active = true`). Super admins bypass.
   - Omitted → resolves via `users.last_company_id`, fallback to first accessible active company.
3. JWT issued with: global roles, all permission keys for those roles, all active branch IDs of the selected company.
4. `POST /auth/switch-company` → issues new token pair, updates `users.last_company_id`.
5. `POST /auth/refresh` → issues new token pair using `refresh_tokens.jti` (random per issuance).
6. System role default permission sets are additive-synced during auth flows — do not manually patch permissions after role resets.

## Super Admins

- Identified by email match in `super_admins` table (platform-level, not company-scoped).
- Bypass `user_company_access` — can sign in to any active company.
- Receive full permission key set at token issue; no manual per-company assignment needed.
- Excluded from Employee Profiles list/detail/work-update flows.
- Super admin routes use a separate JWT secret (`SUPER_ADMIN_JWT_SECRET`), not the tenant JWT secret.

## Token Contents

```ts
// Decoded JWT payload
{
  sub: string            // userId
  companyId: string
  companySlug: string
  permissions: PermissionKey[]   // all keys granted by user's roles
  branchIds: string[]            // all active branches of selected company
  roles: string[]                // role names
}
```

Frontend parses JWT client-side (no server call for claims). Auto-refreshes on 401 with dual-token pattern.

## Middleware Stack (per protected route)

```
validateBody(zodSchema)       → 400 with field errors on invalid body
authenticate                  → verifies JWT, populates req.user
resolveCompany                → populates req.companyContext (enforces is_active = true)
requirePermission(...keys)    → user must hold ALL listed keys
requireAnyPermission(...keys) → user must hold AT LEAST ONE key
```

## `req.companyContext` — Runtime Company Handle

Populated by `middleware/companyResolver.ts`. Fields:

```ts
req.companyContext = {
  companyId: string
  companySlug: string
  companyName: string
  companyStorageRoot: string   // e.g. "brandx-prod" or "brandx-dev"
}
```

The resolver enforces `companies.is_active = true` before resolving — this is a security boundary. Do not short-circuit it.

**No more `req.tenantDb`.** Services receive `companyId` from `req.companyContext` and scope queries:

```ts
db.getDb()('table').where('company_id', companyId)
// or the helper:
scopedQuery('table', companyId)
```

## All Permission Keys (56 total)

Source of truth: `packages/shared/src/constants/permissions.ts`

```
// Administration (5)
admin.manage_roles | admin.manage_users | admin.view_all_branches
admin.manage_companies | admin.manage_departments

// Point of Sale (3)
pos.view | pos.manage_verifications | pos.manage_audits

// Account / My Account (8)
account.view_schedule | account.manage_schedule | account.manage_auth_request
account.submit_private_auth_request | account.manage_cash_request
account.manage_employee_requirements | account.view_audit_results
account.view_token_pay

// Authorization Requests (5)
auth_request.view_page | auth_request.view_private | auth_request.view_public
auth_request.manage_private | auth_request.manage_public

// Employee Verifications (5)
employee_verification.view_page | employee_verification.manage_registration
employee_verification.manage_personal | employee_verification.manage_requirements
employee_verification.manage_bank

// Case Reports (2)
case_report.view | case_report.manage

// Store Audits (2)
store_audit.view | store_audit.manage

// Employee Profiles (2)
employee_profiles.view | employee_profiles.manage_work

// Employee Schedule (3)
schedule.view | schedule.manage_shift | schedule.end_shift  ← legacy, keep for compat

// Violation Notices (2)
violation_notice.view | violation_notice.manage

// Workplace Relations (1)
workplace_relations.view

// Cash Requests (2)
cash_requests.view | cash_requests.manage

// Token Pay (4)
token_pay.view | token_pay.issue | token_pay.manage | token_pay.account_manage

// Analytics (4)
analytics.view_employee_analytics | analytics.view_profitability_analytics
analytics.view_pos_analytics | analytics.view_product_analytics
```

**Never rename or delete a permission key without a migration.** Existing role assignments reference keys by string value — renaming silently breaks them.

## Permission Prerequisites

`PERMISSION_PREREQUISITES` in `packages/shared/src/constants/permissions.ts` defines direct parent keys. The role editor UI walks transitively when enabling. **These are UI-only — not enforced on the backend.** The backend checks only whether the user holds the specific key.

Key prerequisites (single-hop):
- `pos.manage_verifications` and `pos.manage_audits` → `pos.view`
- `auth_request.view_*` and `auth_request.manage_*` → `auth_request.view_page`
- `employee_verification.manage_*` → `employee_verification.view_page`
- `case_report.manage` → `case_report.view`
- `store_audit.manage` → `store_audit.view`
- `token_pay.issue / .manage / .account_manage` → `token_pay.view`
- `account.manage_schedule` → `account.view_schedule`

## `user_company_branches` is an Odoo Provisioning Snapshot — Not JWT Auth Scope

JWT branch scope = all active branches of the selected company from `branches`. Do **not** use `user_company_branches` to gate runtime access or permission checks.

## Socket Namespace Auth

All Socket.io namespaces share a global JWT auth middleware. Permission guards are then enforced **per namespace** — a valid JWT alone is not sufficient for all namespaces.

## Realtime Namespaces & Rooms

```
Namespaces:
  /pos-verification         (requires pos.view)
  /pos-session              (requires pos.view)
  /employee-shifts          (requires schedule.view or schedule.manage_shift)
  /employee-verifications   (requires employee_verification.view_page)
  /employee-requirements    (requires employee_verification.view_page)
  /notifications            (all authenticated users)
  /store-audits             (requires store_audit.view)
  /case-reports             (requires case_report.view)
  /violation-notices        (requires violation_notice.view)

Rooms:
  branch:{branchId}         — events scoped to a branch
  company:{companyId}       — events scoped to a company
  user:{userId}             — per-user events and push eligibility

/case-reports uses room company:{companyId} only (not branch rooms).
/violation-notices uses room company:{companyId} only.

Push offline rule:
  User has zero sockets in /notifications room user:{userId} → eligible for web push.
```
