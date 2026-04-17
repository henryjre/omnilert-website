# Company Logo Design

**Date:** 2026-04-17
**Status:** Approved

## Summary

Add per-company logo support: uploadable via the CompanyDetailPanel, displayed in CompanyCards (replacing the color dot), and shown as stacked avatars in the BranchSelector trigger button.

---

## Section 1 — Data Layer

### DB Migration
Add `logo_url VARCHAR(500) NULL` to the `companies` table. No unique index required.

### Backend API Changes

**`mapCompany()` in `company.controller.ts`**
Add `logoUrl: company.logo_url ?? null` to the mapped output. All endpoints using `mapCompany()` (including `GET /super/companies/all`) automatically include `logoUrl`.

**New endpoint: `POST /super/companies/:id/logo`**
- Super-admin authenticated
- multer single-file upload (`field: 'logo'`)
- Validates MIME type: allow `image/jpeg`, `image/png`, `image/webp`, `image/gif` only
- Max file size: 5MB (enforced by multer)
- Deletes existing logo folder first if `logo_url` is set: `buildTenantStoragePrefix(companyStorageRoot, 'Company Logos', companyId)`
- Uploads to same folder path via `uploadFile()`
- Updates `companies.logo_url` with the new URL
- Returns updated company via `mapCompany()`

**`GET /user/assigned-branches`**
Include `logoUrl` per company group in the response so the branch store can flow it into `companyBranchGroups`. The assigned-branches controller/query must select `companies.logo_url` and include it in the response shape.

---

## Section 2 — State & Type Layer

**`Company` interface (`CompanyCard.tsx`)**
Add `logoUrl: string | null`.

**`SelectorCompanySnapshot` and `SelectorCompanyGroup` (`branchSelectorState.ts`)**
Add `logoUrl?: string | null` to both interfaces. Thread it through `buildSelectorCompanyGroupsFromSnapshots()`.

**`branchStore.ts`**
Map `logoUrl` from the `/user/assigned-branches` response into the snapshot objects passed to `buildSelectorCompanyGroupsFromSnapshots`.

No new Zustand stores needed.

---

## Section 3 — CompanyDetailPanel (logo upload)

File: `apps/web/src/features/company/components/CompanyDetailPanel.tsx`

Add a **Logo** section above the Company Name field:

- 80×80px square preview with rounded corners
  - If `logoUrl`: `<img>` with `object-cover`, theme color as bg while loading
  - If no `logoUrl`: first letter of company name centered, theme color background, white text
- "Change Logo" button below the preview triggers a hidden `<input type="file" accept="image/jpeg,image/png,image/webp,image/gif">`
- On file select:
  1. Show loading spinner overlay on the preview
  2. `POST /super/companies/:id/logo` as `multipart/form-data` with field `logo`
  3. On success: update local `logoUrl` state, call `onSaved(updated)`
  4. On error: show error toast, revert spinner, leave existing logo unchanged
- Logo saves immediately on file select — no interaction with the Save Changes button

---

## Section 4 — CompanyCard (logo replaces dot)

File: `apps/web/src/features/company/components/CompanyCard.tsx`

Replace the `h-4 w-4` theme color dot with a 16×16px rounded-full avatar:
- If `logoUrl`: `<img src={logoUrl}` with `object-cover`, `onError` fallback to initial circle
- If no `logoUrl`: circle with theme color background, first letter of company name in white, small font

---

## Section 5 — BranchSelector (stacked company logos)

File: `apps/web/src/shared/components/BranchSelector.tsx`

**Trigger button icon area** — replace the `GitBranch` circle with a stacked avatars component:

- Derive unique companies from committed `selectedBranchIds` (not draft)
- Each company avatar: 20×20px rounded-full with white ring border (`ring-2 ring-white`) for stack separation
- Stack layout: `-ml-1.5` on each avatar after the first
- Logo presence:
  - Has `logoUrl`: `<img>` with `object-cover`, `onError` fallback to initial circle
  - No `logoUrl`: first letter + theme color background (same pattern as card)
- Cap at 3 visible avatars; if more than 3 unique companies, show 2 logos + a `+N` gray circle
- Fallback when no companies resolved: show first-letter avatar of first company

**BranchSelector dropdown — company group headers**
Replace the `Building2` icon with a 16×16px logo/initial avatar (same pattern, matches card size).

**BranchSelector dropdown header**
The `GitBranch` icon in `BranchSelectorContent` header stays — it's decorative and doesn't need to change.

---

## Section 6 — Error Handling & Edge Cases

- **Upload validation**: reject non-image MIME on backend; max 5MB via multer
- **Upload failure**: error toast, existing logo unchanged, spinner reverted
- **Broken image URL**: `onError` on all `<img>` elements falls back to initial/color circle — no broken image icons shown anywhere
- **No logo (BranchSelector)**: render first-letter avatar of first company — no regression to GitBranch icon
- **Missing `logoUrl` from API**: treat as `null`, graceful degradation to initial avatar everywhere

---

## Files to Create / Modify

### New
- `apps/api/src/migrations/037_add_logo_url_to_companies.ts`

### Modified — Backend
- `apps/api/src/controllers/company.controller.ts` — `mapCompany()` + new `uploadLogo` handler
- `apps/api/src/routes/super.routes.ts` — register `POST /super/companies/:id/logo` with multer
- `apps/api/src/controllers/assignedBranch.controller.ts` — include `logoUrl` in company group response

### Modified — Frontend
- `apps/web/src/features/company/components/CompanyCard.tsx` — avatar replaces dot
- `apps/web/src/features/company/components/CompanyDetailPanel.tsx` — logo upload section
- `apps/web/src/shared/components/branchSelectorState.ts` — add `logoUrl` to interfaces
- `apps/web/src/shared/store/branchStore.ts` — map `logoUrl` from API response
- `apps/web/src/shared/components/BranchSelector.tsx` — stacked avatars on trigger + company group headers
