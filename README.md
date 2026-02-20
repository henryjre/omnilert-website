# Omnilert Website

Omnilert is a multi-tenant operations platform for branch-based companies. It handles POS verification workflows, POS session auditing, employee shift monitoring, authorization requests, cash requests, and employee account features with real-time updates.

## Tech Stack

- Monorepo: `pnpm` workspaces + Turborepo
- API: Node.js, Express, TypeScript, Knex, PostgreSQL, Socket.IO, pg-boss
- Web: React, Vite, TypeScript, Tailwind CSS, Zustand, TanStack Query
- Shared package: `@omnilert/shared` for schemas, constants, and types

## Repository Structure

```text
apps/
  api/        Express API, migrations, scripts
  web/        React app
packages/
  shared/     Shared types, Zod schemas, constants
docs/
  PROJECT_CONTEXT.md   AI/engineer handoff context
```

## Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL 16+ (or Docker)

## Local Development (Quick Start)

1. Start PostgreSQL (Docker option):

```bash
docker-compose up -d
```

2. Install dependencies:

```bash
pnpm install
```

3. Create API env file:

```bash
cp apps/api/.env.example apps/api/.env
```

PowerShell equivalent:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

4. Fill `apps/api/.env` with real values (especially JWT and Odoo credentials).

5. Start development services (runs master + tenant migrations first, then API + web):

```bash
pnpm up:dev
```

## Production Operations (Controlled Migrations)

Run migrations once in a controlled deploy job:

```bash
pnpm -C apps/api migrate:master
pnpm -C apps/api migrate:tenant
```

Build artifacts:

```bash
pnpm build
```

Start app processes manually (separate processes/containers):

```bash
pnpm -C apps/api start
pnpm -C apps/web preview -- --host
```

## Key Commands

Root:

```bash
pnpm up:dev
pnpm up:prod
pnpm dev
pnpm build
pnpm lint
pnpm clean
```

API:

```bash
pnpm -C apps/api dev
pnpm -C apps/api build
pnpm -C apps/api start
pnpm -C apps/api migrate:master
pnpm -C apps/api migrate:tenant
pnpm -C apps/api migrate:tenant:status
pnpm -C apps/api migrate:tenant:rollback
```

Web:

```bash
pnpm -C apps/web dev
pnpm -C apps/web build
pnpm -C apps/web preview -- --host
```

## Important Notes

- Migration policy:
  - Development: `pnpm up:dev` is convenient and safe to run repeatedly.
  - Production: run migrations in a controlled job before starting app instances.
- Multi-tenant model:
  - One master database + one tenant database per company.
  - Tenant migrations must run across all active tenant databases.
- Secrets:
  - Never commit real `.env` files or credentials.
  - Keep placeholders only in `apps/api/.env.example`.
- Queue behavior:
  - Early check-in authorization creation is delayed through a persistent `pg-boss` queue (`early-checkin-auth`), so scheduled jobs survive API restarts.
- Web API base:
  - The web app proxies `/api` to `http://localhost:3002` in Vite dev.
  - `VITE_API_URL` is used for some absolute file URLs (for attachments).

## Additional Context

For implementation-level details and AI handoff context, read:

- `docs/PROJECT_CONTEXT.md`

