# Registration Panel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the registration verification panel into two sequential steps — Step 1: Review (editable form fields, organized into cards), Step 2: Assign (roles, companies, branches, employee number) — connected by a horizontal slide transition, with "Approve Details →" and "Approve Registration" as the progressive action labels.

**Architecture:** All changes are confined to `EmployeeVerificationsPage.tsx`. A `step` state (`'review' | 'assign'`) and a `direction` ref (`1` | `-1`) control which content renders and which direction the Framer Motion transition animates. The panel header and sticky footer re-render based on `step`. All existing state, API calls, validation logic, and socket listeners remain untouched — only the JSX structure of the registration panel section changes.

**Tech Stack:** React 18, Framer Motion (already imported), Tailwind CSS 3, Lucide icons (already imported), existing shared UI components (Button, Input, Badge).

---

## File Map

| File | Action | What changes |
|---|---|---|
| `apps/web/src/features/employee-verifications/pages/EmployeeVerificationsPage.tsx` | Modify | Add `step` state + `direction` ref; replace registration panel JSX (lines ~1159–2085) with two-step layout; update footer JSX |

No new files. No new components. No API changes.

---

## Task 1: Add `step` state and `direction` ref

**Files:**
- Modify: `apps/web/src/features/employee-verifications/pages/EmployeeVerificationsPage.tsx`

- [ ] **Step 1: Add `useRef` to the existing React import**

