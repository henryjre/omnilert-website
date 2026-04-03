import { useMemo, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { EpiDashboardData, LeaderboardSummaryEntry } from './types';
import { GreetingGoalRow } from './GreetingGoalRow';
import { EpiHeroCard } from './EpiHeroCard';
import { CheckInStatusCard } from '../checkin/CheckInStatusCard';
import { MonthSelector } from './MonthSelector';
import { PerformanceScoresSection } from './PerformanceScoresSection';
import { OperationalMetricsSection } from './OperationalMetricsSection';
import { OperationalComplianceSection } from './OperationalComplianceSection';
import { DisciplineRecognitionSection } from './DisciplineRecognitionSection';
import { EpiLeaderboard } from './EpiLeaderboard';
import type { DashboardCheckInStatus } from '../../services/epi.api';

interface EpiDashboardProps {
  data: EpiDashboardData;
  leaderboard: LeaderboardSummaryEntry[];
  leaderboardLoading: boolean;
  leaderboardError: string | null;
  checkInStatus: DashboardCheckInStatus | null;
  checkInStatusLoading: boolean;
  firstName: string;
  headerAction?: ReactNode;
  selectedMonthKey: string;
  onSelectMonth: (monthKey: string) => void;
  onRefreshStatus?: () => void;
}

export function EpiDashboard({
  data,
  leaderboard,
  leaderboardLoading,
  leaderboardError,
  checkInStatus,
  checkInStatusLoading,
  firstName,
  headerAction,
  selectedMonthKey,
  onSelectMonth,
  onRefreshStatus,
}: EpiDashboardProps) {
  const selectedEntry = useMemo(() => {
    return data.history.find((entry) => entry.monthKey === selectedMonthKey) ?? data.history[data.history.length - 1];
  }, [data.history, selectedMonthKey]);

  if (!selectedEntry) return null;

  return (
    <div className="space-y-6">
      <GreetingGoalRow firstName={firstName} action={headerAction} />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
        className="relative flex flex-col w-full"
      >
        <div className="relative z-10 w-full">
          <EpiHeroCard
            data={data}
            selectedEntry={selectedEntry}
          />
        </div>
        <div className="relative z-0 w-full -mt-4">
          <CheckInStatusCard
            status={checkInStatus}
            loading={checkInStatusLoading}
            onRefresh={onRefreshStatus}
          />
        </div>
      </motion.div>

      <div className="space-y-2">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
          Monthly Breakdown
        </p>
        <MonthSelector
          history={data.history}
          selectedMonthKey={selectedMonthKey}
          onSelect={onSelectMonth}
          currentMonthKey={data.currentMonthKey}
        />
      </div>

      <div className="space-y-6">
        <PerformanceScoresSection
          criteria={selectedEntry.criteria}
          wrsStatus={selectedEntry.source === 'live' ? selectedEntry.wrsStatus ?? null : null}
        />
        <OperationalMetricsSection criteria={selectedEntry.criteria} />
        <OperationalComplianceSection criteria={selectedEntry.criteria} />
        <DisciplineRecognitionSection criteria={selectedEntry.criteria} />
      </div>

      <EpiLeaderboard
        entries={leaderboard}
        loading={leaderboardLoading}
        error={leaderboardError}
        currentMonthKey={data.currentMonthKey}
        selectedMonthKey={selectedMonthKey}
      />
    </div>
  );
}
