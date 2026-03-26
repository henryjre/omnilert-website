# Skill: Global Branch Filter Pattern

The app has a global `BranchSelector` in the `TopBar` that lets users pick which branches
to view data for. The committed selection is stored in `useBranchStore`. Feature pages must
read it and filter their data **client-side** — the backend does **not** accept a `branchIds`
query param on most endpoints and will silently ignore it if sent.

---

## Key Facts

- **Store path**: `apps/web/src/shared/store/branchStore.ts`
- **Field on data items**: `item.branch_id: string` (present on all main list types: `StoreAudit`, `CashRequest`, `CaseReport`, etc.)
- **BranchSelector UI**: already rendered globally in `TopBar` — do **not** add it to your page
- **Apply = commit**: the selector uses a draft-then-apply pattern; `selectedBranchIds` in the store only changes after the user clicks **Apply**
- `selectedBranchIds` is always a non-empty array in practice; an empty array is a safe-guard edge case (show everything)

---

## Step-by-Step Implementation

### 1. Import and read the store

```tsx
import { useBranchStore } from '@/shared/store/branchStore';

export function MyFeaturePage() {
  const selectedBranchIds = useBranchStore((s) => s.selectedBranchIds);
  // ...
}
```

### 2. Create a Set memo for O(1) lookups

```tsx
const selectedBranchIdSet = useMemo(
  () => new Set(selectedBranchIds),
  [selectedBranchIds],
);
```

### 3. Filter the fetched data

```tsx
const filteredItems = useMemo(
  () => selectedBranchIdSet.size === 0
    ? items
    : items.filter((item) => selectedBranchIdSet.has(item.branch_id)),
  [items, selectedBranchIdSet],
);
```

Render `filteredItems`, not the raw `items` array.

### 4. Reset pagination and close detail panels on branch change

```tsx
useEffect(() => {
  setPage(1);
  setSelectedItemId(null); // close any open slide-over panel
}, [selectedBranchIds]);
```

### 5. Keep derived counts (badges) in sync

Counts/badges must come from the **filtered** data, not from the server `total`.

**For paginated pages** — fetch all items of the relevant status with a high `pageSize`
and compute counts client-side:

```tsx
const fetchPendingCounts = useCallback(async () => {
  try {
    const res = await api.get('/my-resource', {
      params: { status: 'pending', page: 1, pageSize: 1000 },
    });
    const items: MyItem[] = (res.data.data as MyListResponse).items ?? [];
    const branchIdSet = new Set(selectedBranchIds);
    const visible = branchIdSet.size === 0
      ? items
      : items.filter((a) => branchIdSet.has(a.branch_id));

    setPendingCounts({
      all: visible.length,
      category_a: visible.filter((a) => a.type === 'category_a').length,
      category_b: visible.filter((a) => a.type === 'category_b').length,
    });
  } catch {
    // silently ignore — counts are supplementary UI
  }
}, [selectedBranchIds]); // <-- must include selectedBranchIds
```

**For non-paginated pages** (all data fetched at once) — filter the already-fetched array:

```tsx
const filteredItems = useMemo(() => {
  let result = allItems;
  if (selectedBranchIdSet.size > 0) {
    result = result.filter((r) => selectedBranchIdSet.has(r.branch_id));
  }
  if (statusFilter !== 'all') {
    result = result.filter((r) => r.status === statusFilter);
  }
  return result;
}, [allItems, selectedBranchIdSet, statusFilter]);

const pendingCount = useMemo(
  () => allItems.filter(
    (r) => r.status === 'pending' && (selectedBranchIdSet.size === 0 || selectedBranchIdSet.has(r.branch_id))
  ).length,
  [allItems, selectedBranchIdSet],
);
```

---

## Empty State

Check `filteredItems.length === 0` (not just `total === 0`) for the empty state, because
the server might have returned items that were all filtered out by branch:

```tsx
) : total === 0 || filteredItems.length === 0 ? (
  <EmptyState />
) : (
  filteredItems.map(...)
)
```

---

## Common Mistakes

| Mistake | Fix |
|---|---|
| Passing `branchIds` as an API query param | Remove it — backend ignores it; use client-side filter instead |
| Filtering inside `useCallback` fetch | Use a `useMemo` filter so it re-runs reactively when `selectedBranchIds` changes |
| Reading server `total` for badge counts | Always derive counts from the filtered local array |
| Forgetting `selectedBranchIds` in `useCallback` deps | Stale closure — callback captures old IDs at creation time |
| Forgetting to reset page + close panel on branch change | User stays on an empty page or sees a stale panel from another branch |

---

## Reference Implementations

| File | Notes |
|---|---|
| `apps/web/src/features/store-audits/pages/StoreAuditsPage.tsx` | Paginated list. Client-side `filteredAudits` memo. Pending counts fetched with `pageSize:1000` and filtered locally. |
| `apps/web/src/features/account/components/CashRequestsTab.tsx` | Non-paginated. All data fetched once; `filteredRequests` memo chains branch + status filter. Pattern to copy for simple tabs. |
| `apps/web/src/shared/components/BranchSelector.tsx` | The selector component itself — shows draft/apply/discard flow. |
| `apps/web/src/shared/store/branchStore.ts` | Store definition — `selectedBranchIds`, `setSelectedBranchIds`, `branches`. |
