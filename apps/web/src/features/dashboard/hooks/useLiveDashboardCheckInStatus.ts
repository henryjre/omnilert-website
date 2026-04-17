import { useEffect, useRef } from 'react';
import {
  useQuery,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useSocket } from '@/shared/hooks/useSocket';
import {
  fetchDashboardCheckInStatus,
  type DashboardCheckInStatus,
} from '../services/epi.api';

type DashboardCheckInStatusQueryKey = ['dashboard-check-in-status'];

interface UseLiveDashboardCheckInStatusOptions {
  enabled?: boolean;
  queryConfig?: Omit<
    UseQueryOptions<
      DashboardCheckInStatus,
      Error,
      DashboardCheckInStatus,
      DashboardCheckInStatusQueryKey
    >,
    'queryKey' | 'queryFn'
  >;
}

export function useLiveDashboardCheckInStatus({
  enabled = true,
  queryConfig,
}: UseLiveDashboardCheckInStatusOptions = {}): UseQueryResult<DashboardCheckInStatus, Error> {
  const userEventsSocket = useSocket('/user-events');
  const syncTimeoutRef = useRef<number | null>(null);

  const query = useQuery<
    DashboardCheckInStatus,
    Error,
    DashboardCheckInStatus,
    DashboardCheckInStatusQueryKey
  >({
    queryKey: ['dashboard-check-in-status'],
    queryFn: fetchDashboardCheckInStatus,
    enabled,
    ...queryConfig,
  });
  const { refetch } = query;

  useEffect(() => {
    if (!userEventsSocket || !enabled) return;

    const syncCheckInStatus = () => {
      // Realtime updates can arrive slightly before the read model reflects checkout.
      // Do an immediate refetch plus a short delayed refetch to converge quickly.
      void refetch({ cancelRefetch: false });

      if (syncTimeoutRef.current !== null) {
        window.clearTimeout(syncTimeoutRef.current);
      }

      syncTimeoutRef.current = window.setTimeout(() => {
        void refetch({ cancelRefetch: false });
      }, 1200);
    };

    userEventsSocket.on('user:check-in-status-updated', syncCheckInStatus);
    userEventsSocket.on('user:auth-scope-updated', syncCheckInStatus);
    userEventsSocket.on('connect', syncCheckInStatus);

    return () => {
      userEventsSocket.off('user:check-in-status-updated', syncCheckInStatus);
      userEventsSocket.off('user:auth-scope-updated', syncCheckInStatus);
      userEventsSocket.off('connect', syncCheckInStatus);

      if (syncTimeoutRef.current !== null) {
        window.clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }
    };
  }, [enabled, refetch, userEventsSocket]);

  return query;
}
