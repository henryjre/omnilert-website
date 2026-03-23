import axios from 'axios';
import { create } from 'zustand';
import { api } from '@/shared/services/api.client';
import { useAuthStore } from '@/features/auth/store/authSlice';
import {
  buildSelectorCompanyGroupsFromSnapshots,
  flattenCompanyBranches,
  flattenCompanyBranchIds,
  type SelectorCompanySnapshot,
  type SelectorCompanyGroup,
} from '@/shared/components/branchSelectorState';

interface Branch {
  id: string;
  name: string;
  odoo_branch_id?: string | null;
  companyId: string;
  companyName: string;
  companySlug?: string | null;
}

interface CompanyOption {
  id: string;
  name: string;
  slug: string;
  themeColor?: string | null;
}

interface WorkScopeBranchRef {
  company_id: string;
  company_name: string;
  branch_id: string;
  branch_name: string;
}

interface AccountProfilePayload {
  workInfo?: {
    resident_branch: WorkScopeBranchRef | null;
    home_resident_branch: WorkScopeBranchRef | null;
    borrow_branches: WorkScopeBranchRef[];
  };
}

interface BranchState {
  branches: Branch[];
  companyBranchGroups: SelectorCompanyGroup[];
  selectedBranchIds: string[];
  loading: boolean;
  fetchBranches: () => Promise<void>;
  setSelectedBranchIds: (ids: string[]) => void;
  toggleBranch: (id: string) => void;
  selectAll: () => void;
}

type BranchRecord = {
  id: string;
  name: string;
  odoo_branch_id?: string | null;
};

function resolveCurrentCompany(input: {
  companies: CompanyOption[];
  currentCompanySlug: string | null;
  currentCompanyName: string | null;
}) {
  return input.companies.find((company) => company.slug === input.currentCompanySlug)
    ?? input.companies.find((company) => company.name === input.currentCompanyName)
    ?? (input.currentCompanyName
      ? {
        id: input.currentCompanySlug ?? input.currentCompanyName.toLowerCase().replace(/\s+/g, '-'),
        name: input.currentCompanyName,
        slug: input.currentCompanySlug ?? null,
      }
      : null);
}

function buildFallbackCompanyBranchGroups(input: {
  currentBranches: Array<{ id: string; name: string; odoo_branch_id?: string | null }>;
  companies: CompanyOption[];
  currentCompanySlug: string | null;
  currentCompanyName: string | null;
  profile: AccountProfilePayload | null;
}): SelectorCompanyGroup[] {
  const groups = new Map<string, SelectorCompanySnapshot>();
  const companiesById = new Map(input.companies.map((company) => [company.id, company]));
  const currentCompany = resolveCurrentCompany({
    companies: input.companies,
    currentCompanySlug: input.currentCompanySlug,
    currentCompanyName: input.currentCompanyName,
  });

  const ensureGroup = (companyId: string, companyName: string, companySlug?: string | null) => {
    const existing = groups.get(companyId);
    if (existing) return existing;

    const nextGroup: SelectorCompanySnapshot = {
      id: companyId,
      name: companyName,
      slug: companySlug ?? null,
      branches: [],
    };
    groups.set(companyId, nextGroup);
    return nextGroup;
  };

  const addBranch = (branch: Branch) => {
    const group = ensureGroup(branch.companyId, branch.companyName, branch.companySlug);
    if (group.branches.some((existingBranch) => existingBranch.id === branch.id)) {
      return;
    }
    group.branches.push({
      id: branch.id,
      name: branch.name,
      odoo_branch_id: branch.odoo_branch_id ?? null,
    });
  };

  if (currentCompany) {
    for (const branch of input.currentBranches) {
      addBranch({
        id: branch.id,
        name: branch.name,
        odoo_branch_id: branch.odoo_branch_id ?? null,
        companyId: currentCompany.id,
        companyName: currentCompany.name,
        companySlug: currentCompany.slug ?? null,
      });
    }
  } else {
    for (const branch of input.currentBranches) {
      addBranch({
        id: branch.id,
        name: branch.name,
        odoo_branch_id: branch.odoo_branch_id ?? null,
        companyId: 'current-company',
        companyName: 'Current Company',
        companySlug: null,
      });
    }
  }

  const workScope = input.profile?.workInfo;
  const extraBranchRefs = [
    workScope?.resident_branch ?? null,
    workScope?.home_resident_branch ?? null,
    ...(workScope?.borrow_branches ?? []),
  ].filter(Boolean) as WorkScopeBranchRef[];

  for (const branchRef of extraBranchRefs) {
    const company = companiesById.get(branchRef.company_id);
    addBranch({
      id: branchRef.branch_id,
      name: branchRef.branch_name,
      odoo_branch_id: null,
      companyId: branchRef.company_id,
      companyName: company?.name ?? branchRef.company_name,
      companySlug: company?.slug ?? null,
    });
  }

  return buildSelectorCompanyGroupsFromSnapshots(
    Array.from(groups.values()),
    currentCompany?.slug ?? input.currentCompanySlug,
  );
}

