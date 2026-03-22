# Omnilert

Internal ops platform for branch-based PH businesses. Monorepo: `pnpm` + Turbo. Single PostgreSQL database — all companies share one DB with `company_id` scoping.

## Commands

```bash
pnpm install && pnpm dev       # install + run all dev servers (from root)
pnpm build                     # build all
# from apps/api/ — run migrations
pnpm migrate             # run pending migrations
pnpm migrate:rollback    # rollback last batch
pnpm migrate:status      # check migration status
```

## Architecture

- **Single DB**: All data lives in one PostgreSQL database. No per-company databases.
- **Company scoping**: Root tables have `company_id UUID NOT NULL`. Child tables inherit scope via parent FK (no redundant `company_id`).
- **`db.getDb()`**: Single knex instance for all queries. `db.getMasterDb()` and `db.getTenantDb()` are removed.
- **`req.companyContext`**: Contains `companyId`, `companySlug`, `companyName`, `companyStorageRoot`. No more `req.tenantDb`.
- **Migrations**: Single directory `apps/api/src/migrations/`. One migration runner.

## Skills — read before working in these areas

| Area | File |
| --- | --- |
| Auth & RBAC | `.claude/skills/auth-rbac.md` |
| Odoo provisioning | `.claude/skills/odoo-provisioning.md` |
| Verification workflows | `.claude/skills/verification-workflows.md` |
| Migrations | `.claude/skills/migrations.md` |
| Frontend patterns | `.claude/skills/frontend-patterns.md` |

Read the relevant skill file at the start of any task touching that domain. When in doubt, read it.

## Plans

Always save the plans as markdown files inside `.claude/plans/` folder.
