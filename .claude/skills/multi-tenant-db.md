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
- `case_reports`, `case_messages`, `case_attachments`, `case_reactions`, `case_participants`, `case_mentions` (case reporting system)
- `violation_notices`, `violation_notice_targets`, `violation_notice_messages`, `violation_notice_attachments`, `violation_notice_reactions`, `violation_notice_participants`, `violation_notice_mentions`, `violation_notice_reads` (violation notice workflow)

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

**`users.css_audits`, `users.compliance_audit`, `users.violation_notices`, and `users.rewards` live on master `users`.**
CSS audit results (star rating log), compliance audit results (latest answers), completed VN records, and future rewards are all stored as JSONB on master `users` — not in tenant DB. This follows the rule: user data lives on master.

- `css_audits`: JSONB array, each entry `{ audit_id, star_rating, audited_at }`. Appended on CSS audit completion.
- `compliance_audit`: JSONB object (latest only) `{ audit_id, answers: {...}, audited_at }`. Replaced on compliance audit completion.
- `violation_notices`: JSONB array, each entry `{ vn_id, vn_number, company_id, description, completed_at }`. Appended by `appendViolationNoticeToTargetUsers()` in `violationNotice.service.ts` when a VN is completed. Write is best-effort (errors logged, do not fail the completion response).
- `rewards`: JSONB array, default `[]`. Reserved for future use.

**`req.companyContext` is your runtime company handle.**
Populated by `middleware/companyResolver.ts`. Fields: `companyId`, `companySlug`, `companyName`, `companyStorageRoot`. The resolver enforces `companies.is_active = true` before resolving the tenant DB — this is a security boundary, do not short-circuit it.

**New runtime endpoints must follow master-first pattern.**
When building new features: read user data from master by UUID, write operational data to tenant DB, never the reverse.

**`case_messages` global UUID columns store global master UUIDs with no FK.**
`case_messages.user_id`, `case_reports.created_by`, `case_reports.closed_by`, `case_attachments.uploaded_by`, `case_mentions.mentioned_user_id` — same no-FK pattern as `employee_notifications.user_id`. Do not add FKs to tenant `users`.

**`case_messages` soft-delete pattern.**
Messages are never hard-deleted. Set `is_deleted = true`, `deleted_by = userId`, and update `content` to `"<Name> deleted this message"`. Attachments are deleted from S3 after the transaction commits (best-effort, errors swallowed). This preserves the row for threaded reply context.

**`violation_notice_messages` global UUID columns store global master UUIDs with no FK.**
`violation_notices.created_by`, `violation_notices.confirmed_by`, `violation_notices.issued_by`, `violation_notices.completed_by`, `violation_notices.rejected_by`, `violation_notice_targets.user_id`, `violation_notice_messages.user_id`, `violation_notice_attachments.uploaded_by`, `violation_notice_mentions.mentioned_user_id` — same no-FK pattern as `case_messages`. Do not add FKs to tenant `users`.

**`violation_notices.source_case_report_id` and `source_store_audit_id` are tenant-to-tenant FKs.**
Both reference tables in the same tenant DB (`case_reports.id` and `store_audits.id` respectively) with SET NULL on delete. This is the only place where tenant table FKs to other tenant tables are used — permitted because both are in the same database.

**`violation_notice_messages` soft-delete pattern.**
Same as `case_messages`: set `is_deleted = true`, `deleted_by = userId`. S3 attachments deleted best-effort after commit.
