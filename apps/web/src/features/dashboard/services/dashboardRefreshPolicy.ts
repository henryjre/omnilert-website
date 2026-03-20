export interface DashboardRefreshPolicy {
  staleTime: number;
  refetchOnWindowFocus: boolean;
  refetchOnMount: boolean | 'always';
  refetchInterval: number | false;
  refetchIntervalInBackground: boolean;
}

export const LIVE_DASHBOARD_STALE_TIME = 60_000;
export const LIVE_DASHBOARD_REFETCH_INTERVAL = 300_000;

const LIVE_REFRESH_POLICY: DashboardRefreshPolicy = {
  staleTime: LIVE_DASHBOARD_STALE_TIME,
  refetchOnWindowFocus: true,
  refetchOnMount: 'always',
  refetchInterval: LIVE_DASHBOARD_REFETCH_INTERVAL,
  refetchIntervalInBackground: false,
};

const HISTORICAL_REFRESH_POLICY: DashboardRefreshPolicy = {
  staleTime: Number.POSITIVE_INFINITY,
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  refetchInterval: false,
  refetchIntervalInBackground: false,
};

export function getDashboardRefreshPolicy({
  selectedMonthKey,
  currentMonthKey,
}: {
  selectedMonthKey: string | null | undefined;
  currentMonthKey: string | null | undefined;
}): DashboardRefreshPolicy {
  if (selectedMonthKey && currentMonthKey && selectedMonthKey === currentMonthKey) {
    return LIVE_REFRESH_POLICY;
  }

  return HISTORICAL_REFRESH_POLICY;
}
