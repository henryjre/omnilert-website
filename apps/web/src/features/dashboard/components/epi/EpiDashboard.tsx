import { useState } from 'react';
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
  const currentIndex = data.history.length - 1;
  const [selectedIndex, setSelectedIndex] = useState(currentIndex);

  const selectedEntry = data.history[selectedIndex];

  return (
    <div className="space-y-6">
      <GreetingGoalRow firstName={firstName} />

      {/* Hero reflects the selected month */}
      <EpiHeroCard
        data={data}
        selectedEntry={selectedEntry}
        selectedIndex={selectedIndex}
      />

      {/* Month selector */}
      <div className="space-y-2">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
          Monthly Breakdown
        </p>
        <MonthSelector
          history={data.history}
          selectedIndex={selectedIndex}
          onSelect={setSelectedIndex}
          currentIndex={currentIndex}
        />
      </div>

      {/* Detail sections — no section-level AnimatePresence; individual components handle their own number/gauge animations */}
      <div className="space-y-6">
        <PerformanceScoresSection criteria={selectedEntry.criteria} />
        <OperationalMetricsSection criteria={selectedEntry.criteria} />
        <OperationalComplianceSection criteria={selectedEntry.criteria} />
        <DisciplineRecognitionSection criteria={selectedEntry.criteria} />
      </div>

      <EpiLeaderboard entries={leaderboard} selectedIndex={selectedIndex} />
    </div>
  );
}
