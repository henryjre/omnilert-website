export const DASHBOARD_PULL_REFRESH_TRIGGER_PX = 72;
export const DASHBOARD_PULL_REFRESH_MAX_PULL_PX = 108;

export interface DashboardPullMetrics {
  distance: number;
  progress: number;
  armed: boolean;
}

export function resolveDashboardPullMetrics(distance: number): DashboardPullMetrics {
  const clampedDistance = Math.min(
    DASHBOARD_PULL_REFRESH_MAX_PULL_PX,
    Math.max(0, distance),
  );
  const progress = Math.min(1, clampedDistance / DASHBOARD_PULL_REFRESH_TRIGGER_PX);

  return {
    distance: clampedDistance,
    progress,
    armed: clampedDistance >= DASHBOARD_PULL_REFRESH_TRIGGER_PX,
  };
}
