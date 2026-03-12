# Omnilert

Multi-tenant internal ops platform for branch-based PH businesses. Monorepo: `pnpm` + Turbo.

## Commands

```bash
pnpm install && pnpm dev       # install + run all dev servers (from root)
pnpm build                     # build all
# from apps/api/
npx ts-node src/scripts/migrate-tenants.ts
npx ts-node src/scripts/migration-status-tenants.ts
npx ts-node src/scripts/rollback-tenants.ts
```

## Skills — read before working in these areas

| Area | File |

|---|---|
| Multi-tenant DB rules | `.claude/skills/multi-tenant-db.md` |
| Auth & RBAC | `.claude/skills/auth-rbac.md` |
| Odoo provisioning | `.claude/skills/odoo-provisioning.md` |
| Verification workflows | `.claude/skills/verification-workflows.md` |
| Migrations | `.claude/skills/migrations.md` |
| Frontend patterns | `.claude/skills/frontend-patterns.md` |

Read the relevant skill file at the start of any task touching that domain. When in doubt, read it.

## Plans

Always save the plans as markdown files inside `.claude/plans/` folder.
