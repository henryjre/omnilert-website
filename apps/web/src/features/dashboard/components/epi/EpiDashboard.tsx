import type { EpiDashboardData, LeaderboardEntry } from './types';
import { GreetingGoalRow } from './GreetingGoalRow';
import { EpiHeroCard } from './EpiHeroCard';
import { PerformanceScoresSection } from './PerformanceScoresSection';
import { OperationalMetricsSection } from './OperationalMetricsSection';
import { DisciplineRecognitionSection } from './DisciplineRecognitionSection';
import { EpiLeaderboard } from './EpiLeaderboard';

interface EpiDashboardProps {
  data: EpiDashboardData;
  leaderboard: LeaderboardEntry[];
  firstName: string;
}

export function EpiDashboard({ data, leaderboard, firstName }: EpiDashboardProps) {
  return (
    <div className="space-y-6">
      <GreetingGoalRow
        firstName={firstName}
        epiScore={data.epiScore}
        goalTarget={data.goalTarget}
      />
      <EpiHeroCard data={data} />
      <PerformanceScoresSection criteria={data.criteria} />
      <OperationalMetricsSection criteria={data.criteria} />
      <DisciplineRecognitionSection criteria={data.criteria} />
      <EpiLeaderboard entries={leaderboard} />
    </div>
  );
}
