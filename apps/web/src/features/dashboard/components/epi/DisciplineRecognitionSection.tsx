import { motion } from 'framer-motion';
import { AlertCircle, Star } from 'lucide-react';
import type { EpiCriteria } from './types';
import { SectionLabel } from './SectionLabel';
import { AnimatedCounter } from './AnimatedCounter';
import { Card, CardBody } from '@/shared/components/ui/Card';
import { VIOLATION_DEDUCTION, AWARD_BONUS } from './epiUtils';

interface DisciplineRecognitionSectionProps {
  criteria: EpiCriteria;
}

export function DisciplineRecognitionSection({ criteria }: DisciplineRecognitionSectionProps) {
  const violationImpact = criteria.violationTotalDecrease;
  const awardImpact = criteria.awardCount * AWARD_BONUS;

  return (
    <div>
      <SectionLabel>Discipline &amp; Recognition</SectionLabel>
      <div className="grid grid-cols-2 gap-4">
        {/* Awards */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <Card className="border-amber-400 dark:border-amber-700">
            <CardBody className="px-3 py-4 sm:px-6">
              <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:gap-3 sm:text-left">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                  <Star className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Awards</p>
                  <div className="flex items-baseline justify-center gap-1 sm:justify-start">
                    <AnimatedCounter
                      value={criteria.awardCount}
                      decimals={0}
                      className="text-2xl font-bold text-amber-600 dark:text-amber-400"
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400">this period</span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-amber-600 dark:text-amber-400">
                    {criteria.awardCount === 0 ? 'No bonus yet' : `+${awardImpact} pts to EPI`}
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
