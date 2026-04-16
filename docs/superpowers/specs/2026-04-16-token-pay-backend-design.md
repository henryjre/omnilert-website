# Token Pay Backend — Read Path Design

## Context

The Token Pay page (`apps/web/src/features/account/pages/TokenPayPage.tsx`) currently uses hardcoded mock data. The real data lives in Odoo's `loyalty.card` and `loyalty.history` models. This spec covers the backend needed to:

1. Fetch the user's token balance from Odoo
2. Fetch paginated transaction history from Odoo
3. Set up a local `pending_transactions` table for website-originated transactions (manager transfers, POS verifications) that haven't posted to Odoo yet
4. Wire the frontend to real API endpoints

**Scope**: Read path only. Creating/approving pending transactions and Odoo write-back are out of scope for this iteration.

---

## Architecture

**Odoo as source of truth** for completed transactions. The website owns pending state in a local DB table. The API merges both sources into a unified paginated feed.

```
Frontend (React Query)
  → GET /account/token-pay/wallet       → Odoo loyalty.card (points)
  → GET /account/token-pay/transactions → Odoo loyalty.history + local pending_transactions
```

### Odoo Data Model

**Balance**: `loyalty.card` model
- Domain: `["&", ("partner_id.x_website_key", "=", "<user_key>"), ("program_id", "in", [13])]`
- Field: `points` (the balance)

**Transaction history**: `loyalty.history` model (linked via `loyalty.card.history_ids`)
- Fields: `order_id`, `create_date`, `x_order_type`, `issued`, `used`, `x_order_reference`, `x_issuer`

### User Identity Resolution

`users.user_key` (UUID on website) maps to `partner_id.x_website_key` in Odoo. The API resolves this by reading the authenticated user's `user_key` from the `users` table.

---

## Database Schema

### New table: `pending_transactions`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | `UUID` | `PK DEFAULT gen_random_uuid()` |
| `company_id` | `UUID NOT NULL` | `FK → companies ON DELETE CASCADE` |
| `user_id` | `UUID NOT NULL` | `FK → users ON DELETE CASCADE` |
| `type` | `VARCHAR(10) NOT NULL` | `CHECK IN ('credit', 'debit')` |
| `title` | `VARCHAR(200) NOT NULL` | Display name, e.g. "Shift Overtime Reward" |
| `category` | `VARCHAR(20) NOT NULL` | `CHECK IN ('reward', 'purchase', 'transfer', 'adjustment')` |
| `amount` | `DECIMAL(12,2) NOT NULL` | Always positive; `type` determines direction |
| `reference` | `VARCHAR(100)` | Nullable — order ref / tracking number |
| `status` | `VARCHAR(20) NOT NULL DEFAULT 'pending'` | `CHECK IN ('pending', 'completed', 'failed', 'cancelled')` |
| `issued_by` | `VARCHAR(200)` | Nullable — display name of issuer |
| `issued_by_user_id` | `UUID` | `FK → users ON DELETE SET NULL` — actor who created it |
| `resolved_at` | `TIMESTAMPTZ` | Nullable — when status changed from pending |
| `odoo_history_id` | `INTEGER` | Nullable — linked Odoo loyalty.history ID once synced |
| `created_at` | `TIMESTAMPTZ NOT NULL` | `DEFAULT now()` |
| `updated_at` | `TIMESTAMPTZ NOT NULL` | `DEFAULT now()` |

**Indexes:**
- `pending_transactions_user_status_idx` on `(company_id, user_id, status)` — main query filter
- `pending_transactions_user_date_idx` on `(company_id, user_id, created_at DESC)` — feed ordering

---

## Odoo Service Functions

Added to `apps/api/src/services/odoo.service.ts`, using the existing `callOdooKw` and rate-limiting infrastructure.

### `getTokenPayCard(userKey: string)`

```
Model:    loyalty.card
Method:   search_read
Domain:   ["&", ("partner_id.x_website_key", "=", userKey), ("program_id", "in", [13])]
Fields:   ["points"]
Limit:    1
Returns:  { points: number; cardId: number } | null
```

### `getTokenPayHistory(cardId: number, offset: number, limit: number)`

```
Model:    loyalty.history
Method:   search_read
Domain:   [("card_id", "=", cardId)]
Fields:   ["order_id", "create_date", "x_order_type", "issued", "used", "x_order_reference", "x_issuer"]
Order:    "create_date desc"
Offset:   <offset>
Limit:    <limit>
Returns:  OdooLoyaltyHistory[]
```

### `getTokenPayHistoryCount(cardId: number)`

```
Model:    loyalty.history
Method:   search_count
Domain:   [("card_id", "=", cardId)]
Returns:  number
```

---

## API Endpoints

All routes added to `apps/api/src/routes/account.routes.ts` under the existing `authenticate, resolveCompany` middleware. No additional permission required — users can only view their own wallet.

### `GET /account/token-pay/wallet`

**Response:**
```json
{
  "success": true,
  "data": {
    "balance": 12543.50,
    "cardId": 42
  }
}
```

**Logic:**
1. Get `user_key` from `users` table for `req.user.sub`
2. Call `getTokenPayCard(userKey)`
3. Return balance or 404 if no loyalty card found

### `GET /account/token-pay/transactions?page=1&limit=10`

**Response:**
```json
{
  "success": true,
  "data": [ /* TokenTransaction[] */ ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 47,
    "totalPages": 5
  }
}
```

**Pagination strategy (pending-first, lazy-load from Odoo):**

Pending transactions are always the most recent, so they occupy the first slots in the feed.

