# Skill: Odoo Provisioning

## Identity Model

- Canonical partner = `res.partner`, resolved by `x_website_key` (fallback: email).
- Employees = `hr.employee`, bound to partner via `work_contact_id`.
- `x_website_key` is the primary identity key. Employee `x_website_key` is legacy fallback only.

## PIN Rules (read carefully)

- Reuse the existing 4-digit PIN for same `x_website_key` if one already exists.
- Only generate a new random PIN when none is found.
- One PIN is shared across all branches in the same approval/provisioning run.
- PIN maps to `x_website_key` (barcode) in Odoo.

## Registration Approval — What Gets Created

1. Resolve or create global identity in `employee_identities` by normalized email.
2. Merge active `res.partner` contacts by email → select canonical → write `company_id = false`, `x_website_key`, prefixed name, append `category_id` tag `3`.
3. Create/update `hr.employee` for every assigned active branch.
4. **Always** create/update one `hr.employee` on Odoo `company_id = 1` — regardless of assigned branches.
5. Create/update global user + role assignments + company access in `users`, `user_roles`, `user_company_access`.
6. Decrypt password (stored encrypted via `utils/secureText.ts`) only at approval time.
7. Employee barcode collision is checked against Odoo before assignment.

## Name Formatting

Helper functions in `apps/api/src/services/odoo.service.ts`:

- `formatBranchEmployeeCode(odooBranchId, employeeNumber)` → barcode
- `formatEmployeeDisplayName(...)` → `<branch-code> - <First Last>`

Name updates must preserve this prefixed format when context is available.

## Personal Information Sync (on verification approval)

Synced to Odoo: name, email, mobile, legal name, birthday, gender, address (`private_street`), emergency contact name/phone.
NOT synced (DB only): SSS, TIN, Pag-IBIG, PhilHealth, marital status, emergency relationship.

## Avatar Sync

- `/users/me/avatar` upload → updates website user avatar → async sync to canonical `res.partner` + all linked `hr.employee` records.
- User Management create → fill-if-empty import from Odoo `res.partner.image_1920` → upload to `Profile Pictures/{userId}` → write `users.avatar_url`. Continue with warning if import fails — never block.

## Bank Auto-Fill on User Create

Order of resolution:

1. Resolve canonical partner by `x_website_key` (fallback email).
2. Prefer existing `hr.employee.bank_account_ids` when valid.
3. Fallback: latest `res.partner.bank` by `write_date`.
4. Attach missing `bank_account_ids` to linked employees via `work_contact_id`.
5. Write `users.bank_id` and `users.bank_account_number` (via `user_sensitive_info`).
6. Seed approved `bank_information_verifications` record for each assigned company.

**Never block user creation if any step fails.** Log and continue.

## Storage Paths

Always use `buildTenantStoragePrefix(companyStorageRoot, ...parts)`.
`companyStorageRoot` = `${slug}-prod` or `${slug}-dev` — never hardcode.

Upload paths:

- Cash requests: `{root}/Cash Requests/{userId}`
- Valid IDs: `{root}/Valid IDs/{userId}`
- Employment requirements: `{root}/Employment Requirements/{userId}/{requirementCode}`
- Profile pictures: `{root}/Profile Pictures/{userId}`
- POS verifications: `{root}/POS Verifications/{userId}`
- Case report attachments: `{root}/Case Reports/CASE-{caseNumber}/{filename}`
- Violation notice files (issuance + disciplinary): `{root}/Violation Notices/VN-{vnNumber}/{filename}`

## POS Order Webhook (CSS Audit Trigger)

Route: `POST /webhooks/odoo/pos-order` — uses API key auth (X-API-Key), no JWT.

10% server-side sampling: if `Math.random() > 0.1`, return 200 silently. Only proceed with audit creation for the remaining 10%.

Silently skip (return 200) when `x_website_key` is empty or missing — the cashier cannot be identified.

Reward computation from `amount_total`:

- < 150 → ₱7–10
- 150–399 → ₱10–15
- 400–799 → ₱15–25
- ≥ 800 → ₱25–30

## Compliance Audit Cron

Runs hourly via `setInterval` initialized in `server.ts`. Queries Odoo `hr.attendance` for active records (`check_out = false`), excluding `company_id = 1`. Picks one at random, resolves company from `company_id`, inserts a `compliance` type audit into `store_audits` (with `company_id` from `branches` table lookup).

## Branch Resolution in Webhooks

Webhooks no longer iterate per-company databases to find a branch. Branch lookup is a single query:

```sql
SELECT company_id FROM branches WHERE odoo_branch_id = ?
```

`company_id` is then used to scope all subsequent inserts.

## Company Hard Delete

Steps in `services/company.service.ts`:

1. Validate current user is active superuser.
2. Re-authenticate with super-admin credentials (must match current session email).
3. Validate typed company name matches.
4. Set `companies.is_active = false`.
5. Revoke refresh tokens + emit `auth:force-logout`.
6. Storage cleanup (recursive company prefix sweep, then legacy paths).
7. Best-effort queue cleanup in pg-boss tables by company ID.
8. Delete company row — ON DELETE CASCADE removes all company-scoped rows across all tables atomically.
9. Return warnings for partial failures — do not throw on cleanup errors.

Scope: Omnilert-managed data only. Does not touch Odoo records.
