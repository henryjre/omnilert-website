import { motion } from 'framer-motion';
import { AlertCircle, MinusCircle, Star } from 'lucide-react';
import type { EpiCriteria } from './types';
import { SectionLabel } from './SectionLabel';
import { AnimatedCounter } from './AnimatedCounter';
import { Card, CardBody } from '@/shared/components/ui/Card';

interface DisciplineRecognitionSectionProps {
  criteria: EpiCriteria;
}

export function DisciplineRecognitionSection({ criteria }: DisciplineRecognitionSectionProps) {
  const violationImpact = criteria.violationTotalDecrease;
  const awardImpact = criteria.awardTotalIncrease;
  const penaltyImpact = criteria.penaltyTotalDecrease;

  return (
    <div>
      <SectionLabel>Discipline &amp; Recognition</SectionLabel>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Awards */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <Card className="border-green-300 dark:border-green-800">
            <CardBody className="px-3 py-4 sm:px-6">
              <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:gap-3 sm:text-left">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                  <Star className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Rewards</p>
                  <div className="flex items-baseline justify-center gap-1 sm:justify-start">
                    <AnimatedCounter
                      value={criteria.awardCount}
                      decimals={0}
                      className="text-2xl font-bold text-green-600 dark:text-green-400"
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400">this period</span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-green-600 dark:text-green-400">
                    {criteria.awardCount === 0 ? 'No bonus yet' : `+${awardImpact} EPI points applied`}
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>
        </motion.div>

        {/* Penalties */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut', delay: 0.05 }}
        >
          <Card className="border-orange-300 dark:border-orange-800">
            <CardBody className="px-3 py-4 sm:px-6">
              <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:gap-3 sm:text-left">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
                  <MinusCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Penalties</p>
                  <div className="flex items-baseline justify-center gap-1 sm:justify-start">
                    <AnimatedCounter
                      value={criteria.penaltyCount}
                      decimals={0}
                      className="text-2xl font-bold text-orange-600 dark:text-orange-400"
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400">this period</span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-orange-600 dark:text-orange-400">
                    {criteria.penaltyCount === 0
                      ? 'No penalty yet'
                      : `-${penaltyImpact} EPI points applied`}
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>
        </motion.div>

        {/* Violations */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <Card className="border-red-300 dark:border-red-800">
            <CardBody className="px-3 py-4 sm:px-6">
              <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:gap-3 sm:text-left">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                  <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Violations</p>
                  <div className="flex items-baseline justify-center gap-1 sm:justify-start">
                    <AnimatedCounter
                      value={criteria.violationCount}
                      decimals={0}
                      className="text-2xl font-bold text-red-600 dark:text-red-400"
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400">this period</span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-red-600 dark:text-red-400">
                    {criteria.violationCount === 0
                      ? '✓ Clean record!'
                      : `-${violationImpact} EPI points applied`}
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
