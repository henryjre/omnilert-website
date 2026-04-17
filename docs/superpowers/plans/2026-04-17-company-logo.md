# Company Logo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-company logo support — uploadable via CompanyDetailPanel and CompanyCreateModal, displayed in CompanyCards and the BranchSelector trigger button as stacked avatars.

**Architecture:** Backend adds a `logo_url` column to `companies`, a new `POST /super/companies/:id/logo` upload endpoint, and threads `logoUrl` through the assigned-branches API. Frontend introduces a shared `CompanyAvatar` component used consistently in CompanyCard, CompanyDetailPanel, CompanyCreateModal, and BranchSelector.

**Tech Stack:** TypeScript, Express 4, Knex 3, multer (memoryStorage), DigitalOcean Spaces (S3-compatible), React 18, Tailwind CSS 3, Framer Motion (already installed).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/api/src/migrations/037_add_logo_url_to_companies.ts` | Create | Add `logo_url` column |
| `apps/api/src/controllers/company.controller.ts` | Modify | `mapCompany()` + `uploadLogo` handler |
| `apps/api/src/routes/super.routes.ts` | Modify | Register logo upload route with multer |
| `apps/api/src/services/assignedBranch.service.ts` | Modify | Select `c.logo_url`, add to group shape |
| `apps/web/src/features/company/components/CompanyAvatar.tsx` | Create | Shared avatar: logo img or initial+color circle |
| `apps/web/src/features/company/components/CompanyCard.tsx` | Modify | Use `CompanyAvatar` (16px), add `logoUrl` to type |
| `apps/web/src/features/company/components/CompanyDetailPanel.tsx` | Modify | Logo upload section using `CompanyAvatar` |
| `apps/web/src/features/company/components/CompanyCreateModal.tsx` | Modify | Logo file picker + post-create upload |
| `apps/web/src/shared/components/branchSelectorState.ts` | Modify | Add `logoUrl` to interfaces + thread through |
| `apps/web/src/shared/store/branchStore.ts` | Modify | Map `logoUrl` from API response |
| `apps/web/src/shared/components/BranchSelector.tsx` | Modify | Stacked avatars on trigger, avatar in group headers |

---

## Task 1: DB Migration — add `logo_url` to companies

**Files:**
- Create: `apps/api/src/migrations/037_add_logo_url_to_companies.ts`

- [ ] **Step 1: Create migration file**

```typescript
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('companies', (table) => {
    table.string('logo_url', 500).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('companies', (table) => {
    table.dropColumn('logo_url');
  });
}
```

- [ ] **Step 2: Run the migration**

From `apps/api/`:
```bash
pnpm migrate
```
Expected: `Batch N run: 1 migrations`

- [ ] **Step 3: Verify**

```bash
pnpm migrate:status
```
Expected: `037_add_logo_url_to_companies` shows as `Completed`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/migrations/037_add_logo_url_to_companies.ts
git commit -m "feat(db): add logo_url column to companies table"
```

---

## Task 2: Backend — `mapCompany()` + `uploadLogo` handler

**Files:**
- Modify: `apps/api/src/controllers/company.controller.ts`

- [ ] **Step 1: Add `logoUrl` to `mapCompany()`**

In `apps/api/src/controllers/company.controller.ts`, find the `mapCompany` function and add `logoUrl` after `companyCode`:

```typescript
function mapCompany(company: any) {
  return {
    id: company.id,
    name: company.name,
    slug: company.slug,
    dbName: company.db_name,
    dbHost: company.db_host,
    dbPort: company.db_port,
    isActive: company.is_active,
    isRoot: company.is_root ?? false,
    odooApiKey: company.odoo_api_key,
    themeColor: company.theme_color ?? '#2563EB',
    companyCode: company.company_code ?? null,
    logoUrl: company.logo_url ?? null,
    canDeleteCompany: company.canDeleteCompany ?? false,
    createdAt: company.created_at,
    updatedAt: company.updated_at,
  };
}
```

- [ ] **Step 2: Add the `uploadLogo` export handler**

Add this function at the end of `apps/api/src/controllers/company.controller.ts`, before the closing of the file. It requires importing `uploadFile`, `buildTenantStoragePrefix`, `deleteFolder` from the storage service, and `db` from the database config, and `AppError` is already imported:

```typescript
import { uploadFile, buildTenantStoragePrefix, deleteFolder } from '../services/storage.service.js';
import { db } from '../config/database.js';
import { getCompanyStorageRoot } from '../services/storage.service.js';
```

Add these imports at the top of the file alongside existing imports, then add the handler:

```typescript
export async function uploadLogo(req: Request, res: Response, next: NextFunction) {
  try {
    const superAdmin = req.superAdmin;
    if (!superAdmin) throw new AppError(401, 'Unauthorized');

    const file = req.file as Express.Multer.File | undefined;
    if (!file) throw new AppError(400, 'No file uploaded');

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.mimetype)) {
      throw new AppError(400, 'Only JPEG, PNG, WebP, or GIF images are allowed');
    }

    const companyId = req.params.id as string;
    const company = await db.getDb()('companies').where({ id: companyId }).first();
    if (!company) throw new AppError(404, 'Company not found');

    const companyStorageRoot = getCompanyStorageRoot(company.slug);
    const folderPath = buildTenantStoragePrefix(companyStorageRoot, 'Company Logos', companyId);

    if (company.logo_url) {
      await deleteFolder(folderPath);
    }

    const logoUrl = await uploadFile(file.buffer, file.originalname, file.mimetype, folderPath);
    if (!logoUrl) throw new AppError(500, 'Failed to upload logo');

    const [updated] = await db.getDb()('companies')
      .where({ id: companyId })
      .update({ logo_url: logoUrl, updated_at: new Date() })
      .returning('*');

    res.json({ success: true, data: mapCompany(updated) });
  } catch (err) {
    next(err);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/controllers/company.controller.ts
git commit -m "feat(api): add logoUrl to mapCompany and uploadLogo handler"
```

---

## Task 3: Backend — register logo upload route

**Files:**
- Modify: `apps/api/src/routes/super.routes.ts`

- [ ] **Step 1: Add multer import and setup at the top of the file**

After the existing imports in `apps/api/src/routes/super.routes.ts`, add:

```typescript
import multer from 'multer';

const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});
```

- [ ] **Step 2: Register the route**

Add this route after the existing `POST /companies/:id/delete` route (around line 77):

```typescript
// Super admin logo upload
router.post(
  '/companies/:id/logo',
  authenticateSuperAdmin,
  logoUpload.single('logo'),
  companyController.uploadLogo,
);
```

- [ ] **Step 3: Verify TypeScript compiles**

From `apps/api/`:
```bash
pnpm exec tsc --noEmit
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/super.routes.ts
git commit -m "feat(api): register POST /super/companies/:id/logo route"
```

---

## Task 4: Backend — thread `logoUrl` through assigned-branches

**Files:**
- Modify: `apps/api/src/services/assignedBranch.service.ts`

- [ ] **Step 1: Update `AssignedBranchGroup` interface**

At the top of `apps/api/src/services/assignedBranch.service.ts`, update the interface:

```typescript
export interface AssignedBranchGroup {
  companyId: string;
  companyName: string;
  companySlug: string;
  logoUrl: string | null;
  branches: Array<{
    id: string;
    name: string;
    odoo_branch_id: string | null;
  }>;
}
```

- [ ] **Step 2: Add `c.logo_url as company_logo_url` to all three query `.select()` calls**

Each of the three query branches (isSuperAdmin, canViewAllBranches, else) has a `.select(...)` call. Add `'c.logo_url as company_logo_url'` to each. Example for the first:

```typescript
.select(
  'c.id as company_id',
  'c.name as company_name',
  'c.slug as company_slug',
  'c.logo_url as company_logo_url',
  'b.id as branch_id',
  'b.name as branch_name',
  'b.odoo_branch_id',
)
```

Apply the same addition to the other two query `.select()` calls.

- [ ] **Step 3: Update the row type annotation and groupMap population**

Update the `rows` type annotation to include `company_logo_url: string | null`:

```typescript
let rows: Array<{
  company_id: string;
  company_name: string;
  company_slug: string;
  company_logo_url: string | null;
  branch_id: string;
  branch_name: string;
  odoo_branch_id: string | null;
}>;
```

Update the group creation in the `groupMap` loop:

```typescript
group = {
  companyId: String(row.company_id),
  companyName: String(row.company_name),
  companySlug: String(row.company_slug),
  logoUrl: row.company_logo_url ?? null,
  branches: [],
};
```

- [ ] **Step 4: Verify TypeScript compiles**

From `apps/api/`:
```bash
pnpm exec tsc --noEmit
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/assignedBranch.service.ts
git commit -m "feat(api): include logoUrl in assigned-branches response"
```

---

## Task 5: Frontend — `CompanyAvatar` shared component

This component is used at three sizes across four files. Build it once here.

**Files:**
- Create: `apps/web/src/features/company/components/CompanyAvatar.tsx`

- [ ] **Step 1: Create the component**

```typescript
interface CompanyAvatarProps {
  name: string;
  logoUrl: string | null | undefined;
  themeColor: string;
  size: number; // px — passed as inline style
  className?: string;
}

export function CompanyAvatar({ name, logoUrl, themeColor, size, className = '' }: CompanyAvatarProps) {
  const initial = name.trim()[0]?.toUpperCase() ?? '?';

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className={`rounded-full object-cover ${className}`}
        style={{ width: size, height: size, backgroundColor: themeColor }}
        onError={(e) => {
          // Fallback to initial circle on broken URL
          const target = e.currentTarget;
          target.style.display = 'none';
          const sibling = target.nextElementSibling as HTMLElement | null;
          if (sibling) sibling.style.display = 'flex';
        }}
      />
    );
  }

  return (
    <span
      className={`flex items-center justify-center rounded-full font-semibold text-white ${className}`}
      style={{ width: size, height: size, backgroundColor: themeColor, fontSize: Math.max(8, Math.round(size * 0.45)) }}
    >
      {initial}
    </span>
  );
}
```

**Note:** The `onError` fallback above requires a sibling element for the broken-URL case. A cleaner pattern is to manage a local error state. Rewrite as:

```typescript
import { useState } from 'react';

interface CompanyAvatarProps {
  name: string;
  logoUrl: string | null | undefined;
  themeColor: string;
  size: number;
  className?: string;
}

export function CompanyAvatar({ name, logoUrl, themeColor, size, className = '' }: CompanyAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const initial = name.trim()[0]?.toUpperCase() ?? '?';
  const fontSize = Math.max(8, Math.round(size * 0.45));

  if (logoUrl && !imgError) {
    return (
      <img
        src={logoUrl}
        alt={name}
        className={`rounded-full object-cover ${className}`}
        style={{ width: size, height: size, backgroundColor: themeColor }}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <span
      className={`flex items-center justify-center rounded-full font-semibold text-white ${className}`}
      style={{ width: size, height: size, backgroundColor: themeColor, fontSize }}
    >
      {initial}
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/features/company/components/CompanyAvatar.tsx
git commit -m "feat(web): add CompanyAvatar shared component"
```

---

## Task 6: Frontend — update `Company` type and `CompanyCard`

**Files:**
- Modify: `apps/web/src/features/company/components/CompanyCard.tsx`

- [ ] **Step 1: Add `logoUrl` to the `Company` interface and replace dot**

Replace the entire file content:

```typescript
import { Badge } from '@/shared/components/ui/Badge';
import { Card, CardBody } from '@/shared/components/ui/Card';
import { CompanyAvatar } from './CompanyAvatar';

export interface Company {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  isRoot: boolean;
  themeColor: string;
  companyCode: string | null;
  odooApiKey: string | null;
  logoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CompanyCardProps {
  company: Company;
  onSelect: (company: Company) => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function CompanyCard({ company, onSelect }: CompanyCardProps) {
  return (
    <button
      type="button"
      className="w-full text-left"
      onClick={() => onSelect(company)}
    >
      <Card className="h-full cursor-pointer transition-shadow hover:shadow-md">
        <CardBody>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <CompanyAvatar
                name={company.name}
                logoUrl={company.logoUrl}
                themeColor={company.themeColor}
                size={16}
                className="mt-0.5 shrink-0"
              />
              <span className="truncate font-semibold text-gray-900">{company.name}</span>
            </div>
            <Badge variant={company.isActive ? 'success' : 'danger'}>
              {company.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>

          <div className="mt-3 space-y-1">
            <p className="text-xs text-gray-500">
              <span className="font-medium text-gray-600">Slug:</span> {company.slug}
            </p>
            {company.companyCode ? (
              <p className="text-xs text-gray-500">
                <span className="font-medium text-gray-600">Code:</span>{' '}
                <span className="font-mono">{company.companyCode}</span>
              </p>
            ) : null}
            <p className="text-xs text-gray-400">Created {formatDate(company.createdAt)}</p>
          </div>
        </CardBody>
      </Card>
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/features/company/components/CompanyCard.tsx
git commit -m "feat(web): replace color dot with CompanyAvatar in CompanyCard"
```

---

## Task 7: Frontend — logo upload in `CompanyDetailPanel`

**Files:**
- Modify: `apps/web/src/features/company/components/CompanyDetailPanel.tsx`

- [ ] **Step 1: Add `logoUrl` state and `useRef` for file input**

Add these to the existing state declarations after `const [saving, setSaving] = useState(false);`:

```typescript
const [logoUrl, setLogoUrl] = useState<string | null>(null);
const [logoUploading, setLogoUploading] = useState(false);
const logoInputRef = useRef<HTMLInputElement>(null);
```

Add `useRef` to the existing React import at the top.

- [ ] **Step 2: Initialize `logoUrl` from company in the `useEffect`**

In the existing `useEffect` that sets state from `company`, add:

```typescript
setLogoUrl(company.logoUrl ?? null);
```

- [ ] **Step 3: Add `handleLogoChange` function**

Add before `handleSave`:

```typescript
async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file || !company) return;

  setLogoUploading(true);
  try {
    const formData = new FormData();
    formData.append('logo', file);
    const res = await api.post(`/super/companies/${company.id}/logo`, formData);
    const updated = res.data.data as Company;
    setLogoUrl(updated.logoUrl);
    onSaved(updated);
    showSuccess('Logo updated.');
  } catch (err: any) {
    showError(err.response?.data?.error || 'Failed to upload logo.');
  } finally {
    setLogoUploading(false);
    // Reset input so the same file can be re-selected
    if (logoInputRef.current) logoInputRef.current.value = '';
  }
}
```

- [ ] **Step 4: Add logo section JSX above the Company Name `Input`**

In the scrollable body `<div className="space-y-4">`, insert this before the first `<Input id="edit-company-name" ...>`:

```tsx
{/* Logo */}
<div>
  <label className="mb-1.5 block text-sm font-medium text-gray-700">Company Logo</label>
  <div className="flex items-center gap-4">
    <div className="relative">
      <CompanyAvatar
        name={name || company?.name || '?'}
        logoUrl={logoUrl}
        themeColor={isValidHexColor(themeColor) ? themeColor : '#2563EB'}
        size={80}
        className="rounded-xl"
      />
      {logoUploading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40">
          <Spinner size="sm" />
        </div>
      )}
    </div>
    <div>
      <button
        type="button"
        onClick={() => logoInputRef.current?.click()}
        disabled={logoUploading}
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        {logoUrl ? 'Change Logo' : 'Upload Logo'}
      </button>
      <p className="mt-1 text-xs text-gray-400">JPEG, PNG, WebP or GIF · max 5 MB</p>
    </div>
  </div>
  <input
    ref={logoInputRef}
    type="file"
    accept="image/jpeg,image/png,image/webp,image/gif"
    className="hidden"
    onChange={handleLogoChange}
  />
</div>
```

- [ ] **Step 5: Add imports**

At the top of `CompanyDetailPanel.tsx`, add:

```typescript
import { CompanyAvatar } from './CompanyAvatar';
import { Spinner } from '@/shared/components/ui/Spinner';
```

`Spinner` is already imported — verify and skip if so. Add `CompanyAvatar` import.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/company/components/CompanyDetailPanel.tsx
git commit -m "feat(web): add logo upload section to CompanyDetailPanel"
```

---

## Task 8: Frontend — optional logo in `CompanyCreateModal`

**Files:**
- Modify: `apps/web/src/features/company/components/CompanyCreateModal.tsx`

- [ ] **Step 1: Add `logoFile` to state and `useRef` for file input**

Add after the existing `const [submitting, setSubmitting] = useState(false);`:

```typescript
const [logoFile, setLogoFile] = useState<File | null>(null);
const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
const logoInputRef = useRef<HTMLInputElement>(null);
```

Add `useRef` to the existing React import.

- [ ] **Step 2: Add file selection handler**

Add before `handleClose`:

```typescript
function handleLogoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0] ?? null;
  if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
  setLogoFile(file);
  setLogoPreviewUrl(file ? URL.createObjectURL(file) : null);
}
```

- [ ] **Step 3: Clear logo state in `handleClose`**

In the existing `handleClose` function, add after the existing resets:

```typescript
if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
setLogoFile(null);
setLogoPreviewUrl(null);
```

- [ ] **Step 4: Upload logo after company creation in `handleSubmit`**

In the existing `handleSubmit` function, replace:

```typescript
onCreated(createData.data as Company);
handleClose();
```

With:

```typescript
let createdCompany = createData.data as Company;

