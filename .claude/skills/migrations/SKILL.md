---
name: migrations
description: How to write, run, and reason about database migrations in Omnilert — Knex migration format, single migration directory, company provisioning, key index patterns. Read this before creating any migration file or running schema changes.
type: reference
---

# Skill: Migrations

## Single Migration Directory

All migrations live in `apps/api/src/migrations/`. One runner, one environment — no per-company or per-schema migration logic.

## Running Migrations

```bash
# From apps/api/
pnpm migrate            # knex migrate:latest — run all pending
pnpm migrate:rollback   # knex migrate:rollback — rollback last batch
pnpm migrate:status     # check which migrations have/haven't run
pnpm seed               # run seed files in src/seeds/

# Or from repo root (migrate + dev servers):
pnpm up:dev
```

## Adding a New Migration

1. Create `apps/api/src/migrations/0NN_description.ts` (increment the prefix).
2. Export `up(knex: Knex)` and `down(knex: Knex)` using the Knex migration interface.
3. **Use `TIMESTAMPTZ`** (not `TIMESTAMP`) for all timestamp columns — exception: `scheduled_for_manila` is intentionally `TIMESTAMP WITHOUT TIME ZONE` for Manila local time.
4. **Company-scoped root tables**: add `company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE` on root/parent tables only. Child tables inherit scope via parent FK — do not add redundant `company_id` to child tables.
5. **Actor columns** (reviewed_by, approved_by, etc.): use `UUID nullable REFERENCES users(id) ON DELETE SET NULL` — the action record should survive even if the actor is deleted.
6. Run `pnpm migrate` from `apps/api/`.

## Current Migration

`001_single_db_redesign.ts` — creates the entire schema from scratch: ~50 tables, all FK constraints, indexes, partial unique indexes, and seeds (permissions, roles, role_permissions, employment_requirement_types).

## Company Provisioning

New company = `INSERT INTO companies`. No per-company database, no schema to create, no seeding required — all tables already exist. All scoping is via `company_id` columns.

## Knex Config

`apps/api/knexfile.ts` — single `development` environment pointing to `src/migrations/` directory.

Env vars: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`

## Key Index Patterns to Know

```sql
-- One active audit per auditor (catch → 409 on concurrent claim)
CREATE UNIQUE INDEX store_audits_one_active_per_auditor
  ON store_audits(company_id, auditor_user_id) WHERE status = 'processing';

-- Prevent duplicate CSS audit for same POS order
CREATE UNIQUE INDEX store_audits_css_order_unique
  ON store_audits(company_id, css_odoo_order_id)
  WHERE type = 'customer_service' AND status != 'completed';

-- Thread-safe per-company sequences (case_number, vn_number)
CREATE UNIQUE INDEX company_sequences_unique
  ON company_sequences(company_id, sequence_name);

-- One pending verification per user (e.g. personal info, bank)
CREATE UNIQUE INDEX personal_information_verifications_one_pending_per_user
  ON personal_information_verifications(company_id, user_id) WHERE status = 'pending';
```

When adding a feature that has "only one active at a time" semantics (e.g., one pending submission per user), use a partial unique index and let the DB enforce it — catch the unique constraint violation in the service layer and return 409.

## Naming Conventions

| Object | Pattern |
|---|---|
| Regular index | `{table}_{cols}_idx` |
| Unique index | `{table}_{cols}_unique` |
| Partial index | `{table}_{description}_unique` or `_idx` |
| CHECK constraint | `{table}_{column}_check` |
| Multi-target CHECK | `{table}_must_have_target` |

## Permission + Role Seeding

Permissions and roles are seeded in `001_single_db_redesign.ts`. To add a new permission key:
1. Add it to `packages/shared/src/constants/permissions.ts`.
2. Add a seed `INSERT` in the migration or a new migration that inserts it into the `permissions` table.
3. Never rename/delete existing keys — existing `role_permissions` rows reference them by string.
