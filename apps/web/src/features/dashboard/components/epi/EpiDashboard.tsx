import { useEffect, useMemo, useState } from 'react';
import type { EpiDashboardData, LeaderboardEntry } from './types';
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
  leaderboard: LeaderboardEntry[];
  firstName: string;
}

export function EpiDashboard({ data, leaderboard, firstName }: EpiDashboardProps) {
  const fallbackMonthKey = data.history[data.history.length - 1]?.monthKey ?? data.currentMonthKey;
  const [selectedMonthKey, setSelectedMonthKey] = useState(data.currentMonthKey || fallbackMonthKey);

  useEffect(() => {
    setSelectedMonthKey(data.currentMonthKey || fallbackMonthKey);
  }, [data.currentMonthKey, fallbackMonthKey]);

  const selectedEntry = useMemo(() => {
    return data.history.find((entry) => entry.monthKey === selectedMonthKey) ?? data.history[data.history.length - 1];
  }, [data.history, selectedMonthKey]);

  if (!selectedEntry) return null;

  return (
    <div className="space-y-6">
      <GreetingGoalRow firstName={firstName} />

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
          onSelect={setSelectedMonthKey}
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
        selectedMonthKey={selectedMonthKey}
      />
    </div>
  );
}