The file already imports `useCallback, useEffect, useMemo, useState` from React. Add `useRef`:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
```

- [ ] **Step 2: Add `step` state and `direction` ref near the other state declarations (around line 366, after `copiedAccountNumber` state)**

```tsx
const [registrationStep, setRegistrationStep] = useState<'review' | 'assign'>('review');
const registrationStepDirection = useRef<1 | -1>(1);
```

- [ ] **Step 3: Reset `registrationStep` and `direction` when `openPanel` is called**

Inside `openPanel` (around line 609), at the top of the function body before any existing logic:

```tsx
setRegistrationStep('review');
registrationStepDirection.current = 1;
```

- [ ] **Step 4: Add `ChevronLeft` to the lucide-react import**

The file already imports many icons from `lucide-react`. Add `ChevronLeft`:

```tsx
import {
  AlertCircle, Calendar, ChevronLeft, CircleCheck, ClipboardCheck, Clock,
  Copy, Check, CreditCard, ExternalLink, IdCard, Landmark,
  LayoutGrid, Mail, User, UserRoundPlus, Users, X, XCircle,
} from 'lucide-react';
```

- [ ] **Step 5: Verify the file compiles**

```bash
cd /home/phaeton/Projects/omnilert-website
rtk pnpm --filter web exec tsc --noEmit 2>&1 | head -40
```

Expected: no new errors related to `registrationStep`, `registrationStepDirection`, or `ChevronLeft`.

- [ ] **Step 6: Commit**

```bash
rtk git add apps/web/src/features/employee-verifications/pages/EmployeeVerificationsPage.tsx
rtk git commit -m "feat(employee-verifications): add step state and direction ref for registration panel"
```

---

## Task 2: Replace the registration panel header (step-aware)

**Files:**
- Modify: `apps/web/src/features/employee-verifications/pages/EmployeeVerificationsPage.tsx`

The current panel header (around lines 1167–1197) always shows the same icon + title. Replace it so Step 2 shows a back arrow + "Assign & Approve" + step indicator.

- [ ] **Step 1: Locate the header block**

Find this block (around line 1167):

```tsx
{(() => {
  const PanelIcon = PANEL_ICON[selectedItem.type];
  return (
    <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
      <div className="flex items-center gap-3">
        <PanelIcon className="h-5 w-5 text-primary-600" />
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            {PANEL_TITLE[selectedItem.type]}
          </h2>
          <p className="text-xs text-gray-500">
            {String(selectedItem.data.first_name)} {String(selectedItem.data.last_name)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={statusVariant(selectedItem.data.status as string)}>
          {(selectedItem.data.status as string).charAt(0).toUpperCase() +
           (selectedItem.data.status as string).slice(1)}
        </Badge>
        <button
          type="button"
          onClick={closePanel}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
})()}
```

- [ ] **Step 2: Replace the header block with the step-aware version**

```tsx
{(() => {
  const isRegistrationAssign =
    selectedItem.type === 'registration' && registrationStep === 'assign';
  const PanelIcon = PANEL_ICON[selectedItem.type];
  return (
    <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
      <div className="flex items-center gap-3">
        {isRegistrationAssign ? (
          <button
            type="button"
            onClick={() => {
              registrationStepDirection.current = -1;
              setRegistrationStep('review');
            }}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Back to review"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        ) : (
          <PanelIcon className="h-5 w-5 text-primary-600" />
        )}
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            {isRegistrationAssign ? 'Assign & Approve' : PANEL_TITLE[selectedItem.type]}
          </h2>
          <p className="text-xs text-gray-500">
            {isRegistrationAssign
              ? 'Step 2 of 2 — Assignment'
              : `${String(selectedItem.data.first_name)} ${String(selectedItem.data.last_name)}`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={statusVariant(selectedItem.data.status as string)}>
          {(selectedItem.data.status as string).charAt(0).toUpperCase() +
           (selectedItem.data.status as string).slice(1)}
        </Badge>
        <button
          type="button"
          onClick={closePanel}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
})()}
```

- [ ] **Step 3: Verify compile**

```bash
cd /home/phaeton/Projects/omnilert-website
rtk pnpm --filter web exec tsc --noEmit 2>&1 | head -40
```

Expected: no new TypeScript errors.

- [ ] **Step 4: Commit**

```bash
rtk git add apps/web/src/features/employee-verifications/pages/EmployeeVerificationsPage.tsx
rtk git commit -m "feat(employee-verifications): step-aware registration panel header"
```

---

## Task 3: Build Step 1 — Review panel content (organized cards)

**Files:**
- Modify: `apps/web/src/features/employee-verifications/pages/EmployeeVerificationsPage.tsx`

This is the largest task. Replace the entire registration panel content block (the `{selectedItem.type === 'registration' && (...)}` block inside the scrollable `div.flex-1`) with the new two-step `AnimatePresence` structure. Step 1 content goes in this task; Step 2 content goes in Task 4.

The scrollable content div currently looks like (around line 1199):
```tsx
<div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
  {selectedItem.type === 'registration' && (
    <>
      {/* ... all current registration content ... */}
    </>
  )}
  {/* personalInformation, employmentRequirements, bankInformation blocks follow */}
```

- [ ] **Step 1: Replace the scrollable content div opening and the registration block**

Find the opening of the scrollable div and the start of the registration block:

```tsx
<div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
  {selectedItem.type === 'registration' && (
    <>
      {/* Rejection callout */}
      {selectedItem.data.status === 'rejected' && selectedItem.data.rejection_reason && (
```

Replace it with the new structure. The key idea: wrap registration content in `AnimatePresence` with two `motion.div` children keyed by `registrationStep`. Non-registration types remain unchanged after the closing of the registration block.

```tsx
<div className="flex-1 overflow-y-auto">
  {selectedItem.type === 'registration' ? (
    <AnimatePresence mode="wait" initial={false} custom={registrationStepDirection.current}>
      {registrationStep === 'review' && (
        <motion.div
          key="review"
          custom={registrationStepDirection.current}
          initial={{ x: `${registrationStepDirection.current * 30}%`, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: `${registrationStepDirection.current * -30}%`, opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          className="space-y-4 px-6 py-4"
        >
          {/* Rejection callout */}
          {selectedItem.data.status === 'rejected' && selectedItem.data.rejection_reason && (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <div>
                <p className="text-xs font-semibold text-red-700">Rejection Reason</p>
                <p className="mt-0.5 text-sm text-red-600">{String(selectedItem.data.rejection_reason)}</p>
              </div>
            </div>
          )}

          {/* Employee Info — read-only */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Employee</p>
            <dl className="space-y-3">
              <div className="flex items-start gap-2">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <div>
                  <dt className="text-xs text-gray-500">Email</dt>
                  <dd className="text-sm font-medium text-gray-900">{String(selectedItem.data.email)}</dd>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <div>
                  <dt className="text-xs text-gray-500">Requested</dt>
                  <dd className="text-sm text-gray-900">
                    {new Date(selectedItem.data.requested_at as string).toLocaleString()}
                  </dd>
                </div>
              </div>
              {selectedItem.data.reviewed_at && (
                <div className="flex items-start gap-2">
                  <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <dt className="text-xs text-gray-500">Reviewed</dt>
                    <dd className="text-sm text-gray-900">
                      {new Date(selectedItem.data.reviewed_at as string).toLocaleString()}
                    </dd>
                  </div>
                </div>
              )}
              {(selectedItem.data.status === 'approved' || selectedItem.data.status === 'rejected')
                && selectedItem.data.reviewed_by_name && (
                <div className="flex items-start gap-2">
                  <User className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <dt className="text-xs text-gray-500">
                      {selectedItem.data.status === 'approved' ? 'Approved By' : 'Rejected By'}
                    </dt>
                    <dd className="text-sm font-medium text-gray-900">
                      {String(selectedItem.data.reviewed_by_name)}
                    </dd>
                  </div>
                </div>
              )}
            </dl>
          </div>

          {/* Personal Details — editable */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Personal Details</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="First Name" value={registrationProfileEdits.firstName} onChange={(e) => setRegistrationProfileEdits((prev) => ({ ...prev, firstName: e.target.value }))} disabled={!canActOnSelected} />
              <Input label="Middle Name" value={registrationProfileEdits.middleName} onChange={(e) => setRegistrationProfileEdits((prev) => ({ ...prev, middleName: e.target.value }))} disabled={!canActOnSelected} />
              <Input label="Last Name" value={registrationProfileEdits.lastName} onChange={(e) => setRegistrationProfileEdits((prev) => ({ ...prev, lastName: e.target.value }))} disabled={!canActOnSelected} />
              <Input label="Suffix" value={registrationProfileEdits.suffix} onChange={(e) => setRegistrationProfileEdits((prev) => ({ ...prev, suffix: e.target.value }))} disabled={!canActOnSelected} />
              <Input label="Birthday" type="date" value={registrationProfileEdits.birthday} onChange={(e) => setRegistrationProfileEdits((prev) => ({ ...prev, birthday: e.target.value }))} disabled={!canActOnSelected} />
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Gender</span>
                <select
                  value={registrationProfileEdits.gender}
                  onChange={(e) => setRegistrationProfileEdits((prev) => ({ ...prev, gender: e.target.value }))}
                  disabled={!canActOnSelected}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-gray-50 disabled:text-gray-500"
                >
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-sm font-medium text-gray-700">Marital Status</span>
                <select
                  value={registrationProfileEdits.maritalStatus}
                  onChange={(e) => setRegistrationProfileEdits((prev) => ({ ...prev, maritalStatus: e.target.value }))}
                  disabled={!canActOnSelected}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-gray-50 disabled:text-gray-500"
                >
                  <option value="">Select marital status</option>
                  <option value="single">Single</option>
                  <option value="married">Married</option>
                  <option value="cohabitant">Legal Cohabitant</option>
                  <option value="widower">Widower</option>
                  <option value="divorced">Divorced</option>
                </select>
              </label>
              <Input className="sm:col-span-2" label="Home Address" value={registrationProfileEdits.address} onChange={(e) => setRegistrationProfileEdits((prev) => ({ ...prev, address: e.target.value }))} disabled={!canActOnSelected} />
              <Input label="Mobile Number" value={registrationProfileEdits.mobileNumber} onChange={(e) => setRegistrationProfileEdits((prev) => ({ ...prev, mobileNumber: e.target.value }))} disabled={!canActOnSelected} />
              <Input label="Email" type="email" value={registrationProfileEdits.email} onChange={(e) => setRegistrationProfileEdits((prev) => ({ ...prev, email: e.target.value }))} disabled={!canActOnSelected} />
            </div>
          </div>

          {/* Government IDs — editable */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Government IDs</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="SSS Number" value={registrationProfileEdits.sssNumber} onChange={(e) => setRegistrationProfileEdits((prev) => ({ ...prev, sssNumber: e.target.value }))} disabled={!canActOnSelected} />
              <Input label="TIN Number" value={registrationProfileEdits.tinNumber} onChange={(e) => setRegistrationProfileEdits((prev) => ({ ...prev, tinNumber: e.target.value }))} disabled={!canActOnSelected} />
              <Input label="Pag-IBIG Number" value={registrationProfileEdits.pagibigNumber} onChange={(e) => setRegistrationProfileEdits((prev) => ({ ...prev, pagibigNumber: e.target.value }))} disabled={!canActOnSelected} />
              <Input label="PhilHealth Number" value={registrationProfileEdits.philhealthNumber} onChange={(e) => setRegistrationProfileEdits((prev) => ({ ...prev, philhealthNumber: e.target.value }))} disabled={!canActOnSelected} />
            </div>
          </div>

          {/* Emergency Contact — editable */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Emergency Contact</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input label="Contact Name" value={registrationProfileEdits.emergencyContact} onChange={(e) => setRegistrationProfileEdits((prev) => ({ ...prev, emergencyContact: e.target.value }))} disabled={!canActOnSelected} />
              <Input label="Contact Number" value={registrationProfileEdits.emergencyPhone} onChange={(e) => setRegistrationProfileEdits((prev) => ({ ...prev, emergencyPhone: e.target.value }))} disabled={!canActOnSelected} />
              <Input label="Relationship" value={registrationProfileEdits.emergencyRelationship} onChange={(e) => setRegistrationProfileEdits((prev) => ({ ...prev, emergencyRelationship: e.target.value }))} disabled={!canActOnSelected} />
            </div>
          </div>

          {/* Documents — read-only */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Documents</p>
            <div className="grid gap-4 sm:grid-cols-2">
              {registrationProfileEdits.profilePictureUrl ? (
                <a href={registrationProfileEdits.profilePictureUrl} target="_blank" rel="noreferrer" className="group block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Profile Picture</span>
                  <img src={registrationProfileEdits.profilePictureUrl} alt="Submitted profile" className="h-28 w-28 rounded-full border border-gray-200 object-cover transition-opacity group-hover:opacity-80" />
                </a>
              ) : (
                <div>
                  <span className="mb-1 block text-sm font-medium text-gray-700">Profile Picture</span>
                  <p className="text-sm text-gray-400">No profile picture submitted.</p>
                </div>
              )}
              {registrationProfileEdits.validIdUrl ? (
                <a href={registrationProfileEdits.validIdUrl} target="_blank" rel="noreferrer" className="group block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">Valid ID</span>
                  <img src={registrationProfileEdits.validIdUrl} alt="Submitted valid ID" className="h-28 w-full rounded-lg border border-gray-200 object-cover transition-opacity group-hover:opacity-80" />
                </a>
              ) : (
                <div>
                  <span className="mb-1 block text-sm font-medium text-gray-700">Valid ID</span>
                  <p className="text-sm text-gray-400">No valid ID submitted.</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {registrationStep === 'assign' && (
        <motion.div
          key="assign"
          custom={registrationStepDirection.current}
          initial={{ x: `${registrationStepDirection.current * 30}%`, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: `${registrationStepDirection.current * -30}%`, opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          className="space-y-4 px-6 py-4"
        >
          {/* Step 2 placeholder — filled in Task 4 */}
          <p className="text-sm text-gray-400">Assignment step coming in next task.</p>
        </motion.div>
      )}
    </AnimatePresence>
  ) : (
    <div className="space-y-5 px-6 py-4">
```

- [ ] **Step 2: Close the else branch properly**

After the registration block change, the remaining `{selectedItem.type === 'personalInformation' && ...}`, `{selectedItem.type === 'employmentRequirements' && ...}`, and `{selectedItem.type === 'bankInformation' && ...}` blocks need to be inside the new `<div className="space-y-5 px-6 py-4">` else branch. Find where the current `</div>` closes the scrollable area (the `flex-1` div), and ensure the three non-registration blocks stay inside the new else branch's `<div>`, then close it with `</div>` before `)` of the ternary and close the outer `<div className="flex-1 overflow-y-auto">`.

The structure should be:
```tsx
<div className="flex-1 overflow-y-auto">
  {selectedItem.type === 'registration' ? (
    <AnimatePresence ...>
      {/* step content */}
    </AnimatePresence>
  ) : (
    <div className="space-y-5 px-6 py-4">
      {selectedItem.type === 'personalInformation' && (...)}
      {selectedItem.type === 'employmentRequirements' && (...)}
      {selectedItem.type === 'bankInformation' && (...)}
    </div>
  )}
</div>
```

- [ ] **Step 3: Verify compile**

```bash
cd /home/phaeton/Projects/omnilert-website
rtk pnpm --filter web exec tsc --noEmit 2>&1 | head -40
```

Expected: no new TypeScript errors.

- [ ] **Step 4: Commit**

```bash
rtk git add apps/web/src/features/employee-verifications/pages/EmployeeVerificationsPage.tsx
rtk git commit -m "feat(employee-verifications): registration panel step 1 review layout with organized cards"
```

---

## Task 4: Build Step 2 — Assignment panel content

**Files:**
- Modify: `apps/web/src/features/employee-verifications/pages/EmployeeVerificationsPage.tsx`

Replace the placeholder in the `registrationStep === 'assign'` motion.div with the full assignment content.

- [ ] **Step 1: Replace the placeholder inside the assign motion.div**

Find:
```tsx
          {/* Step 2 placeholder — filled in Task 4 */}
          <p className="text-sm text-gray-400">Assignment step coming in next task.</p>
```

Replace with:
```tsx
          {/* Profile Picture Upload */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Profile Picture <span className="font-normal normal-case text-gray-400">(optional)</span>
            </p>
            <div className="flex items-center gap-3">
              <label className="inline-flex cursor-pointer items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
                {approveAvatarUploading ? 'Uploading...' : 'Choose image'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  className="hidden"
                  disabled={approveAvatarUploading || saving}
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (!file) return;
                    await uploadRegistrationAvatar(file);
                  }}
                />
              </label>
              {approveAvatarUrl && (
                <button
                  type="button"
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                  onClick={() => {
                    setApproveAvatarUrl('');
                    setRegistrationProfileEdits((prev) => ({ ...prev, profilePictureUrl: '' }));
                  }}
                  disabled={approveAvatarUploading || saving}
                >
                  Remove
                </button>
              )}
            </div>
            {approveAvatarUrl ? (
              <img
                src={approveAvatarUrl}
                alt="Uploaded registration profile"
                className="mt-3 h-24 w-24 rounded-full border border-gray-200 object-cover"
              />
            ) : (
              <p className="mt-2 text-xs text-gray-500">No image uploaded.</p>
            )}
          </div>

          {/* Employee Details */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Employee Details <span className="font-normal normal-case text-gray-400">(optional)</span>
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">
                  Employee Number
                </label>
                <input
                  type="number"
                  min={1}
                  value={approveEmployeeNumber}
                  onChange={(e) => setApproveEmployeeNumber(e.target.value)}
                  placeholder="e.g. 4"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">
                  User Key
                </label>
                <input
                  type="text"
                  value={approveUserKey}
                  onChange={(e) => setApproveUserKey(e.target.value)}
                  placeholder="e.g. 7ceced51-2dc6-49fa-a38f-8798978f8763"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>
          </div>

          {/* Roles */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Roles <span className="font-normal normal-case text-red-400">(required)</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {assignmentOptions.roles.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => toggleSelection(approveRoleIds, setApproveRoleIds, role.id)}
                  className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                    approveRoleIds.includes(role.id)
                      ? 'text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  style={approveRoleIds.includes(role.id) ? { backgroundColor: role.color || '#2563eb' } : {}}
                >
                  {role.name}
                </button>
              ))}
            </div>
          </div>

          {/* Companies & Branches */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Companies & Branches <span className="font-normal normal-case text-red-400">(required)</span>
            </p>
            <div className="space-y-3">
              {assignmentOptions.companies.map((company) => {
                const selected = approveCompanyIds.includes(company.id);
                const selectedBranchIds = approveBranchIdsByCompany[company.id] ?? [];
                return (
                  <div key={company.id} className="rounded-lg border border-gray-200 bg-gray-50 p-2">
                    <button
                      type="button"
                      onClick={() => toggleCompanySelection(company.id)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        selected ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {company.name}
                    </button>
                    {selected && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {company.branches.map((branch) => (
                          <button
                            key={branch.id}
                            type="button"
                            onClick={() => toggleCompanyBranchSelection(company.id, branch.id)}
                            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                              selectedBranchIds.includes(branch.id)
                                ? 'bg-emerald-600 text-white'
                                : 'bg-white text-gray-700 hover:bg-gray-100'
                            }`}
                          >
                            {branch.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Resident Branch */}
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Resident Branch <span className="font-normal normal-case text-red-400">(required)</span>
            </p>
            <select
              value={approveResidentBranchId ? `${approveResidentCompanyId}:${approveResidentBranchId}` : ''}
              onChange={(e) => {
                const value = e.target.value;
                if (!value) {
                  setApproveResidentCompanyId('');
                  setApproveResidentBranchId('');
                  return;
                }
                const [companyId, branchId] = value.split(':');
                setApproveResidentCompanyId(companyId || '');
                setApproveResidentBranchId(branchId || '');
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="">Select resident branch</option>
              {approveCompanyIds.flatMap((companyId) => {
                const company = assignmentOptions.companies.find((item) => item.id === companyId);
                if (!company) return [];
                const selectedBranchIds = approveBranchIdsByCompany[companyId] ?? [];
                return company.branches
                  .filter((branch) => selectedBranchIds.includes(branch.id))
                  .map((branch) => (
                    <option key={`${company.id}-${branch.id}`} value={`${company.id}:${branch.id}`}>
                      {company.name} - {branch.name}
                    </option>
                  ));
              })}
            </select>
          </div>

          {/* Approval Progress */}
          {(approvalLogs.length > 0 || approvalInProgressId === selectedItem.data.id) && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
                Approval Progress
              </p>
              <div className="max-h-36 space-y-1 overflow-y-auto rounded bg-white p-2">
                {approvalLogs.length === 0 && (
                  <p className="text-xs text-gray-500">Waiting for backend progress events...</p>
                )}
                {approvalLogs.map((log, idx) => (
                  <p key={`${log.createdAt}-${idx}`} className="text-xs text-gray-700">
                    <span className="mr-2 font-medium text-gray-500">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </span>
                    {log.message}
                  </p>
                ))}
              </div>
            </div>
          )}
```

- [ ] **Step 2: Verify compile**

```bash
cd /home/phaeton/Projects/omnilert-website
rtk pnpm --filter web exec tsc --noEmit 2>&1 | head -40
```

Expected: no new TypeScript errors.

- [ ] **Step 3: Commit**

```bash
rtk git add apps/web/src/features/employee-verifications/pages/EmployeeVerificationsPage.tsx
rtk git commit -m "feat(employee-verifications): registration panel step 2 assignment layout"
```

---

## Task 5: Replace the footer with step-aware actions

**Files:**
- Modify: `apps/web/src/features/employee-verifications/pages/EmployeeVerificationsPage.tsx`

The current footer (around lines 2008–2085) shows a single Approve/Reject pair for all types. Replace it with a step-aware footer that shows different actions for each registration step, and keeps the existing footer for non-registration types.

- [ ] **Step 1: Locate the current footer block**

Find:
```tsx
{canActOnSelected && (
  <div className="border-t border-gray-200 px-6 py-4">
    {panelError && (
      <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{panelError}</p>
    )}

    {!panelRejectMode ? (
      <div className="flex gap-3">
        <Button
          className="flex-1"
          variant="success"
          disabled={saving}
          onClick={() =>
            setConfirmModal({
              action: 'approve',
              message: 'Confirm approval of this verification?',
              onConfirm: approveSelected,
            })
          }
        >
          <span className="flex items-center justify-center gap-1.5">
            <CircleCheck className="h-4 w-4" />
            Approve
          </span>
        </Button>
        <Button
          className="flex-1"
          variant="danger"
          disabled={saving}
          onClick={() => setPanelRejectMode(true)}
        >
          <span className="flex items-center justify-center gap-1.5">
            <XCircle className="h-4 w-4" />
            Reject
          </span>
        </Button>
      </div>
    ) : (
      <div className="space-y-3">
        <textarea
          rows={2}
          placeholder="Reason for rejection..."
          value={panelRejectReason}
          onChange={(e) => setPanelRejectReason(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        <div className="flex gap-3">
          <Button
            className="flex-1"
            variant="danger"
            disabled={saving || !panelRejectReason.trim()}
            onClick={() =>
              setConfirmModal({
                action: 'reject',
                message: `Reject with reason: "${panelRejectReason.trim()}"?`,
                onConfirm: rejectSelected,
              })
            }
          >
            Confirm Reject
          </Button>
          <Button
            className="flex-1"
            variant="secondary"
            disabled={saving}
            onClick={() => {
              setPanelRejectMode(false);
              setPanelRejectReason('');
              setPanelError('');
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    )}
  </div>
)}
```

- [ ] **Step 2: Replace the entire footer block**

```tsx
{canActOnSelected && (
  <div className="border-t border-gray-200 bg-white px-6 py-4">
    {panelError && (
      <p className="mb-3 text-sm text-red-600">{panelError}</p>
    )}

    {/* Registration: Step 1 footer */}
    {selectedItem.type === 'registration' && registrationStep === 'review' && (
      <>
        {panelRejectMode && (
          <div className="mb-3 space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Reason for rejection</label>
              <button
                type="button"
                className="text-xs text-gray-400 hover:text-gray-600"
                onClick={() => {
                  setPanelRejectMode(false);
                  setPanelRejectReason('');
                  setPanelError('');
                }}
              >
                Cancel
              </button>
            </div>
            <textarea
              rows={2}
              placeholder="Explain why this registration is being rejected..."
              value={panelRejectReason}
              onChange={(e) => setPanelRejectReason(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>
        )}
        <div className="flex gap-3">
          {!panelRejectMode ? (
            <>
              <Button
                className="flex-1"
                variant="danger"
                disabled={saving}
                onClick={() => setPanelRejectMode(true)}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <XCircle className="h-4 w-4" />
                  Reject
                </span>
              </Button>
              <Button
                className="flex-1"
                variant="success"
                disabled={saving}
                onClick={() => {
                  registrationStepDirection.current = 1;
                  setRegistrationStep('assign');
                  setPanelError('');
                }}
              >
                <span className="flex items-center justify-center gap-1.5">
                  Approve Details
                  <CircleCheck className="h-4 w-4" />
                </span>
              </Button>
            </>
          ) : (
            <>
              <Button
                className="flex-1"
                variant="secondary"
                disabled={saving}
                onClick={() => {
                  setPanelRejectMode(false);
                  setPanelRejectReason('');
                  setPanelError('');
                }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                variant="danger"
                disabled={saving || !panelRejectReason.trim()}
                onClick={() =>
                  setConfirmModal({
                    action: 'reject',
                    message: `Reject with reason: "${panelRejectReason.trim()}"?`,
                    onConfirm: rejectSelected,
                  })
                }
              >
                Confirm Rejection
              </Button>
            </>
          )}
        </div>
      </>
    )}

    {/* Registration: Step 2 footer */}
    {selectedItem.type === 'registration' && registrationStep === 'assign' && (
      <div className="flex gap-3">
        <Button
          className="flex-1"
          variant="secondary"
          disabled={saving}
          onClick={() => {
            registrationStepDirection.current = -1;
            setRegistrationStep('review');
            setPanelError('');
          }}
        >
          <span className="flex items-center justify-center gap-1.5">
            <ChevronLeft className="h-4 w-4" />
            Back
          </span>
        </Button>
        <Button
          className="flex-1"
          variant="success"
          disabled={saving}
          onClick={() =>
            setConfirmModal({
              action: 'approve',
              message: 'Approve this registration? This will create the employee account.',
              onConfirm: approveSelected,
            })
          }
        >
          <span className="flex items-center justify-center gap-1.5">
            <CircleCheck className="h-4 w-4" />
            {saving ? 'Processing...' : 'Approve Registration'}
          </span>
        </Button>
      </div>
    )}

    {/* Non-registration types: original approve/reject footer */}
    {selectedItem.type !== 'registration' && (
      <>
        {!panelRejectMode ? (
          <div className="flex gap-3">
            <Button
              className="flex-1"
              variant="success"
              disabled={saving}
              onClick={() =>
                setConfirmModal({
                  action: 'approve',
                  message: 'Confirm approval of this verification?',
                  onConfirm: approveSelected,
                })
              }
            >
              <span className="flex items-center justify-center gap-1.5">
                <CircleCheck className="h-4 w-4" />
                Approve
              </span>
            </Button>
            <Button
              className="flex-1"
              variant="danger"
              disabled={saving}
              onClick={() => setPanelRejectMode(true)}
            >
              <span className="flex items-center justify-center gap-1.5">
                <XCircle className="h-4 w-4" />
                Reject
              </span>
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <textarea
              rows={2}
              placeholder="Reason for rejection..."
              value={panelRejectReason}
              onChange={(e) => setPanelRejectReason(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <div className="flex gap-3">
              <Button
                className="flex-1"
                variant="danger"
                disabled={saving || !panelRejectReason.trim()}
                onClick={() =>
                  setConfirmModal({
                    action: 'reject',
                    message: `Reject with reason: "${panelRejectReason.trim()}"?`,
                    onConfirm: rejectSelected,
                  })
                }
              >
                Confirm Reject
              </Button>
              <Button
                className="flex-1"
                variant="secondary"
                disabled={saving}
                onClick={() => {
                  setPanelRejectMode(false);
                  setPanelRejectReason('');
                  setPanelError('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </>
    )}
  </div>
)}
```

- [ ] **Step 3: Verify compile**

```bash
cd /home/phaeton/Projects/omnilert-website
rtk pnpm --filter web exec tsc --noEmit 2>&1 | head -40
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
rtk git add apps/web/src/features/employee-verifications/pages/EmployeeVerificationsPage.tsx
rtk git commit -m "feat(employee-verifications): step-aware footer — Approve Details / Approve Registration"
```

---

## Task 6: End-to-end verification

**Files:** None modified — verification only.

- [ ] **Step 1: Start the dev server**

```bash
cd /home/phaeton/Projects/omnilert-website
pnpm dev
```

- [ ] **Step 2: Open a pending registration verification**

Navigate to Employee Verifications → Registration tab → click a pending item.

Expected: Panel slides in from right. Header shows "Registration Verification" with employee name. Step 1 shows 5 cards: Employee Info (gray bg), Personal Details, Government IDs, Emergency Contact, Documents. Sticky footer shows "Reject" (red outline) and "Approve Details →" (green).

- [ ] **Step 3: Test reject flow**

Click "Reject". Expected: textarea appears above footer with "Reason for rejection" label + Cancel link. Click Cancel. Expected: textarea collapses, buttons return to Reject + Approve Details.

- [ ] **Step 4: Test forward transition**

Click "Approve Details →". Expected: horizontal slide left-to-right, panel content transitions to Step 2. Header changes to "Assign & Approve" with "Step 2 of 2 — Assignment" subtitle and back arrow.

- [ ] **Step 5: Test back navigation**

Click the back arrow (or "← Back" button in footer). Expected: reverse slide, returns to Step 1. All edited field values preserved.

- [ ] **Step 6: Test assignment validation**

In Step 2, click "Approve Registration" without selecting roles. Expected: error message above footer buttons: "Select at least one role." Without selecting company: "Select at least one company." Without resident branch: "Select a resident branch."

- [ ] **Step 7: Test full approval flow**

Select roles, company, branches, resident branch. Click "Approve Registration". Confirm modal appears. Confirm. Expected: approval progress log appears in step 2, success toast fires, panel closes.

- [ ] **Step 8: Test non-registration types**

Click a personal information, employment requirement, or bank information verification. Expected: panel opens without the step system — original single-step layout with Approve/Reject footer unchanged.

- [ ] **Step 9: Test approved/rejected registrations**

Click an already-approved or rejected registration. Expected: Panel opens in step 1, all fields visible but disabled (no footer shown since `canActOnSelected` is false for non-pending items).
