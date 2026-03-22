# Skill: Migrations

## Single Migration Directory

All migrations live in `apps/api/src/migrations/`. One runner, one environment.

## Running Migrations

```bash
# From apps/api/
pnpm migrate            # knex migrate:latest — run all pending migrations
pnpm migrate:rollback   # knex migrate:rollback — rollback last batch
pnpm migrate:status     # check which migrations have/haven't run
pnpm seed               # run seed files in src/seeds/
```

Or from the repo root:

```bash
pnpm up:dev   # runs migrate, then starts all dev servers
```

## Adding a New Migration

1. Create `apps/api/src/migrations/0NN_description.ts`.
2. Export `up(knex)` and `down(knex)` using the Knex migration interface.
3. Use `TIMESTAMPTZ` (not `TIMESTAMP`) for all timestamp columns.
4. For company-scoped tables: add `company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE` only on root/parent tables. Child tables inherit company scope via parent FK — do not add redundant `company_id` to child tables.
5. Run `pnpm migrate` from `apps/api/`.

## Current Migration

`001_single_db_redesign.ts` — creates the entire schema from scratch: ~50 tables, all FK constraints, indexes, partial unique indexes, and seeds (permissions, roles, role_permissions, employment_requirement_types).

## Company Provisioning

New company = `INSERT INTO companies`. No per-company database, no schema to create, no seeding required. All tables already exist.

## Knex Config

`apps/api/knexfile.ts` — single `development` environment pointing to `src/migrations/` directory.
Uses `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` env vars.

## Key Indexes to Know

```sql
-- One active audit per auditor (race condition protection — catch duplicate constraint → 409)
CREATE UNIQUE INDEX store_audits_one_active_per_auditor
  ON store_audits(company_id, auditor_user_id) WHERE status = 'processing';

-- Prevent duplicate CSS audit for same POS order
CREATE UNIQUE INDEX store_audits_css_order_unique
  ON store_audits(company_id, css_odoo_order_id)
  WHERE type = 'customer_service' AND status != 'completed';

-- Thread-safe per-company sequences (case_number, vn_number)
CREATE UNIQUE INDEX company_sequences_unique
  ON company_sequences(company_id, sequence_name);
```
