# Internal Auditing System — Implementation Plan

## Context

This plan adds a Store Audits page under a new "Internal Audit" collapsible group in the MANAGEMENT sidebar section. The feature introduces two audit types triggered by different sources:

1. **Customer Service Audit (CSS)** — triggered stochastically from Odoo POS order webhooks (10% chance). Auditors review cashier performance and rate it 1–5 stars. An AI-generated report (OpenAI) is produced on completion.
2. **Compliance Audit** — triggered by an hourly cron job that picks one random employee from active Odoo attendance records (excluding company_id=1). Auditors answer five Yes/No compliance questions.

Both audit types share a global constraint: one user can only be processing one audit at a time (any type). The UI mirrors Employee Verifications: category tabs + status tabs + card list + right-side detail panel. Real-time sync via a new `/store-audits` Socket.IO namespace.

---

## Open Questions (Resolved in Plan)

1. **Odoo `hr.attendance` fields** — The spec lists what we need (employee id/name/avatar, branch, check-in time). This plan marks exact field names as **TBD-from-Odoo-schema** and flags them as the primary thing to confirm before implementation of the compliance cron.
2. **`css_audits` / `compliance_audit` column location** — These are audit result fields tied to a global user. Per the multi-tenant-db skill: user data lives on master `users`. Both columns go on master `users`.
3. **"Request VN" button** — Pure UI placeholder, no backend or socket stub needed. Add a `// TODO: implement VN request` comment.

---

## Database Schema

### Tenant DB — Migration `017_store_audits.ts`

**Single table with type discriminator** (recommended over separate tables + view).
Rationale: the global "one active audit per auditor" constraint is trivially enforced with `WHERE status = 'processing' AND auditor_user_id = $1` on one table, regardless of type. Separate tables would require a UNION or view for this check and make the constraint harder to enforce atomically.

```sql
CREATE TABLE store_audits (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type                VARCHAR(30) NOT NULL CHECK (type IN ('customer_service', 'compliance')),
  status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'processing', 'completed')),

  -- Shared
  branch_id           UUID NOT NULL REFERENCES branches(id),
  auditor_user_id     UUID NULL,          -- no FK (global UUID, per multi-tenant pattern)
  monetary_reward     NUMERIC(10,2) NOT NULL,
  completed_at        TIMESTAMP NULL,
  created_at          TIMESTAMP NOT NULL DEFAULT now(),
  updated_at          TIMESTAMP NOT NULL DEFAULT now(),

  -- Customer Service Audit columns
  css_odoo_order_id       INTEGER NULL,
  css_pos_reference       VARCHAR(100) NULL,
  css_session_name        VARCHAR(100) NULL,
  css_company_name        VARCHAR(255) NULL,
  css_cashier_name        VARCHAR(255) NULL,
  css_cashier_user_key    UUID NULL,       -- x_website_key → used for write-back
  css_date_order          TIMESTAMP NULL,
  css_amount_total        NUMERIC(10,2) NULL,
  css_order_lines         JSONB NULL,      -- [{product_name, qty, price_unit}]
  css_payments            JSONB NULL,
  css_star_rating         INTEGER NULL CHECK (css_star_rating BETWEEN 1 AND 5),
  css_audit_log           TEXT NULL,
  css_ai_report           TEXT NULL,

  -- Compliance Audit columns
  comp_odoo_employee_id   INTEGER NULL,
  comp_employee_name      VARCHAR(255) NULL,
  comp_employee_avatar    TEXT NULL,
  comp_check_in_time      TIMESTAMP NULL,
  comp_extra_fields       JSONB NULL,       -- any additional hr.attendance fields discovered
  comp_non_idle           BOOLEAN NULL,
  comp_cellphone          BOOLEAN NULL,
  comp_uniform            BOOLEAN NULL,
  comp_hygiene            BOOLEAN NULL,
  comp_sop                BOOLEAN NULL
);

-- Indexes
CREATE INDEX store_audits_status_idx ON store_audits(status);
CREATE INDEX store_audits_type_status_idx ON store_audits(type, status);
CREATE INDEX store_audits_auditor_idx ON store_audits(auditor_user_id) WHERE auditor_user_id IS NOT NULL;
-- Partial unique index: prevents one user holding multiple processing audits
CREATE UNIQUE INDEX store_audits_one_active_per_auditor
  ON store_audits(auditor_user_id)
  WHERE status = 'processing';
-- Partial unique index: prevents duplicate pending CSS audits for same Odoo order
CREATE UNIQUE INDEX store_audits_css_order_unique
  ON store_audits(css_odoo_order_id)
  WHERE type = 'customer_service' AND status != 'completed';
```

