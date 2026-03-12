# Skill: Multi-Tenant Database Rules

## The Model
- **Master DB** — global metadata. One instance, always.
- **Tenant DB** — one per company. Operational records only.

## Master DB owns (never read these from tenant)
- `users` — canonical global identity, auth, profile
- `roles`, `permissions`, `role_permissions`, `user_roles` — all RBAC
- `user_company_access` — which companies a user can log into
- `user_company_branches` — Odoo provisioning snapshot (NOT auth scope, see below)
- `companies`, `company_databases`, `super_admins`, `employee_identities`
- `refresh_tokens`, `registration_requests`, `shift_exchange_requests`

## Tenant DB owns (operational records)
- `employee_shifts`, `shift_authorizations`, `shift_logs`
- `personal_information_verifications`, `bank_information_verifications`
- `employment_requirement_types`, `employment_requirement_submissions`
- `authorization_requests`, `cash_requests`
- `departments`, `pos_verifications`, `pos_sessions`
- `push_subscriptions`, `employee_notifications`
- `branches` (active branch list used for JWT scope)
- `store_audits` (CSS and compliance audits — type discriminator column)

## Critical rules

**Never join tenant tables to hydrate users or roles.**
All user identity, profile, and permission resolution must query master DB using global UUIDs. Legacy tenant `users`/`roles` references exist only in `scripts/migration.ts` and `services/databaseProvisioner.ts` for bootstrapping — do not replicate this pattern in runtime code.

**`user_company_branches` is an Odoo provisioning snapshot — not JWT auth scope.**
JWT branch scope = all active branches of the selected company from tenant `branches`. Do not use `user_company_branches` to gate any runtime access or permission check.

**`employee_notifications.user_id` stores global UUIDs with no FK to tenant `users`.**
This is intentional. Do not add that FK.

**`store_audits.auditor_user_id` stores global UUIDs with no FK to tenant `users`.**
Same pattern as `employee_notifications.user_id`. Do not add that FK.

**`store_audits` partial unique index enforces the one-active-audit-per-auditor constraint.**
`CREATE UNIQUE INDEX store_audits_one_active_per_auditor ON store_audits(auditor_user_id) WHERE status = 'processing'`. This also acts as race-condition protection for concurrent claim requests — a duplicate constraint error is caught by the API and returned as 409.

**`users.css_audits` and `users.compliance_audit` live on master `users`.**
CSS audit results (star rating log) and compliance audit results (latest answers) are stored on master `users` — not in tenant DB. This follows the rule: user data lives on master.

**`req.companyContext` is your runtime company handle.**
Populated by `middleware/companyResolver.ts`. Fields: `companyId`, `companySlug`, `companyName`, `companyStorageRoot`. The resolver enforces `companies.is_active = true` before resolving the tenant DB — this is a security boundary, do not short-circuit it.

**New runtime endpoints must follow master-first pattern.**
When building new features: read user data from master by UUID, write operational data to tenant DB, never the reverse.