```
pendingCount = SELECT COUNT(*) FROM pending_transactions WHERE user_id = ? AND company_id = ?
odooCount    = getTokenPayHistoryCount(cardId)
totalCount   = pendingCount + odooCount

Given: page, limit (default 10)
globalOffset = (page - 1) * limit

If globalOffset < pendingCount:
  → fetch pending rows: OFFSET globalOffset, LIMIT limit, ORDER BY created_at DESC
  → remaining = limit - pendingRows.length
  → if remaining > 0: fetch Odoo history: offset 0, limit remaining
Else:
  → odooOffset = globalOffset - pendingCount
  → fetch Odoo history: offset odooOffset, limit limit
```

Each Odoo history record is normalized into the `TokenTransaction` shape:
- `id`: `"odoo-{historyId}"`
- `type`: `issued > 0 ? 'credit' : 'debit'`
- `amount`: `Math.abs(issued || used)`
- `title`: `x_order_type` (e.g. "POS Token Pay Order", "Daily Sales Quota Reward")
- `category`: derived from `x_order_type` via a lookup map in the service layer. Known mappings: `"Daily Sales Quota Reward"` → `'reward'`, `"POS Token Pay Order"` → `'purchase'`. Unknown types default to `'adjustment'`. New types are added to the map as they appear in Odoo.
- `date`: `create_date` converted from Odoo UTC to ISO 8601
- `reference`: `x_order_reference`
- `status`: `'completed'` (all Odoo records are completed)
- `issuedBy`: `x_issuer`

---

## Shared Types

New file: `packages/shared/src/types/tokenPay.types.ts`

```typescript
export interface TokenPayWallet {
  balance: number;
  cardId: number;
}

export interface TokenTransaction {
  id: string;
  source: 'odoo' | 'local';
  type: 'credit' | 'debit';
  title: string;
  category: 'reward' | 'purchase' | 'transfer' | 'adjustment';
  amount: number;
  date: string;
  reference: string | null;
  status: 'completed' | 'pending' | 'failed' | 'cancelled';
  issuedBy: string | null;
}
```

Exported from `packages/shared/src/index.ts`.

---

## Service Layer

New file: `apps/api/src/services/tokenPay.service.ts`

### `getWallet(userId: string)`
1. Query `users` table for `user_key` by `userId`
2. Call `odoo.getTokenPayCard(userKey)`
3. Return `TokenPayWallet` or throw 404

### `getTransactions(userId: string, companyId: string, page: number, limit: number)`
1. Get `user_key` → `getTokenPayCard` → `cardId`
2. Count pending transactions (local DB)
3. Count Odoo history (`getTokenPayHistoryCount`)
4. Apply pagination strategy (pending-first, Odoo offset)
5. Normalize both into `TokenTransaction[]`
6. Return `{ items, pagination }`

---

## Controller

New file: `apps/api/src/controllers/tokenPay.controller.ts`

Thin handlers that extract `req.user.sub`, `req.companyContext.companyId`, query params, call service functions, and return `ApiResponse`.

---

## Frontend Integration

### New API service: `apps/web/src/features/account/services/tokenPay.api.ts`

```typescript
export async function fetchTokenPayWallet(): Promise<TokenPayWallet> { ... }
export async function fetchTokenPayTransactions(page: number, limit: number): Promise<PaginatedResponse<TokenTransaction>> { ... }
```

### Component changes

**`TokenPayPageContent.tsx`**: Remove mock data generation. Add React Query hooks:
- `useQuery({ queryKey: ['token-pay-wallet'], queryFn: fetchTokenPayWallet })`
- `useQuery({ queryKey: ['token-pay-transactions', page], queryFn: ... })`

**`TokenTransactionFeed.tsx`**: Update `TokenTransaction` interface to match shared type (add `source`, update imports).

**`TokenBalanceCard.tsx`**: Accept `balance` and `isLoading` props instead of hardcoded value.

---

## Files Changed

| File | Action |
|------|--------|
| `apps/api/src/migrations/0XX_pending_transactions.ts` | **New** — migration |
| `apps/api/src/services/odoo.service.ts` | **Edit** — add 3 functions |
| `apps/api/src/services/tokenPay.service.ts` | **New** — business logic |
| `apps/api/src/controllers/tokenPay.controller.ts` | **New** — route handlers |
| `apps/api/src/routes/account.routes.ts` | **Edit** — add routes |
| `packages/shared/src/types/tokenPay.types.ts` | **New** — shared types |
| `packages/shared/src/index.ts` | **Edit** — export types |
| `apps/web/src/features/account/services/tokenPay.api.ts` | **New** — API client |
| `apps/web/src/features/account/components/TokenPayPageContent.tsx` | **Edit** — real data |
| `apps/web/src/features/account/components/TokenTransactionFeed.tsx` | **Edit** — update types |
| `apps/web/src/features/account/components/TokenBalanceCard.tsx` | **Edit** — dynamic props |
| `apps/web/src/features/account/components/TokenTransactionDetailPanel.tsx` | **Edit** — update types |

---

## Verification Plan

1. **Migration**: Run `pnpm migrate` from `apps/api/`, verify table exists with `pnpm migrate:status`
2. **Odoo functions**: Test with a known user_key in development — verify balance and history return correctly
3. **API endpoints**: `curl` or browser devtools:
   - `GET /api/v1/account/token-pay/wallet` → returns balance
   - `GET /api/v1/account/token-pay/transactions?page=1&limit=10` → returns transactions
   - `GET /api/v1/account/token-pay/transactions?page=2&limit=10` → correct offset
4. **Frontend**: Open Token Pay page in browser → real balance displayed, transactions load with pagination, detail panel works
5. **Edge cases**: User with no loyalty card (404 or empty state), user with 0 transactions, pagination boundary between pending and Odoo records