> The `store_audits_one_active_per_auditor` partial unique index is the DB-level enforcement of the global constraint. It also serves as race-condition protection for the `process` endpoint — a concurrent insert/update violates the index and raises a unique constraint error, which the API catches and returns a clean 409.

### Master DB — Migration `010_add_audit_result_columns.ts`

Add two columns to master `users`:

```sql
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS css_audits    JSONB NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS compliance_audit JSONB NULL DEFAULT '{}'::jsonb;
```

- `css_audits`: array of `{ audit_id, star_rating, audited_at }` — append-only log of CSS star ratings.
- `compliance_audit`: latest compliance result `{ audit_id, answers: { non_idle, cellphone, uniform, hygiene, sop }, audited_at }`.

### Env Vars to Add (`apps/api/src/config/env.ts`)

```
OPENAI_API_KEY
OPENAI_ORGANIZATION_ID
OPENAI_PROJECT_ID
```

Add as `z.string()` (required for CSS AI report generation).

---

## Permissions

Add two new permission keys to `packages/shared/src/constants/permissions.ts`:

```ts
STORE_AUDIT_VIEW: 'store_audit.view',
STORE_AUDIT_PROCESS: 'store_audit.process',
```

- `store_audit.view` — can see Store Audits page (list + detail)
- `store_audit.process` — can claim and complete audits

Category for seeding: `store_audit` → label `Store Audits`.

### Permission Seeding Migration

Add both keys to `PERMISSION_KEYS` array in master migration `010_add_audit_result_columns.ts` (same migration as the column addition, since it touches master DB).

Also update `databaseProvisioner.ts` to seed these permissions into new tenant databases.

---

## API Endpoints

All routes: `authenticate` → `resolveCompany` → `requirePermission`

```
GET    /store-audits              store_audit.view    list with ?type=&status=&page=&pageSize=
GET    /store-audits/:id          store_audit.view    detail
POST   /store-audits/:id/process  store_audit.process claim audit (race-condition safe)
POST   /store-audits/:id/complete store_audit.process submit completion
```

### `POST /store-audits/:id/process`

1. Load audit by id; 404 if not found or not `pending`.
2. Check `req.user.sub` does not already have a `processing` audit — query `store_audits WHERE status='processing' AND auditor_user_id=$userId`. Return 409 `"You already have an active audit in progress"` if true.
3. Update `status='processing', auditor_user_id=$userId` using knex with `WHERE status='pending'` (optimistic check). If 0 rows affected → 409 `"Audit was already claimed"`.
4. The DB partial unique index handles simultaneous requests automatically — duplicate constraint error → catch → 409.
5. Emit `store-audit:claimed` to `company:${companyId}` room.

### `POST /store-audits/:id/complete`

For CSS: body `{ star_rating: number, audit_log: string }`
For Compliance: body `{ non_idle: boolean, cellphone: boolean, uniform: boolean, hygiene: boolean, sop: boolean }`

