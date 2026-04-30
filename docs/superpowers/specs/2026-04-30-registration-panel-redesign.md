# Registration Approval Panel Redesign

**Date:** 2026-04-30  
**File:** `apps/web/src/features/employee-verifications/pages/EmployeeVerificationsPage.tsx`

---

## Context

The registration verification panel is a single long-scrolling drawer that mixes two distinct jobs: (1) reviewing what the employee submitted, and (2) filling in assignment details (roles, companies, branches, employee number). This creates cognitive clutter — reviewers see all 15+ editable fields and all assignment controls at once, with no visual hierarchy to guide them through the decision.

The redesign splits these into two sequential steps within the same panel, connected by a horizontal slide transition. The button labels ("Approve Details" → "Approve Registration") signal exactly where the user is in the flow.

---

## Design

### Overall Structure

- Panel remains a fixed right-side drawer (`max-w-[520px]`, `createPortal` + Framer Motion slide-in) — unchanged.
- Add `step` state: `'review' | 'assign'`.
- Add `direction` ref (`1` = forward, `-1` = back) to control slide direction.
- Step content lives in two sibling `motion.div` elements inside `AnimatePresence`.
- Panel header and footer are outside the animated content area and re-render based on `step`.

### Transition Animation

- Forward (review → assign): current step exits `x: '-30%', opacity: 0`; next step enters from `x: '30%', opacity: 0`.
- Back (assign → review): reversed directions.
- Duration: `0.25s`, easing: `easeInOut`.
- All form state is preserved when navigating back.

---

## Step 1 — Review Panel

### Header
Same as current: panel icon, "Registration Verification" title, status badge, close button.

### Scrollable Content (sections in order)

1. **Rejection Callout** *(conditional — only if status is `rejected`)*  
   Red alert box with rejection reason. Same as current.

2. **Employee Info** *(read-only card)*  
   - Background: `bg-gray-50 rounded-xl border border-gray-200 p-4`  
   - Shows: Email, Requested date, Reviewed date (if present), Approved/Rejected By (if present)  
   - Icon + label + value layout (`<dl>` pattern)

3. **Personal Details** *(editable card)*  
   - White card: `bg-white rounded-xl border border-gray-200 p-4`  
   - Section label: `text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3`  
   - Grid of inputs: First Name, Middle Name, Last Name, Suffix, Birthday, Gender (select), Marital Status (select), Home Address, Mobile Number, Email

4. **Government IDs** *(editable card)*  
   - White card  
   - Inputs: SSS Number, TIN Number, Pag-IBIG Number, PhilHealth Number (2-column grid)

5. **Emergency Contact** *(editable card)*  
   - White card  
   - 3-column grid: Contact Name, Contact Number, Relationship

6. **Documents** *(read-only card)*  
   - White card  
   - Side-by-side: Profile Picture (circular preview or "no picture" placeholder) + Valid ID (rectangular image/link or placeholder)  
   - Links open in new tab

### Footer (sticky)

- Normal state: **"Reject"** (red outline, left) + **"Approve Details →"** (green solid, right)
- Reject mode active: textarea expands above footer with smooth height animation
  - Label: "Reason for rejection" with a "Cancel" link
  - Placeholder: "Explain why this registration is being rejected..."
  - Buttons change to: **"Cancel"** (gray, left) + **"Confirm Rejection"** (red solid, right)
- Error message displayed above buttons in red text if validation fails
- Both buttons disabled + spinner on active button during `saving`

---

## Step 2 — Assignment Panel

### Header
- Back arrow button (left, gray) replaces the panel icon
- Title: "Assign & Approve"
- Subtitle below title: "Step 2 of 2 — Assignment" (`text-xs text-gray-400`)
- Status badge + close button remain (right side)

### Scrollable Content (sections in order)

1. **Profile Picture Upload** *(card, optional)*  
   - Label: "Profile Picture (optional)"  
   - Choose image button + Remove button + circular thumbnail preview  
   - Same upload logic as current

2. **Employee Details** *(card, optional)*  
   - Label: "Employee Details (optional)"  
   - Two inputs side by side: Employee Number + User Key

3. **Roles** *(card, required)*  
   - Label: "Roles (required)"  
   - Colored toggle pill buttons — same as current

4. **Companies & Branches** *(card, required)*  
   - Label: "Companies & Branches (required)"  
   - Same nested company → branches toggle layout as current

5. **Resident Branch** *(card, required)*  
   - Label: "Resident Branch (required)"  
   - Same dropdown as current (filtered to selected branches)

6. **Approval Progress** *(conditional — only shown when approval is in progress)*  
   - Blue info card with scrollable timestamp log  
   - Same as current

### Footer (sticky)

- **"← Back"** (gray outline, left) — returns to step 1 with reverse slide, preserves all form state
- **"Approve Registration"** (green solid, right) — triggers approval API call
- Error message above buttons if validation fails (missing roles, branches, resident branch)
- Both buttons disabled + spinner during `saving`

---

## Card Style (Consistent)

```
bg-white rounded-xl border border-gray-200 p-4     (editable sections)
bg-gray-50 rounded-xl border border-gray-200 p-4   (read-only Employee Info)
space-y-4 between cards
```

Section labels:
```
text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3
```

Footer:
```
border-t border-gray-200 px-6 py-4 bg-white sticky bottom-0
```

---

## What Does NOT Change

- All API calls, validation logic, socket listeners, form state — unchanged
- The rejection flow logic — same, just reorganized into step 1 footer
- The non-registration panel types (personalInformation, employmentRequirements, bankInformation) — untouched
- Panel slide-in animation from the right — unchanged

---

## Verification

1. Open a pending registration verification — panel slides in, shows step 1 with 5 cards + sticky footer
2. Scroll through step 1 — all editable fields visible, no vertical overflow of footer
3. Click "Reject" — textarea expands above footer, "Confirm Rejection" button appears
4. Click "Cancel" — textarea collapses, buttons return to normal
5. Click "Approve Details →" — panel transitions with horizontal slide to step 2
6. Click "← Back" — reverse slide back to step 1, all edits preserved
7. Submit approval from step 2 without roles — error shown above footer buttons
8. Complete all required fields, click "Approve Registration" — approval log appears, success toast fires, panel closes
9. Check an approved/rejected registration — panel opens directly in step 1 (no step system applies), shows read-only employee info + submitted details cards in read-only mode, footer is hidden entirely since `canActOnSelected` is false
