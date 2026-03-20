import { useMemo, type ReactNode } from 'react';
import type { EpiDashboardData, LeaderboardSummaryEntry } from './types';
import { GreetingGoalRow } from './GreetingGoalRow';
import { EpiHeroCard } from './EpiHeroCard';
import { MonthSelector } from './MonthSelector';
import { PerformanceScoresSection } from './PerformanceScoresSection';
import { OperationalMetricsSection } from './OperationalMetricsSection';
import { OperationalComplianceSection } from './OperationalComplianceSection';
import { DisciplineRecognitionSection } from './DisciplineRecognitionSection';
import { EpiLeaderboard } from './EpiLeaderboard';

interface EpiDashboardProps {
  data: EpiDashboardData;
  leaderboard: LeaderboardSummaryEntry[];
  leaderboardLoading: boolean;
  leaderboardError: string | null;
  firstName: string;
  headerAction?: ReactNode;
  selectedMonthKey: string;
  onSelectMonth: (monthKey: string) => void;
}

export function EpiDashboard({
  data,
  leaderboard,
  leaderboardLoading,
  leaderboardError,
  firstName,
  headerAction,
  selectedMonthKey,
  onSelectMonth,
}: EpiDashboardProps) {
  const selectedEntry = useMemo(() => {
    return data.history.find((entry) => entry.monthKey === selectedMonthKey) ?? data.history[data.history.length - 1];
  }, [data.history, selectedMonthKey]);

  if (!selectedEntry) return null;

  return (
    <div className="space-y-6">
      <GreetingGoalRow firstName={firstName} action={headerAction} />

      <EpiHeroCard
        data={data}
        selectedEntry={selectedEntry}
      />

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
