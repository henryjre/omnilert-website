# Branch Selector Redesign Design

## Goal

Replace the existing flat `BranchSelector` with a modern grouped branch picker that:

- defaults to `All Branches` on login
- supports multi-select behavior
- shows company separators so each branch is clearly associated with its company
- uses a compact closed label of `All Branches` or `First Selected Branch +N`
- adapts cleanly between desktop and mobile layouts

## Approved UX

### Trigger

- Closed trigger shows `All Branches` when every visible branch is selected.
- Otherwise it shows the first selected branch name plus an overflow count such as `Makati +2`.
- The trigger stays compact in the top bar and truncates long labels safely.

### Desktop panel

- Open as a right-aligned floating panel from the top bar.
- Show a high-emphasis `All Branches` row at the top.
- Render company groups underneath with visual separators and a company label.
- Each branch row uses a clear checkbox-style selection affordance and a generous hit area.
- Keep the panel scrollable with a capped height.
- Keep motion light: fade/scale panel open, rotate chevron, and softly reveal grouped content.

### Mobile panel

- Open as a larger sheet-style panel with backdrop instead of a cramped dropdown.
- Include a header with title and close affordance.
- Keep `All Branches` visible at the top and use larger tap targets for branch rows.

## Selection Behavior

- `All Branches` is a synthetic global option.
- On login, the selector initializes to `All Branches`.
- Clicking `All Branches` selects every visible branch across all rendered company groups.
- Unchecking `All Branches` falls back to the first branch in rendered order.
- Individual branch rows remain multi-select.
- If the user tries to deselect the final remaining branch, keep one branch selected.

## Data Shape

The selector should render from grouped data:

```ts
type CompanyBranchGroup = {
  id: string;
  name: string;
  slug?: string | null;
  branches: Array<{
    id: string;
    name: string;
    odoo_branch_id?: string | null;
    companyId: string;
    companyName: string;
  }>;
};
```

The store should still expose a flattened branch list for existing consumers, but the selector itself should render from grouped company data.

## Frontend-Only Real-Data Constraint

The current authenticated frontend does not yet receive a complete "all accessible companies with all branches" payload in one user-safe request.

For this frontend pass:

- use the real branch data already available to the client
- shape the store and selector around grouped company data now
- keep the UI ready for a future backend-fed all-company branch source

That means the component architecture should be final-form, while the data adapter remains easy to swap once the dedicated backend feed exists.

## Out of Scope

- Removing the sidebar company switcher
- Changing downstream page filtering semantics
- Adding a new backend endpoint for cross-company branch hydration
- Wiring branch selection to any new backend side effect beyond existing frontend state updates

## Implementation Notes

- Prefer a small pure helper module for grouped selection math and closed-label formatting so the behavior is testable without rendering the full component.
- Keep existing store consumers working by preserving `branches`, `selectedBranchIds`, `toggleBranch`, and `selectAll`.
- Extend the store with grouped company data rather than replacing the flat list outright.
- Reuse existing top-bar/mobile overlay patterns so the selector feels native to the app.
