import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { getGreeting } from './epiUtils';

interface GreetingGoalRowProps {
  firstName: string;
  action?: ReactNode;
}

export function GreetingGoalRow({ firstName, action }: GreetingGoalRowProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
    >
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {getGreeting()}, {firstName}!
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Here's your performance journey
        </p>
      </div>

      {action ? (
        <div className="w-full self-start sm:w-auto sm:self-center">
          {action}
        </div>
      ) : null}
    </motion.div>
  );
}
