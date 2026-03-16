import { motion } from 'framer-motion';
import { AlertCircle, Star } from 'lucide-react';
import type { EpiCriteria } from './types';
import { SectionLabel } from './SectionLabel';
import { AnimatedCounter } from './AnimatedCounter';
import { Card, CardBody } from '@/shared/components/ui/Card';
import { VIOLATION_DEDUCTION, AWARD_BONUS } from './mockData';

interface DisciplineRecognitionSectionProps {
  criteria: EpiCriteria;
}

export function DisciplineRecognitionSection({ criteria }: DisciplineRecognitionSectionProps) {
  const violationImpact = criteria.violationCount * VIOLATION_DEDUCTION;
  const awardImpact = criteria.awardCount * AWARD_BONUS;

  return (
    <div>
      <SectionLabel>Discipline &amp; Recognition</SectionLabel>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Violations */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <Card className="border-red-200 dark:border-red-900">
            <CardBody>
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                  <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Violations</p>
                  <div className="flex items-baseline gap-1">
                    <AnimatedCounter
                      value={criteria.violationCount}
                      decimals={0}
                      className="text-2xl font-bold text-red-600 dark:text-red-400"
                    />
                    <span className="text-sm text-gray-500 dark:text-gray-400">this period</span>
                  </div>
                  <p className="text-xs text-red-600 dark:text-red-400">
                    {criteria.violationCount === 0
                      ? '✓ Clean record!'
                      : `-${violationImpact} pts to EPI`}
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>
        </motion.div>

        {/* Awards */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <Card className="border-amber-200 dark:border-amber-900">
            <CardBody>
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                  <Star className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Awards</p>
                  <div className="flex items-baseline gap-1">
                    <AnimatedCounter
                      value={criteria.awardCount}
                      decimals={0}
                      className="text-2xl font-bold text-amber-600 dark:text-amber-400"
                    />
                    <span className="text-sm text-gray-500 dark:text-gray-400">this period</span>
                  </div>
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {criteria.awardCount === 0
                      ? 'No bonus yet'
                      : `+${awardImpact} pts to EPI`}
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
