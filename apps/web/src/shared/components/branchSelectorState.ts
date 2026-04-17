export interface SelectorBranch {
  id: string;
  name: string;
  companyId: string;
  companyName: string;
  odoo_branch_id?: string | null;
  is_main_branch?: boolean;
}

export interface SelectorCompanyGroup {
  id: string;
  name: string;
  slug?: string | null;
  logoUrl?: string | null;
  themeColor?: string | null;
  branches: SelectorBranch[];
}

export interface SelectorCompanySnapshot {
  id: string;
  name: string;
  slug?: string | null;
  logoUrl?: string | null;
  themeColor?: string | null;
  branches: Array<{
    id: string;
    name: string;
    odoo_branch_id?: string | null;
    is_main_branch?: boolean;
  }>;
}

function sortSelectorBranches(branches: SelectorBranch[]): SelectorBranch[] {
  return [...branches].sort((left, right) => {
    const leftOdoo = Number.parseInt(String(left.odoo_branch_id ?? ''), 10);
    const rightOdoo = Number.parseInt(String(right.odoo_branch_id ?? ''), 10);
    const leftHasOdoo = !Number.isNaN(leftOdoo);
    const rightHasOdoo = !Number.isNaN(rightOdoo);

    if (leftHasOdoo && rightHasOdoo && leftOdoo !== rightOdoo) {
      return leftOdoo - rightOdoo;
    }

    if (leftHasOdoo !== rightHasOdoo) {
      return leftHasOdoo ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });
}

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
      themeColor: snapshot.themeColor ?? null,
      branches: sortSelectorBranches(
        snapshot.branches.map((branch) => ({
          id: branch.id,
          name: branch.name,
          odoo_branch_id: branch.odoo_branch_id ?? null,
          is_main_branch: Boolean(branch.is_main_branch),
          companyId: snapshot.id,
          companyName: snapshot.name,
        })),
      ),
    }))
    .filter((group) => group.branches.length > 0)
    .sort((left, right) => {
      if (currentCompanySlug && left.slug === currentCompanySlug) return -1;
      if (currentCompanySlug && right.slug === currentCompanySlug) return 1;
      return left.name.localeCompare(right.name);
    });
}

export function flattenCompanyBranches(groups: SelectorCompanyGroup[]): SelectorBranch[] {
  return groups.flatMap((group) => group.branches);
}

export function flattenCompanyBranchIds(groups: SelectorCompanyGroup[]): string[] {
  return flattenCompanyBranches(groups).map((branch) => branch.id);
}

export function selectAllGroupedBranches(groups: SelectorCompanyGroup[]): string[] {
  return flattenCompanyBranchIds(groups);
}

export function clearAllBranchesToFirst(groups: SelectorCompanyGroup[]): string[] {
  const firstBranchId = flattenCompanyBranchIds(groups)[0];
  return firstBranchId ? [firstBranchId] : [];
}

export function toggleGroupedBranchSelection(
  selectedIds: string[],
  branchId: string,
  _orderedIds: string[],
): string[] {
  if (selectedIds.includes(branchId)) {
    if (selectedIds.length <= 1) return selectedIds;
    return selectedIds.filter((id) => id !== branchId);
  }

  return [...selectedIds, branchId];
}

export function toggleCompanyBranchSelection(
  selectedIds: string[],
  companyBranchIds: string[],
  orderedIds: string[],
): string[] {
  const companyBranchIdSet = new Set(companyBranchIds);
  const allCompanyBranchesSelected = companyBranchIds.every((id) => selectedIds.includes(id));

  if (allCompanyBranchesSelected) {
    const remainingIds = selectedIds.filter((id) => !companyBranchIdSet.has(id));

    if (remainingIds.length > 0) {
      return remainingIds;
    }

    return orderedIds[0] ? [orderedIds[0]] : [];
  }

  const selectedIdSet = new Set(selectedIds);
  const missingCompanyBranchIds = orderedIds.filter(
    (id) => companyBranchIdSet.has(id) && !selectedIdSet.has(id),
  );

  return [...selectedIds, ...missingCompanyBranchIds];
}

export function formatBranchSelectionLabel(
  groups: SelectorCompanyGroup[],
  selectedIds: string[],
): string {
  const allIds = flattenCompanyBranchIds(groups);
  const selectedIdSet = new Set(selectedIds);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIdSet.has(id));
  if (allSelected) return 'All Branches';

  const firstSelected = flattenCompanyBranches(groups).find((branch) => branch.id === selectedIds[0]);
  if (!firstSelected) return 'All Branches';
  if (selectedIds.length <= 1) return firstSelected.name;
  return `${firstSelected.name} +${selectedIds.length - 1}`;
}
