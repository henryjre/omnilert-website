import { motion } from 'framer-motion';
import { Target } from 'lucide-react';
import { getGreeting } from './epiUtils';

interface GreetingGoalRowProps {
  firstName: string;
  epiScore: number;
  goalTarget: number;
}

export function GreetingGoalRow({ firstName, epiScore, goalTarget }: GreetingGoalRowProps) {
  const distanceToGoal = goalTarget - epiScore;
  const goalReached = distanceToGoal <= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
    >
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {getGreeting()}, {firstName}!
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Here's your performance journey
        </p>
      </div>

      {/* Goal card */}
      <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50/60 px-4 py-3 dark:border-green-800 dark:bg-green-900/10">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <Target className="h-5 w-5 text-green-600 dark:text-green-400" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-green-600 dark:text-green-400">
            Monthly Goal
          </p>
          <p className="text-lg font-bold text-gray-900 dark:text-white">{goalTarget} EPI</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {goalReached
              ? '🎉 Goal reached!'
              : `${distanceToGoal.toFixed(1)} points to go`}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