1. Verify audit is `processing` and `auditor_user_id === req.user.sub`. Return 403 otherwise.
2. CSS path:
   a. Call `analyzeAudit([{ author: 'Auditor', content: audit_log }])` via OpenAI client.
   b. Update audit: status=`completed`, css_star_rating, css_audit_log, css_ai_report, completed_at.
   c. If `css_cashier_user_key` is set: look up master `users WHERE user_key = css_cashier_user_key`; if found, `jsonb_insert` the new rating into `css_audits`.
3. Compliance path:
   a. Update audit: status=`completed`, comp_non_idle/cellphone/uniform/hygiene/sop, completed_at.
   b. If `comp_odoo_employee_id` is set: look up master `users` by Odoo employee ID linkage (TBD — likely via `employee_identities` or `user_key`; flag this as needing confirmation). Update `compliance_audit` JSON.
4. Emit `store-audit:completed` to `company:${companyId}` room.

---

## Webhook Handler (CSS Audit Creation)

### Route: `POST /webhooks/odoo/pos-order`

Add to `apps/api/src/routes/webhook.routes.ts`:
```ts
router.post('/odoo/pos-order', validateBody(odooPosOrderPayloadSchema), webhookController.posOrder);
```

### Zod Schema (`packages/shared/src/schemas/odoo.ts`)

New `odooPosOrderPayloadSchema` matching the spec payload shape.

### Controller (`webhook.controller.ts`)

```ts
export async function posOrder(req, res, next) {
  try {
    const payload = req.body;
    // Silently ignore if x_website_key is empty/missing
    if (!payload.x_website_key) return res.status(200).json({ success: true });
    // 10% chance — server-side
    if (Math.random() > 0.1) return res.status(200).json({ success: true });
    await webhookService.createCssAudit(payload);
    res.status(201).json({ success: true });
  } catch (err) { next(err); }
}
```

### Service (`webhook.service.ts`)

`createCssAudit(payload)`:
1. Resolve company from `payload.company_id` via existing `resolveCompanyByOdooBranchId`.
2. Compute `monetary_reward` from `amount_total` using range table.
3. Insert into tenant `store_audits`.
4. Emit `store-audit:new` to company room.

**Reward calculation:**
```ts
function computeCssReward(amountTotal: number): number {
  const [min, max] =
    amountTotal < 150   ? [7,  10] :
    amountTotal < 400   ? [10, 15] :
    amountTotal < 800   ? [15, 25] :
                          [25, 30];
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}
```

---

## Compliance Cron Job

### Service: `apps/api/src/services/complianceCron.service.ts`

