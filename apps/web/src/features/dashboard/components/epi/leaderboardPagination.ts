export interface LeaderboardPaginationEntry {
  id: string;
  rank: number;
}

interface ResolveLeaderboardPaginationStateInput {
  entries: LeaderboardPaginationEntry[];
  expandedId: string | null;
  page: number;
  pageSize: number;
}

export interface LeaderboardPaginationState {
  expandedId: string | null;
  page: number;
}

export function resolveLeaderboardPaginationState(
  input: ResolveLeaderboardPaginationStateInput,
): LeaderboardPaginationState {
  const restEntries = input.entries.filter((entry) => entry.rank > 3);
  const maxPage = Math.max(0, Math.ceil(restEntries.length / input.pageSize) - 1);
  const clampedPage = Math.min(Math.max(input.page, 0), maxPage);

  if (input.expandedId === null) {
    return {
      expandedId: null,
      page: clampedPage,
    };
  }

  const expandedEntry = input.entries.find((entry) => entry.id === input.expandedId);
  if (!expandedEntry) {
    return {
      expandedId: null,
      page: clampedPage,
    };
  }

  if (expandedEntry.rank <= 3) {
    return {
      expandedId: input.expandedId,
      page: clampedPage,
    };
  }

  const restIndex = restEntries.findIndex((entry) => entry.id === input.expandedId);
  if (restIndex === -1) {
    return {
      expandedId: input.expandedId,
      page: clampedPage,
    };
  }

  return {
    expandedId: input.expandedId,
    page: Math.floor(restIndex / input.pageSize),
  };
}
