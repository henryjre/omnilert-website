# Skill: Migrations

## Two Separate Lifecycles — Never Mix Them
- **Master migrations**: `apps/api/src/migrations/master/` — global schema (companies, users, RBAC, etc.)
- **Tenant migrations**: `apps/api/src/migrations/tenant/` — per-company operational schema

## Running Migrations
```bash
# From apps/api/
npx ts-node src/scripts/migrate-tenants.ts         # run pending tenant migrations across all tenants
npx ts-node src/scripts/migration-status-tenants.ts  # check status
npx ts-node src/scripts/rollback-tenants.ts        # rollback
```
Do not use `apps/api/src/scripts/migration.ts` — legacy helper, may diverge from standard flow.

## Master Migration Sequence (001–010)
001 create_companies → 002 create_super_admins → 003 create_company_databases → 004 add_theme_color → 005 add_company_code_and_employee_identities → 006 global_users_and_registration → 007 add_users_last_company → 008 add_users_department_id → 009 add_shift_exchange_requests_and_suspended_status → 010 add_audit_result_columns

Migration 010 note: adds `css_audits` (JSONB array) and `compliance_audit` (JSONB object) columns to master `users`; also seeds `store_audit.view` and `store_audit.process` permission keys.

Migration 006 note: includes idempotent/self-healing for legacy truncated constraint names on `registration_request_company_assignments` and `registration_request_assignment_branches`. Safe to re-run.

## Tenant Migration Sequence (001–017)
001 baseline → 002 add_user_key → 003 add_user_profile_columns → 004 add_registration_requests_and_employee_number → 005 employee_verifications_expansion → 006 profile_bank_verifications → 007 departments_employee_profiles → 008 expand_personal_information_fields → 009 add_employment_status → 010 add_push_notifications → 011 drop_employee_notifications_user_fk → 012 add_suspended_employment_status → 013 drop_employee_shifts_user_fk → 014 drop_cash_requests_user_fks → 015 drop_authorization_requests_user_fks → 016 drop_more_global_user_fks → 017 store_audits

Migration 017 note: creates `store_audits` table with type discriminator (`customer_service` | `compliance`), status enum, shared and type-specific columns, and four indexes including the partial unique index `store_audits_one_active_per_auditor WHERE status = 'processing'`.

Migration 005 note: migrates legacy permission key `registration.view` → `employee_verification.view`.
Migrations 011–016: drop tenant FKs on global-user-backed fields for master-user UUID compatibility. This is intentional — do not restore these FKs.

## Compat Shim Files
`.js` shim files exist for migrations 001–013 to prevent Knex "migration directory is corrupt" errors on older tenants. Do not delete them.

## Adding a New Migration

**For master:**
1. Create `apps/api/src/migrations/master/0NN_description.ts`.
2. Export `up` and `down` using the Knex migration interface.
3. Run master migration directly (not via tenant scripts).

**For tenant:**
1. Create `apps/api/src/migrations/tenant/0NN_description.ts`.
2. Export `up` and `down`.
3. Run via `migrate-tenants.ts` — this applies the migration across all registered tenant DBs.
4. If you drop a FK that references a global user UUID field, document it clearly. This is the established pattern (see 011–016).

## Provisioning (New Tenants)
New company tenant schema is created via `services/databaseProvisioner.ts`:
- Creates current schema from scratch.
- Seeds permissions/roles and fixed employment requirement catalog.
- Runs versioned tenant migrations after initial table creation.
