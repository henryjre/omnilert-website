# EPI Adjustment — Bidirectional Add/Deduct Design

**Date:** 2026-04-29
**Status:** Approved

## Context

The EPI Adjustment feature (formerly "Rewards") previously only supported adding EPI points. This spec upgrades it to support both additions and deductions, following the Token Pay issuance pattern. The key motivation is that managers need to be able to correct EPI scores in both directions — recognizing good performance (add) and addressing policy violations beyond the existing violation notice system (deduct).

---

## Decisions

| Decision               | Choice                                                            | Reason                                                                         |
| ---------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Direction encoding     | Signed `epi_delta` on request row                                 | No redundant `type` column; sign is self-documenting; approval math is trivial |
| Amount range           | No cap (was 0–5)                                                  | Managers need flexibility for large corrections                                |
| Decimal precision      | Up to 2 decimal places                                            | Allows fine-grained control                                                    |
| Multi-select employees | Kept for both add and deduct                                      | EPI adjustments commonly target groups                                         |
| Number formatting      | Strip trailing zeros (e.g., `+2` not `+2.00`, `+2.5` not `+2.50`) | Cleaner display                                                                |

---

## 1. Database

### Migration (050)

**`reward_requests` table:**

- Rename column `epi_points` → `epi_delta` (DECIMAL 5.2)
- Remove CHECK constraint `epi_points > 0 AND epi_points <= 5`
- Add CHECK constraint: `epi_delta <> 0` (non-zero, signed — positive = add, negative = deduct)

**`reward_request_targets` table:**

- `epi_delta` column already exists (DECIMAL 3.1) — widen to DECIMAL 5.2 to match, allow negative values
- No rename needed

### Approval math (unchanged in structure)

```
epiAfter = epiBefore + request.epi_delta
// epi_delta is signed, so deductions automatically subtract
```

### Analytics impact

`awardsTotalIncrease` sums `epi_delta` from `reward_request_targets`. With signed values, this now reflects net EPI impact automatically. No logic changes needed in snapshot/calculation services.

---

## 2. Backend

### Shared package (`packages/shared/`)

**`reward.schema.ts`:**

- Replace `epiPoints` field with `epiDelta`: `z.number().finite().refine(v => v !== 0).refine(v => Number((v * 100).toFixed(0)) === v * 100)` (non-zero, max 2 decimals)

**`reward.types.ts`:**

- Replace `epiPoints: number` with `epiDelta: number` on all relevant types

### API service (`apps/api/src/services/reward.service.ts`)

- Replace all `epi_points` column references with `epi_delta`
- Approval: `epiAfter = epiBefore + request.epi_delta` (works as-is once column renamed)
- `epi_delta` written to `reward_request_targets` is now signed

### Controller/routes

- No endpoint changes
- Update request body destructuring: `epiPoints` → `epiDelta`

### Snapshot/analytics services

- No logic changes needed — they already sum `epi_delta` from targets
- Verify: `summarizeDailyRewards` and `calcAwards` use `epi_delta` from targets (signed values will flow through correctly)

---

## 3. Frontend

### `epiAdjustmentFormatters.ts`

Update `formatRewardPoints` to strip trailing zeros:

- `2.00` → `2`, `2.50` → `2.5`, `1.75` → `1.75`
- Use `parseFloat(value.toFixed(2)).toString()` pattern

### `EpiAdjustmentCreateModal`

**New: type toggle (top of form)**

- Two-button toggle: "Add" (Star icon, emerald) | "Deduct" (Star icon, red)
- Default: `'add'`

**Amount field:**

- Rename internal state: `epiPoints` → `epiAmount` (always positive, user-entered)
- Remove 0–5 cap, remove 0.5 step → use `step="0.01"`, `min="0.01"`
- On submit: `epiDelta = type === 'add' ? epiAmount : -epiAmount`

**Contextual banner:**

- Add mode (emerald): "Approval will add [X] EPI to each selected employee."
- Deduct mode (red background): "Approval will deduct [X] EPI from each selected employee."

**Submit button:**

- Add mode: `variant="success"` (emerald)
- Deduct mode: `variant="danger"` (red)

### `EpiAdjustmentsPage`

**Layout change (matching Token Pay pattern):**

- **Desktop:** Status `ViewToggle` left-aligned, "New Adjustment" button right-aligned — same row
- **Mobile:** Status `ViewToggle` full-width, "New Adjustment" button full-width below it
- Replace `Sparkles` icon with `Star` in page header

### `EpiAdjustmentRequestCard`

- Replace `Sparkles` icon with `Star`
- Icon background + text: emerald for positive delta, red for negative delta
- Display: `+2.5 EPI adjustment` (emerald) or `-2.5 EPI adjustment` (red)
- Use updated `formatRewardPoints` for display

### `EpiAdjustmentDetailPanel`

- Replace header `+{epiPoints} EPI` with `{epiDelta > 0 ? '+' : ''}{formatRewardPoints(epiDelta)} EPI`
- Color: emerald for positive, red for negative
- "Reward Request" label → already updated to "EPI Adjustment Request"
- Per-target `epiBefore → epiAfter` display unchanged (absolute values)

---

## 4. Verification

1. **Migration:** Run `pnpm migrate` — verify `reward_requests.epi_delta` column exists, old `epi_points` gone
2. **Create add request:** Submit +2.5 EPI for 2 employees → status 'pending', `epi_delta = 2.5`
3. **Create deduct request:** Submit 1.75 EPI deduction for 1 employee → `epi_delta = -1.75` in DB
4. **Approve add:** Verify `epi_score` increases by 2.5, `epi_delta` in targets is +2.5
5. **Approve deduct:** Verify `epi_score` decreases by 1.75, `epi_delta` in targets is -1.75
6. **Reject:** Verify rejection reason stored, no EPI score change
7. **UI:** Add mode shows emerald toggle + banner; deduct shows red; button variant changes
8. **Layout:** Desktop shows button beside ViewToggle; mobile shows button below
9. **Formatting:** Whole numbers show without decimals (`+3` not `+3.00`), `.5` shows one decimal
10. **Analytics:** `awardsTotalIncrease` in snapshots reflects net delta (positive - negative)
