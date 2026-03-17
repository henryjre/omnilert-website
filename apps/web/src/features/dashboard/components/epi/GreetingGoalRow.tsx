import { motion } from 'framer-motion';
import { getGreeting } from './epiUtils';

interface GreetingGoalRowProps {
  firstName: string;
}

export function GreetingGoalRow({ firstName }: GreetingGoalRowProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
        {getGreeting()}, {firstName}!
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Here's your performance journey
      </p>
    </motion.div>
  );
}