function createAuthHeaders(accessToken: string, includeJsonContentType = false) {
  return {
    ...(includeJsonContentType ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${accessToken}`,
  };
}

async function switchCompanyWithAccessToken(accessToken: string, companySlug: string): Promise<string> {
  const response = await axios.post(
    '/api/v1/auth/switch-company',
    { companySlug },
    { headers: createAuthHeaders(accessToken, true) },
  );

  return String(response.data.data.accessToken);
}

async function fetchBranchesWithAccessToken(accessToken: string): Promise<BranchRecord[]> {
  const response = await axios.get('/api/v1/branches', {
    headers: createAuthHeaders(accessToken),
  });

  return (response.data.data || []) as BranchRecord[];
}

async function fetchCompanyBranchSnapshotsViaSessionHopping(input: {
  companies: CompanyOption[];
  currentCompanySlug: string | null;
  currentBranches: BranchRecord[];
  accessToken: string | null;
}): Promise<SelectorCompanySnapshot[]> {
  if (!input.accessToken || input.companies.length === 0) {
    return [];
  }

  const snapshots: SelectorCompanySnapshot[] = [];
  const currentCompany = input.companies.find((company) => company.slug === input.currentCompanySlug) ?? null;

  if (currentCompany && input.currentBranches.length > 0) {
    snapshots.push({
      id: currentCompany.id,
      name: currentCompany.name,
      slug: currentCompany.slug,
      branches: input.currentBranches,
    });
  }

  let workingAccessToken = input.accessToken;
  let switchedAwayFromCurrent = false;

  try {
    for (const company of input.companies) {
      if (company.slug === input.currentCompanySlug) {
        continue;
      }

      try {
        workingAccessToken = await switchCompanyWithAccessToken(workingAccessToken, company.slug);
        switchedAwayFromCurrent = true;
        const branches = await fetchBranchesWithAccessToken(workingAccessToken);
        snapshots.push({
          id: company.id,
          name: company.name,
          slug: company.slug,
          branches,
        });
      } catch (error) {
        console.warn(`Failed to fetch branch selector data for company "${company.slug}".`, error);
      }
    }
  } finally {
    if (switchedAwayFromCurrent && input.currentCompanySlug) {
      try {
        await switchCompanyWithAccessToken(workingAccessToken, input.currentCompanySlug);
      } catch (error) {
        console.warn('Failed to restore the original company after branch-selector prefetch.', error);
      }
    }
  }

  return snapshots;
}

export const useBranchStore = create<BranchState>()((set, get) => ({
  branches: [],
  companyBranchGroups: [],
  selectedBranchIds: [],
  loading: false,

  fetchBranches: async () => {
    set({ loading: true });
    try {
      const [branchesResult, companiesResult, profileResult] = await Promise.allSettled([
        api.get('/branches'),
        api.get('/auth/companies'),
        api.get('/account/profile'),
      ]);
      const currentBranches = branchesResult.status === 'fulfilled'
        ? (branchesResult.value.data.data || []) as Array<{ id: string; name: string; odoo_branch_id?: string | null }>
        : [];
      const companies = companiesResult.status === 'fulfilled'
        ? (companiesResult.value.data.data || []) as CompanyOption[]
        : [];
      const profile = profileResult.status === 'fulfilled'
        ? (profileResult.value.data.data || null) as AccountProfilePayload | null
        : null;
      const { accessToken, companySlug, companyName } = useAuthStore.getState();
      const fallbackGroups = buildFallbackCompanyBranchGroups({
        currentBranches,
        companies,
        currentCompanySlug: companySlug,
        currentCompanyName: companyName,
        profile,
      });
      const fetchedSnapshots = await fetchCompanyBranchSnapshotsViaSessionHopping({
        companies,
        currentCompanySlug: companySlug,
        currentBranches,
        accessToken,
      });
      const companyBranchGroups = fetchedSnapshots.length > 0
        ? buildSelectorCompanyGroupsFromSnapshots(fetchedSnapshots, companySlug)
        : fallbackGroups;
      const branches = flattenCompanyBranches(companyBranchGroups) as Branch[];
      const orderedIds = flattenCompanyBranchIds(companyBranchGroups);
      const currentSelected = get().selectedBranchIds;
      const validIds = new Set(orderedIds);
      const sanitizedSelection = currentSelected.filter((id) => validIds.has(id));
      const nextSelectedBranchIds = sanitizedSelection.length > 0 ? sanitizedSelection : orderedIds;

      set({
        branches,
        companyBranchGroups,
        selectedBranchIds: nextSelectedBranchIds,
      });
    } finally {
      set({ loading: false });
    }
  },

  setSelectedBranchIds: (ids) => set({ selectedBranchIds: ids }),

  toggleBranch: (id) =>
    set((state) => {
      const current = state.selectedBranchIds;
      if (current.includes(id)) {
        if (current.length <= 1) return state;
        return { selectedBranchIds: current.filter((bid) => bid !== id) };
      }
      return { selectedBranchIds: [...current, id] };
    }),

  selectAll: () =>
    set((state) => ({ selectedBranchIds: flattenCompanyBranchIds(state.companyBranchGroups) })),
}));