if (logoFile) {
  try {
    const formData = new FormData();
    formData.append('logo', logoFile);
    const logoRes = await fetch(`/api/v1/super/companies/${createdCompany.id}/logo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authData.data.accessToken}` },
      body: formData,
    });
    if (logoRes.ok) {
      const logoData = await logoRes.json();
      createdCompany = logoData.data as Company;
    } else {
      // Non-blocking: company already created
      setError('Company created, but logo upload failed. You can upload it from the detail panel.');
    }
  } catch {
    setError('Company created, but logo upload failed. You can upload it from the detail panel.');
  }
}

onCreated(createdCompany);
if (!error) handleClose();
```

**Note:** If there was a logo upload error, `setError` was already called — we should still call `onCreated` but NOT close the modal so the user sees the warning. The code above handles this: `handleClose()` is only called when there's no error.

- [ ] **Step 5: Add logo preview JSX to the form step**

In the `step === 'form'` branch, add this before the Company Name `<Input>`:

```tsx
{/* Logo preview + upload */}
<div>
  <label className="mb-1.5 block text-sm font-medium text-gray-700">
    Company Logo <span className="font-normal text-gray-400">(optional)</span>
  </label>
  <div className="flex items-center gap-4">
    <CompanyAvatar
      name={form.name || 'N'}
      logoUrl={logoPreviewUrl}
      themeColor={isValidHexColor(form.themeColor) ? form.themeColor : '#2563EB'}
      size={80}
      className="rounded-xl"
    />
    <div>
      <button
        type="button"
        onClick={() => logoInputRef.current?.click()}
        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        {logoFile ? 'Change' : 'Upload'}
      </button>
      <p className="mt-1 text-xs text-gray-400">JPEG, PNG, WebP or GIF · max 5 MB</p>
    </div>
  </div>
  <input
    ref={logoInputRef}
    type="file"
    accept="image/jpeg,image/png,image/webp,image/gif"
    className="hidden"
    onChange={handleLogoFileChange}
  />