Uses Node.js `setInterval` (simple hourly cron, no PgBoss needed since it's not a delayed job):

```ts
let cronHandle: NodeJS.Timeout | null = null;

export async function initComplianceCron(): Promise<void> {
  if (cronHandle) return;
  cronHandle = setInterval(() => void runComplianceCron(), 60 * 60 * 1000);
  logger.info('Compliance cron initialized (hourly)');
}

export async function stopComplianceCron(): Promise<void> {
  if (cronHandle) { clearInterval(cronHandle); cronHandle = null; }
}

async function runComplianceCron(): Promise<void> {
  try {
    // 1. Query Odoo for all active hr.attendance records (check_out = false),
    //    excluding company_id=1
    //    Fields needed: id, employee_id, employee_name, employee_avatar,
    //                   check_in, company_id
    //    (TBD: confirm exact field names from Odoo hr.attendance schema)
    const records = await odooService.getActiveAttendances(); // exclude company_id=1
    if (!records.length) return;

    // 2. Pick one at random
    const chosen = records[Math.floor(Math.random() * records.length)];

    // 3. Resolve company from chosen.company_id
    const company = await resolveCompanyByOdooBranchId(chosen.company_id);
    const tenantDb = await db.getTenantDb(company.db_name);

    // 4. Compute reward (₱15–30)
    const reward = 15 + Math.random() * 15; // float, rounded to 2dp

    // 5. Insert compliance audit
    const [audit] = await tenantDb('store_audits').insert({
      type: 'compliance',
      status: 'pending',
      branch_id: /* resolve from company's default branch */ ...,
      monetary_reward: Math.round(reward * 100) / 100,
      comp_odoo_employee_id: chosen.employee_id,
      comp_employee_name: chosen.employee_name,
      comp_employee_avatar: chosen.employee_avatar, // TBD field name
      comp_check_in_time: chosen.check_in,
    }).returning('*');

    // 6. Emit store-audit:new
    getIO().of('/store-audits').to(`company:${company.id}`).emit('store-audit:new', audit);
  } catch (err) {
    logger.error({ err }, 'Compliance cron failed');
  }
}
```

> **TBD before implementation**: Confirm Odoo `hr.attendance` field names for employee avatar and exact check-in field. Add a note in the service file.

### Initialize in `server.ts`

```ts
await initComplianceCron();
// In shutdown:
stopComplianceCron();
```

### Odoo Service addition (`apps/api/src/services/odoo.service.ts` or `webhook.service.ts`)

`getActiveAttendances()` — calls Odoo JSON-RPC `search_read` on `hr.attendance` where `check_out = false AND company_id != 1`.

---

## Socket.IO — `/store-audits` Namespace

Add to `apps/api/src/config/socket.ts`:

```ts
const storeAuditsNs = io.of('/store-audits');
storeAuditsNs.use((socket, next) => {
  const token = socket.handshake.auth.token as string | undefined;
  if (!token) return next(new Error('Authentication required'));
  try {
    const payload = verifyAccessToken(token);
    if (!payload.permissions.includes('store_audit.view')) {
      return next(new Error('Insufficient permissions'));
    }
    socket.data.user = payload;
    next();
  } catch { next(new Error('Invalid token')); }
});

storeAuditsNs.on('connection', (socket) => {
  const companyId = socket.data.user?.companyId;
  if (companyId) socket.join(`company:${companyId}`);
  logger.debug(`Store Audits: ${socket.data.user?.sub} connected`);
});
```

Events emitted to `company:{companyId}`:
- `store-audit:new` — new audit created (pending)
- `store-audit:claimed` — audit moved to processing `{ id, auditor_user_id, auditor_name }`
- `store-audit:completed` — audit completed `{ id }`

---

## Frontend

### Sidebar (`apps/web/src/features/dashboard/components/Sidebar.tsx`)

1. Add `const AUDIT_PATHS = ['/store-audits']`
2. Add `const [auditExpanded, setAuditExpanded] = useState(() => AUDIT_PATHS.some(p => location.pathname.startsWith(p)))`
3. Add `useEffect` to auto-expand on navigation (follow existing HR/Finance pattern)
4. Add `<SubCategory label="Internal Audit" ...>` with `store_audit.view` permission check:
   ```tsx
   <SubCategory label="Internal Audit" expanded={auditExpanded} onToggle={() => setAuditExpanded(v => !v)}>
     {hasPermission(PERMISSIONS.STORE_AUDIT_VIEW) && (
       <NavLink to="/store-audits" className={linkClass}>
         <ClipboardList className="h-5 w-5" />
         Store Audits
       </NavLink>
     )}
   </SubCategory>
   ```

### Router (`apps/web/src/app/router.tsx`)

Add route:
```tsx
{
  path: 'store-audits',
  element: (
    <PermissionGuard permission={PERMISSIONS.STORE_AUDIT_VIEW}>
      <StoreAuditsPage />
    </PermissionGuard>
  ),
}
```

### Feature: `apps/web/src/features/store-audits/`

```
pages/
  StoreAuditsPage.tsx        — main page (tabs + card list + detail panel)
components/
  CssAuditCard.tsx           — left-panel card for CSS audits
  ComplianceAuditCard.tsx    — left-panel card for compliance audits
  CssAuditDetailPanel.tsx    — right-panel detail for CSS audits
  ComplianceAuditDetailPanel.tsx — right-panel detail for compliance audits
  StarRatingInput.tsx        — 1–5 star input (new component)
  YesNoPill.tsx              — Yes/No pill toggle (new component)
```

### `StoreAuditsPage.tsx` structure

- **Category tabs**: `All Categories` | `Customer Service Audit` | `Compliance Audit`
- **Status tabs**: `Pending` | `Processing` | `Completed` (default: `Pending`)
- **Left**: scrollable card list filtered by active tabs
- **Right**: slide-in detail panel (same pattern as EmployeeVerificationsPage — `translate-x-full` → `translate-x-0`)
- On mount: fetch `GET /store-audits?type=&status=pending`
- Socket: `useSocket('/store-audits')` → listen for `store-audit:new`, `store-audit:claimed`, `store-audit:completed` → silent refresh
- Process button visibility: hide if `processingAuditId !== null` (fetched alongside the list — API returns `processingAuditId` for the current user)

### `StarRatingInput.tsx`

Five clickable star icons (lucide `Star`). Selected stars are filled/colored, unselected are outline. Controlled component: `value: number | null`, `onChange: (v: number) => void`.

### `YesNoPill.tsx`

Two pill buttons side-by-side: `Yes` (green when selected) and `No` (red when selected). Controlled: `value: boolean | null`, `onChange: (v: boolean) => void`.

### Detail Panel Behavior

**CSS — Pending:**
- Show all order fields (session name, reference, branch, order date in Asia/Manila, cashier, order lines table, totals, reward)
- "Process" button if: user has `store_audit.process` permission AND `processingAuditId === null`

**CSS — Processing (bound auditor only):**
- Same fields + auditor name
- Star rating input (required) + audit log textarea (required)
- "Audit Complete" button → POST `/store-audits/:id/complete`
- Show panel error if AI call fails (retry prompt)

**CSS — Completed:**
- All fields + auditor + star rating + audit log + AI report
- "Request VN" placeholder button (disabled, `// TODO`)

**Compliance — Pending:**
- Employee avatar, name, branch, check-in time (Asia/Manila), reward
- "Process" button (same guard)

**Compliance — Processing (bound auditor only):**
- Same + auditor + five `YesNoPill` toggles (all required)
- "Audit Complete" button

**Compliance — Completed:**
- All fields + auditor + all five answers displayed as colored pills
- "Request VN" placeholder button

---

## Shared Types (`packages/shared/src/types/`)

Add `StoreAudit` interface and related types:

```ts
export interface StoreAudit {
  id: string;
  type: 'customer_service' | 'compliance';
  status: 'pending' | 'processing' | 'completed';
  branch_id: string;
  auditor_user_id: string | null;
  monetary_reward: string; // numeric from DB
  created_at: string;
  // ... CSS and compliance fields
}
```

Add to `packages/shared/src/constants/permissions.ts`:
```ts
STORE_AUDIT_VIEW: 'store_audit.view',
STORE_AUDIT_PROCESS: 'store_audit.process',
```

Add to `PERMISSION_CATEGORIES`:
```ts
store_audit: { label: 'Store Audits', permissions: ['store_audit.view', 'store_audit.process'] }
```

---

## Files to Create or Modify

### Backend — Create
- `apps/api/src/migrations/tenant/017_store_audits.ts`
- `apps/api/src/migrations/master/010_add_audit_result_columns.ts`
- `apps/api/src/controllers/storeAudit.controller.ts`
- `apps/api/src/services/storeAudit.service.ts`
- `apps/api/src/services/complianceCron.service.ts`
- `apps/api/src/routes/storeAudit.routes.ts`

### Backend — Modify
- `apps/api/src/config/env.ts` — add OPENAI_* vars
- `apps/api/src/config/socket.ts` — add `/store-audits` namespace
- `apps/api/src/routes/webhook.routes.ts` — add `pos-order` route
- `apps/api/src/routes/index.ts` — register `/store-audits`
- `apps/api/src/controllers/webhook.controller.ts` — add `posOrder` handler
- `apps/api/src/services/webhook.service.ts` — add `createCssAudit`, `computeCssReward`, `resolveCompanyByOdooBranchId` reuse
- `apps/api/src/server.ts` — init/stop compliance cron
- `apps/api/src/services/databaseProvisioner.ts` — seed new permissions

### Shared — Modify
- `packages/shared/src/constants/permissions.ts` — add `STORE_AUDIT_VIEW`, `STORE_AUDIT_PROCESS`
- `packages/shared/src/types/` — add `StoreAudit` types
- `packages/shared/src/schemas/odoo.ts` (or equivalent) — add `odooPosOrderPayloadSchema`

### Frontend — Create
- `apps/web/src/features/store-audits/pages/StoreAuditsPage.tsx`
- `apps/web/src/features/store-audits/components/CssAuditCard.tsx`
- `apps/web/src/features/store-audits/components/ComplianceAuditCard.tsx`
- `apps/web/src/features/store-audits/components/CssAuditDetailPanel.tsx`
- `apps/web/src/features/store-audits/components/ComplianceAuditDetailPanel.tsx`
- `apps/web/src/features/store-audits/components/StarRatingInput.tsx`
- `apps/web/src/features/store-audits/components/YesNoPill.tsx`

### Frontend — Modify
- `apps/web/src/app/router.tsx` — add `/store-audits` route
- `apps/web/src/features/dashboard/components/Sidebar.tsx` — add Internal Audit group

---

## Implementation Order

1. **Shared**: Add permissions, types, Odoo payload schema
2. **Master migration**: `010_add_audit_result_columns.ts` (new user columns + permission seeding)
3. **Tenant migration**: `017_store_audits.ts`
4. **Backend service**: `storeAudit.service.ts` (CRUD, claim logic, complete logic, OpenAI call)
5. **Backend**: `storeAudit.controller.ts` + `storeAudit.routes.ts` + register in `routes/index.ts`
6. **Webhook**: `odooPosOrderPayloadSchema` + `posOrder` controller + `createCssAudit` in webhook.service
7. **Cron**: `complianceCron.service.ts` + init/stop in `server.ts`
8. **Socket**: Add `/store-audits` namespace to `config/socket.ts`
9. **Env**: Add OPENAI vars to `config/env.ts`
10. **Frontend**: Shared types → StoreAuditsPage → sub-components → Sidebar + Router
11. **Provisioner**: Seed new permissions in `databaseProvisioner.ts`

---

## Verification

1. Run master migration: `npx ts-node src/scripts/migrate-tenants.ts` (for tenant) + direct run for master
2. Trigger a test webhook POST to `/api/v1/webhooks/odoo/pos-order` with a valid payload including `x_website_key`. Verify 10% creates an audit, 90% returns 200 silently.
3. Start server and verify compliance cron logs appear hourly.
4. Use two browser sessions with `store_audit.process` permission; both click "Process" simultaneously — verify only one succeeds, other gets 409.
5. Complete a CSS audit: verify star rating writes back to master `users.css_audits`, AI report is stored.
6. Complete a compliance audit: verify answers stored, master `users.compliance_audit` updated.
7. Open two tabs on Store Audits; claim an audit in one — verify the other updates in real-time (card moves to Processing).
8. Navigate to `/store-audits` — verify sidebar "Internal Audit" group expands automatically.

---

## Flagged TBDs (Must Confirm Before Implementation)

1. **Odoo `hr.attendance` field names** — confirm exact API field names for employee avatar URL, employee name, and check-in timestamp via Odoo JSON-RPC schema inspection before implementing the cron.
2. **Compliance write-back user lookup** — `comp_odoo_employee_id` → master `users` linkage. Check if `employee_identities` table or another table in master DB stores the Odoo employee ID → user UUID mapping.
3. **Odoo service location** — confirm whether `getActiveAttendances` should go in `webhook.service.ts` or a separate `odoo.service.ts` file.
