import { type TouchEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/features/auth/store/authSlice';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { useSocket } from '@/shared/hooks/useSocket';
import { Button } from '@/shared/components/ui/Button';
import { EpiDashboard } from '../components/epi/EpiDashboard';
import { DashboardPageSkeleton } from '../components/epi/EpiSkeletons';
import {
  fetchDashboardCheckInStatus,
  fetchEpiDashboard,
  fetchEpiLeaderboardSummary,
  getCurrentManilaMonthKey,
} from '../services/epi.api';
import {
  resolveDashboardPullMetrics,
} from '../services/dashboardPullRefresh';
import { getDashboardRefreshPolicy } from '../services/dashboardRefreshPolicy';

type PullRefreshPhase = 'idle' | 'pulling' | 'armed' | 'refreshing';

function isMobileDashboardViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 639px)').matches;
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const { error: showErrorToast } = useAppToast();
  const userEventsSocket = useSocket('/user-events');
  const canViewPerformanceIndex = true;
  const pullRefreshFrameRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const isPullTrackingRef = useRef(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() => isMobileDashboardViewport());
  const [currentMonthKey, setCurrentMonthKey] = useState(() => getCurrentManilaMonthKey());
  const [selectedMonthKey, setSelectedMonthKey] = useState(currentMonthKey);
  const [pullPhase, setPullPhase] = useState<PullRefreshPhase>('idle');
  const [pullDistance, setPullDistance] = useState(0);
  const [showPullRefreshSkeleton, setShowPullRefreshSkeleton] = useState(false);
  const refreshPolicy = useMemo(
    () => getDashboardRefreshPolicy({ selectedMonthKey, currentMonthKey }),
    [currentMonthKey, selectedMonthKey],
  );
  const pullMetrics = useMemo(() => resolveDashboardPullMetrics(pullDistance), [pullDistance]);

  const dashboardQuery = useQuery({
    queryKey: ['epi-dashboard'],
    queryFn: fetchEpiDashboard,
    enabled: canViewPerformanceIndex,
    ...refreshPolicy,
    gcTime: Number.POSITIVE_INFINITY,
  });

  useEffect(() => {
    if (!dashboardQuery.data?.currentMonthKey) return;
    if (dashboardQuery.data.currentMonthKey === currentMonthKey) return;
    setCurrentMonthKey(dashboardQuery.data.currentMonthKey);
  }, [currentMonthKey, dashboardQuery.data?.currentMonthKey]);

  useEffect(() => {
    if (!dashboardQuery.data) return;

    const fallbackMonthKey =
      dashboardQuery.data.history[dashboardQuery.data.history.length - 1]?.monthKey ??
      dashboardQuery.data.currentMonthKey;

    if (!dashboardQuery.data.history.some((entry) => entry.monthKey === selectedMonthKey)) {
      setSelectedMonthKey(dashboardQuery.data.currentMonthKey || fallbackMonthKey);
    }
  }, [dashboardQuery.data, selectedMonthKey]);

  const leaderboardSummaryQuery = useQuery({
    queryKey: ['epi-leaderboard-summary', selectedMonthKey],
    queryFn: () => fetchEpiLeaderboardSummary(selectedMonthKey),
    enabled: canViewPerformanceIndex && Boolean(selectedMonthKey),
    ...refreshPolicy,
    gcTime: Number.POSITIVE_INFINITY,
  });
  const checkInStatusQuery = useQuery({
    queryKey: ['dashboard-check-in-status'],
    queryFn: fetchDashboardCheckInStatus,
    enabled: canViewPerformanceIndex,
    ...refreshPolicy,
    gcTime: Number.POSITIVE_INFINITY,
  });

  const leaderboardDetailFetchCount = useIsFetching({
    queryKey: ['epi-leaderboard-detail', selectedMonthKey],
  });
  const isRefreshing = dashboardQuery.isFetching
    || leaderboardSummaryQuery.isFetching
    || checkInStatusQuery.isFetching
    || leaderboardDetailFetchCount > 0;
  const showPullIndicator = isMobileViewport && !showPullRefreshSkeleton && (pullPhase === 'pulling' || pullPhase === 'armed');
  const pullIconRotation = pullMetrics.progress * 180;
  const pullIconScale = 0.78 + (pullMetrics.progress * 0.22);
  const shouldShowDashboardSkeleton =
    (dashboardQuery.isPending && !dashboardQuery.data) ||
    (showPullRefreshSkeleton && Boolean(dashboardQuery.data));

  const getDashboardScrollContainer = useCallback((): HTMLElement | null => {
    if (typeof document === 'undefined') return null;
    return document.querySelector<HTMLElement>('[data-dashboard-scroll-container="true"]');
  }, []);

  const resetPullGesture = useCallback(() => {
    isPullTrackingRef.current = false;
    touchStartYRef.current = null;
    touchStartXRef.current = null;
    setPullDistance(0);
    setPullPhase('idle');
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)');
    const updateViewport = () => setIsMobileViewport(media.matches);

    updateViewport();
    media.addEventListener('change', updateViewport);
    return () => media.removeEventListener('change', updateViewport);
  }, []);

  useEffect(() => {
    return () => {
      if (pullRefreshFrameRef.current !== null) {
        window.cancelAnimationFrame(pullRefreshFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!userEventsSocket || !canViewPerformanceIndex) return;

    const syncCheckInStatus = () => {
      void queryClient.invalidateQueries({ queryKey: ['dashboard-check-in-status'] });
    };

    userEventsSocket.on('user:check-in-status-updated', syncCheckInStatus);
    userEventsSocket.on('user:auth-scope-updated', syncCheckInStatus);

    return () => {
      userEventsSocket.off('user:check-in-status-updated', syncCheckInStatus);
      userEventsSocket.off('user:auth-scope-updated', syncCheckInStatus);
    };
  }, [canViewPerformanceIndex, userEventsSocket, queryClient]);

  const handleRefresh = useCallback(async ({ showSkeleton = false }: { showSkeleton?: boolean } = {}) => {
    if (showSkeleton) {
      setShowPullRefreshSkeleton(true);
    }

    try {
      const results = await Promise.allSettled([
        dashboardQuery.refetch({ cancelRefetch: false, throwOnError: true }),
        leaderboardSummaryQuery.refetch({ cancelRefetch: false, throwOnError: true }),
        checkInStatusQuery.refetch({ cancelRefetch: false, throwOnError: true }),
        queryClient.refetchQueries(
          {
            queryKey: ['epi-leaderboard-detail', selectedMonthKey],
            type: 'active',
          },
          {
            cancelRefetch: false,
            throwOnError: true,
          },
        ),
      ]);

      if (results.some((result) => result.status === 'rejected')) {
        showErrorToast('Failed to refresh dashboard.');
      }
    } finally {
      if (showSkeleton) {
        setShowPullRefreshSkeleton(false);
        setPullDistance(0);
        setPullPhase('idle');
      }
    }
  }, [dashboardQuery, leaderboardSummaryQuery, checkInStatusQuery, queryClient, selectedMonthKey, showErrorToast]);

  const triggerPullRefresh = useCallback(() => {
    if (pullRefreshFrameRef.current !== null) {
      window.cancelAnimationFrame(pullRefreshFrameRef.current);
    }

    setPullDistance(0);
    setPullPhase('refreshing');
    pullRefreshFrameRef.current = window.requestAnimationFrame(() => {
      pullRefreshFrameRef.current = null;
      void handleRefresh({ showSkeleton: true });
    });
  }, [handleRefresh]);

  const handleTouchStart = useCallback((event: TouchEvent<HTMLDivElement>) => {
    if (!isMobileViewport || isRefreshing || showPullRefreshSkeleton || !canViewPerformanceIndex) return;
    if (event.touches.length !== 1) return;

    const scrollContainer = getDashboardScrollContainer();
    if (!scrollContainer || scrollContainer.scrollTop > 0) return;

    touchStartYRef.current = event.touches[0].clientY;
    touchStartXRef.current = event.touches[0].clientX;
    isPullTrackingRef.current = true;
  }, [canViewPerformanceIndex, getDashboardScrollContainer, isMobileViewport, isRefreshing, showPullRefreshSkeleton]);

  const handleTouchMove = useCallback((event: TouchEvent<HTMLDivElement>) => {
    if (!isPullTrackingRef.current || !isMobileViewport || isRefreshing || showPullRefreshSkeleton) return;

    const scrollContainer = getDashboardScrollContainer();
    if (!scrollContainer || scrollContainer.scrollTop > 0) {
      resetPullGesture();
      return;
    }

    const startY = touchStartYRef.current;
    const startX = touchStartXRef.current;
    if (startY === null || startX === null) return;

    const deltaY = event.touches[0].clientY - startY;
    const deltaX = event.touches[0].clientX - startX;

    if (deltaY <= 0) {
      setPullDistance(0);
      setPullPhase('idle');
      return;
    }

    if (Math.abs(deltaX) > Math.abs(deltaY)) return;

    event.preventDefault();
    const nextMetrics = resolveDashboardPullMetrics(deltaY * 0.6);
    setPullDistance(nextMetrics.distance);
    setPullPhase(nextMetrics.armed ? 'armed' : 'pulling');
  }, [getDashboardScrollContainer, isMobileViewport, isRefreshing, resetPullGesture, showPullRefreshSkeleton]);

  const handleTouchEnd = useCallback(() => {
    if (!isPullTrackingRef.current) return;

    isPullTrackingRef.current = false;
    touchStartYRef.current = null;
    touchStartXRef.current = null;

    if (pullPhase === 'armed') {
      triggerPullRefresh();
      return;
    }

    setPullDistance(0);
    setPullPhase('idle');
  }, [pullPhase, triggerPullRefresh]);

  const handleTouchCancel = useCallback(() => {
    resetPullGesture();
  }, [resetPullGesture]);

  return (
    <div
      className="relative"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      <motion.div
        initial={false}
        animate={{
          opacity: showPullIndicator ? 1 : 0,
          y: showPullIndicator ? Math.min(40, pullMetrics.distance * 0.45) : -20,
        }}
        transition={{
          duration: pullPhase === 'pulling' || pullPhase === 'armed' ? 0.08 : 0.18,
          ease: 'easeOut',
        }}
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center sm:hidden"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white/85 text-gray-500 shadow-sm backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/75 dark:text-gray-200">
          <RefreshCw
            className="h-5 w-5"
            style={{
              transform: `rotate(${pullIconRotation}deg) scale(${pullIconScale})`,
              color: pullPhase === 'armed' ? 'rgb(var(--primary-600))' : undefined,
            }}
          />
        </div>
      </motion.div>

      <motion.div
        initial={false}
        animate={{ y: showPullRefreshSkeleton ? 0 : pullMetrics.distance }}
        transition={{
          type: pullPhase === 'pulling' || pullPhase === 'armed' ? 'tween' : 'spring',
          duration: pullPhase === 'pulling' || pullPhase === 'armed' ? 0.08 : undefined,
          ease: pullPhase === 'pulling' || pullPhase === 'armed' ? 'easeOut' : undefined,
          stiffness: pullPhase === 'pulling' || pullPhase === 'armed' ? undefined : 380,
          damping: pullPhase === 'pulling' || pullPhase === 'armed' ? undefined : 34,
        }}
        className="space-y-6"
      >
      {canViewPerformanceIndex && (
        <>
          {shouldShowDashboardSkeleton && <DashboardPageSkeleton />}
          {dashboardQuery.error && !dashboardQuery.data && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              Failed to load EPI data.
            </div>
          )}
          {dashboardQuery.data && !showPullRefreshSkeleton && (
            <>
              <EpiDashboard
                data={dashboardQuery.data}
                leaderboard={leaderboardSummaryQuery.data ?? []}
                leaderboardLoading={leaderboardSummaryQuery.isPending}
                leaderboardError={leaderboardSummaryQuery.error ? 'Failed to load leaderboard.' : null}
                checkInStatus={checkInStatusQuery.data ?? null}
                checkInStatusLoading={checkInStatusQuery.isPending && !checkInStatusQuery.data}
                firstName={user?.firstName || 'User'}
                headerAction={!isMobileViewport ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => { void handleRefresh(); }}
                    disabled={isRefreshing}
                    title="Refresh dashboard"
                    className="hidden gap-2 rounded-xl border border-gray-200 bg-white/80 px-3.5 py-2 text-gray-700 shadow-sm backdrop-blur-sm hover:bg-white sm:inline-flex dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-100 dark:hover:bg-gray-800"
                  >
                    <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
                  </Button>
                ) : null}
                selectedMonthKey={selectedMonthKey}
                onSelectMonth={setSelectedMonthKey}
              />
            </>
          )}
        </>
      )}
      </motion.div>
    </div>
  );
}
