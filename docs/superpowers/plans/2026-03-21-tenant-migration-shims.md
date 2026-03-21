# Tenant Migration Shims Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make tenant migrations safe to run from source in production-like environments by preserving compatibility with legacy `.js` filenames recorded in `knex_migrations`.

**Architecture:** Extend the repo's existing tenant migration compatibility-shim pattern from `001`-`013` to the missing `014`-`027` range. Add a focused regression test that checks every tenant migration with a TypeScript source file also has a matching `.js` shim in `src/migrations/tenant`.

**Tech Stack:** Node.js, TypeScript, Knex migrations, Node test runner (`node --test`)

---

## Chunk 1: Migration Compatibility Coverage

### Task 1: Add the regression test

**Files:**
- Create: `apps/api/src/services/tenantMigrationCompatibility.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('every tenant migration after the shim cutover has a .js compatibility file', () => {
  // Read src/migrations/tenant and assert that every .ts migration also has a .js file.
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C apps/api exec node --import tsx --test src/services/tenantMigrationCompatibility.test.ts`
Expected: FAIL listing the missing `.js` shim files for tenant migrations `014+`.

- [ ] **Step 3: Write minimal implementation**

Create the file-system based assertion with a clear failure message naming the missing `.js` files.

- [ ] **Step 4: Run test to verify it passes after shims are added**

Run: `pnpm -C apps/api exec node --import tsx --test src/services/tenantMigrationCompatibility.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/tenantMigrationCompatibility.test.ts
git commit -m "test: cover tenant migration shim compatibility"
```

### Task 2: Add missing `.js` compatibility shims for tenant migrations `014`-`027`

**Files:**
- Create: `apps/api/src/migrations/tenant/014_drop_cash_requests_user_fks.js`
- Create: `apps/api/src/migrations/tenant/015_drop_authorization_requests_user_fks.js`
- Create: `apps/api/src/migrations/tenant/016_drop_more_global_user_fks.js`
- Create: `apps/api/src/migrations/tenant/017_store_audits.js`
- Create: `apps/api/src/migrations/tenant/018_case_reports.js`
- Create: `apps/api/src/migrations/tenant/019_case_messages_soft_delete.js`
- Create: `apps/api/src/migrations/tenant/020_violation_notices.js`
- Create: `apps/api/src/migrations/tenant/021_store_audits_vn_requested.js`
- Create: `apps/api/src/migrations/tenant/022_peer_evaluations.js`
- Create: `apps/api/src/migrations/tenant/023_add_vn_epi_decrease.js`
- Create: `apps/api/src/migrations/tenant/023_css_criteria_scores.js`
- Create: `apps/api/src/migrations/tenant/024_compliance_rename_criteria.js`
- Create: `apps/api/src/migrations/tenant/025_drop_push_subscriptions_user_fk.js`
- Create: `apps/api/src/migrations/tenant/026_store_audit_messages.js`
- Create: `apps/api/src/migrations/tenant/027_add_comp_ai_report.js`

- [ ] **Step 1: Copy the existing shim pattern**

Use the same no-op compatibility structure as `apps/api/src/migrations/tenant/013_drop_employee_shifts_user_fk.js`.

- [ ] **Step 2: Add one shim per missing legacy filename**

Each file should export `up` and `down` no-ops and explain in a short comment that it exists for `knex_migrations` compatibility.

- [ ] **Step 3: Re-run the compatibility test**

Run: `pnpm -C apps/api exec node --import tsx --test src/services/tenantMigrationCompatibility.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/migrations/tenant/*.js apps/api/src/services/tenantMigrationCompatibility.test.ts
git commit -m "fix: add tenant migration compatibility shims"
```

## Chunk 2: Verification

### Task 3: Verify the migration path and build

**Files:**
- Verify: `apps/api/src/scripts/migrate-tenants.ts`
- Verify: `apps/api/src/services/tenantMigration.service.ts`

- [ ] **Step 1: Run the targeted compatibility test suite**

Run: `pnpm -C apps/api exec node --import tsx --test src/services/tenantMigrationCompatibility.test.ts`
Expected: PASS

- [ ] **Step 2: Run the API build**

Run: `pnpm -C apps/api build`
Expected: PASS

- [ ] **Step 3: Sanity-check the migration directory**

Run: `Get-ChildItem apps/api/src/migrations/tenant | Where-Object { $_.Name -match '^(0(1[4-9]|2[0-7])|023_).*\\.(ts|js)$' } | Select-Object Name`
Expected: each tenant migration in the target range has both `.ts` and `.js`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/migrations/tenant apps/api/src/services/tenantMigrationCompatibility.test.ts
git commit -m "chore: verify tenant migration source compatibility"
```