</div>
```

- [ ] **Step 6: Add `CompanyAvatar` import**

```typescript
import { CompanyAvatar } from './CompanyAvatar';
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/company/components/CompanyCreateModal.tsx
git commit -m "feat(web): add optional logo upload to CompanyCreateModal"
```

---

## Task 9: Frontend — thread `logoUrl` through branch state

**Files:**
- Modify: `apps/web/src/shared/components/branchSelectorState.ts`
- Modify: `apps/web/src/shared/store/branchStore.ts`

- [ ] **Step 1: Add `logoUrl` to `SelectorCompanySnapshot` and `SelectorCompanyGroup`**

In `apps/web/src/shared/components/branchSelectorState.ts`, update both interfaces:

```typescript
export interface SelectorBranch {
  id: string;
  name: string;
  companyId: string;
  companyName: string;
  odoo_branch_id?: string | null;
}

export interface SelectorCompanyGroup {
  id: string;
  name: string;
  slug?: string | null;
  logoUrl?: string | null;
  branches: SelectorBranch[];
}

export interface SelectorCompanySnapshot {
  id: string;
  name: string;
  slug?: string | null;
  logoUrl?: string | null;
  branches: Array<{
    id: string;
    name: string;
    odoo_branch_id?: string | null;
  }>;
}
```

- [ ] **Step 2: Thread `logoUrl` through `buildSelectorCompanyGroupsFromSnapshots`**

In the same file, update the mapping inside `buildSelectorCompanyGroupsFromSnapshots`:

```typescript
export function buildSelectorCompanyGroupsFromSnapshots(
  snapshots: SelectorCompanySnapshot[],
  currentCompanySlug?: string | null,
): SelectorCompanyGroup[] {
  return snapshots
    .map((snapshot) => ({
      id: snapshot.id,
      name: snapshot.name,
      slug: snapshot.slug ?? null,
      logoUrl: snapshot.logoUrl ?? null,
      branches: sortSelectorBranches(
        snapshot.branches.map((branch) => ({
          id: branch.id,
          name: branch.name,
          odoo_branch_id: branch.odoo_branch_id ?? null,
          companyId: snapshot.id,
          companyName: snapshot.name,
        })),
      ),
    }))
    // ... rest of existing logic (sort/filter by currentCompanySlug if any)
```

Read the full existing function before editing to preserve any sorting/filtering logic already there.

- [ ] **Step 3: Map `logoUrl` in `branchStore.ts`**

In `apps/web/src/shared/store/branchStore.ts`, update the `fetchBranches` function. Find the `groups` type annotation and the `snapshots` mapping:

```typescript
const groups: Array<{
  companyId: string;
  companyName: string;
  companySlug: string;
  logoUrl: string | null;
  branches: Array<{ id: string; name: string; odoo_branch_id: string | null }>;
}> = res.data.data || [];

const snapshots = groups.map((g) => ({
  id: g.companyId,
  name: g.companyName,
  slug: g.companySlug,
  logoUrl: g.logoUrl ?? null,
  branches: g.branches,
}));
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/shared/components/branchSelectorState.ts apps/web/src/shared/store/branchStore.ts
git commit -m "feat(web): thread logoUrl through branch selector state"
```

---

## Task 10: Frontend — stacked avatars in `BranchSelector`

**Files:**
- Modify: `apps/web/src/shared/components/BranchSelector.tsx`

- [ ] **Step 1: Add `CompanyAvatarStack` component inside BranchSelector.tsx**

Add this before the `BranchSelectorContent` function:

```typescript
import { CompanyAvatar } from '@/features/company/components/CompanyAvatar';
```

Add at the top of the file alongside other imports.

Then add the `CompanyAvatarStack` component before `BranchSelectorContent`:

```tsx
function CompanyAvatarStack({ groups, selectedBranchIds }: {
  groups: SelectorCompanyGroup[];
  selectedBranchIds: string[];
}) {
  // Derive unique companies that have at least one selected branch, preserving group order
  const activeCompanies = groups.filter((g) =>
    g.branches.some((b) => selectedBranchIds.includes(b.id))
  );

  if (activeCompanies.length === 0 && groups.length > 0) {
    // Fallback: show first group
    const first = groups[0];
    return (
      <CompanyAvatar name={first.name} logoUrl={first.logoUrl} themeColor="#2563EB" size={20} />
    );
  }

  const visible = activeCompanies.slice(0, activeCompanies.length > 3 ? 2 : 3);
  const overflow = activeCompanies.length > 3 ? activeCompanies.length - 2 : 0;

  return (
    <div className="flex items-center">
      {visible.map((company, i) => (
        <div
          key={company.id}
          className={`ring-2 ring-white rounded-full ${i > 0 ? '-ml-1.5' : ''}`}
        >
          <CompanyAvatar
            name={company.name}
            logoUrl={company.logoUrl ?? null}
            themeColor="#2563EB"
            size={20}
          />
        </div>
      ))}
      {overflow > 0 && (
        <div className="-ml-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 ring-2 ring-white text-[9px] font-semibold text-gray-600">
          +{overflow}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Replace `GitBranch` circle on the trigger button**

In the `BranchSelector` component's return JSX, find the trigger button:

```tsx
<span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600">
  <GitBranch className="h-3.5 w-3.5" />
</span>
```

Replace with:

```tsx
<span className="flex shrink-0 items-center justify-center">
  <CompanyAvatarStack groups={companyBranchGroups} selectedBranchIds={selectedBranchIds} />
</span>
```

Note: use committed `selectedBranchIds` from the store (already destructured at the top of `BranchSelector`), not `draftIds`.

- [ ] **Step 3: Replace `Building2` icon in company group headers inside `BranchSelectorContent`**

`BranchSelectorContent` receives `companyBranchGroups` as a prop. Add `companyBranchGroups` to its props interface, then replace the `Building2` icon in the group header:

Update `BranchSelectorContent` props:

```typescript
function BranchSelectorContent({
  companyBranchGroups,
  selectedBranchIds,
  // ... rest unchanged
}: {
  companyBranchGroups: SelectorCompanyGroup[];
  selectedBranchIds: string[];
  // ... rest unchanged
})
```

`companyBranchGroups` is already passed as a prop — verify. Then in the company group header, replace:

```tsx
<Building2 className="h-3.5 w-3.5 shrink-0 text-gray-400" />
```

With:

```tsx
<CompanyAvatar
  name={company.name}
  logoUrl={company.logoUrl ?? null}
  themeColor="#2563EB"
  size={16}
  className="shrink-0"
/>
```

- [ ] **Step 4: Remove unused `Building2` and `GitBranch` imports if no longer used**

Check if `GitBranch` and `Building2` are still referenced elsewhere in the file. If not, remove them from the lucide-react import.

- [ ] **Step 5: Verify TypeScript compiles**

From root:
```bash
pnpm exec tsc --noEmit -p apps/web/tsconfig.json
```
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/shared/components/BranchSelector.tsx
git commit -m "feat(web): replace GitBranch icon with stacked CompanyAvatar in BranchSelector"
```

---

## Task 11: Final verification

- [ ] **Step 1: Start dev servers**

From root:
```bash
pnpm up:dev
```

- [ ] **Step 2: Verify CompanyCard**
  - Navigate to the Companies page (super admin)
  - Companies without a logo should show a colored initial circle (no broken icons)
  - Companies with a logo should show the logo image

- [ ] **Step 3: Verify CompanyDetailPanel logo upload**
  - Click a company card to open the detail panel
  - The logo preview should show above Company Name
  - Click "Upload Logo", select a JPEG/PNG — it should save immediately and update the card
  - Verify the `logo_url` is persisted: reload the page and check the logo still shows

- [ ] **Step 4: Verify CompanyCreateModal**
  - Click "Create Company"
  - The logo upload preview should appear above Company Name (live initial preview updates as you type the name)
  - Create a company with a logo — verify the card in the list shows the logo immediately

- [ ] **Step 5: Verify BranchSelector**
  - The trigger button should show stacked company logos (or initials) for selected branches
  - Select branches from multiple companies — verify stacking and `+N` overflow badge
  - Company group headers inside the dropdown should show the small avatar

- [ ] **Step 6: Final commit if any cleanup**

```bash
git add -p
git commit -m "chore: cleanup after company logo implementation"
```
