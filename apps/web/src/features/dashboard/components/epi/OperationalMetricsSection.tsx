import { motion } from 'framer-motion';
import type { EpiCriteria } from './types';
import { getRateZone, getAovZone, getZoneColors } from './epiUtils';
import { SectionLabel } from './SectionLabel';
import { RadialGauge } from './RadialGauge';
import { AnimatedCounter } from './AnimatedCounter';
import { Card, CardBody } from '@/shared/components/ui/Card';

interface OperationalMetricsSectionProps {
  criteria: EpiCriteria;
}

export function OperationalMetricsSection({ criteria }: OperationalMetricsSectionProps) {
  const aovZone = criteria.aov !== null && criteria.branchAov !== null
    ? getAovZone(criteria.aov, criteria.branchAov)
    : 'amber';
  const aovColors = getZoneColors(aovZone);
  const aovPercent = criteria.aov !== null && criteria.branchAov !== null && criteria.branchAov > 0
    ? Math.min(100, (criteria.aov / (criteria.branchAov * 1.5)) * 100)
    : 0;
  const branchPercent = criteria.branchAov !== null
    ? Math.min(100, (criteria.branchAov / (criteria.branchAov * 1.5)) * 100)
    : 0;

  return (
    <div>
      <SectionLabel>Operational Metrics</SectionLabel>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Cashier Accuracy */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0, ease: 'easeOut' }}
        >
          <Card>
            <CardBody className="flex flex-col items-center gap-2 py-6 text-center">
              {criteria.cashierAccuracyRate !== null ? (
                <>
                  <RadialGauge
                    value={criteria.cashierAccuracyRate}
                    max={100}
                    size={80}
                    strokeWidth={8}
                    zone={getRateZone(criteria.cashierAccuracyRate)}
                    valueFormat={(v) => `${v.toFixed(0)}%`}
                    delay={0}
                  />
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Cashier Accuracy</p>
                </>
              ) : (
                <>
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                    <span className="text-2xl font-bold text-gray-400">—</span>
                  </div>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Cashier Accuracy</p>
                  <p className="text-xs italic text-gray-400">No data this period</p>
                </>
              )}
            </CardBody>
          </Card>
        </motion.div>

        {/* Attendance Rate */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
        >
          <Card>
            <CardBody className="flex flex-col items-center gap-2 py-6 text-center">
              {criteria.attendanceRate !== null ? (
                <>
                  <RadialGauge
                    value={criteria.attendanceRate}
                    max={100}
                    size={80}
                    strokeWidth={8}
                    zone={getRateZone(criteria.attendanceRate)}
                    valueFormat={(v) => `${v.toFixed(0)}%`}
                    delay={0.1}
                  />
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Attendance Rate</p>
                </>
              ) : (
                <>
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                    <span className="text-2xl font-bold text-gray-400">—</span>
                  </div>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Attendance Rate</p>
                  <p className="text-xs italic text-gray-400">No data this period</p>
                </>
              )}
            </CardBody>
          </Card>
        </motion.div>

        {/* Productivity Rate */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2, ease: 'easeOut' }}
        >
          <Card>
            <CardBody className="flex flex-col items-center gap-2 py-6 text-center">
              {criteria.productivityRate !== null ? (
                <>
                  <RadialGauge
                    value={criteria.productivityRate}
                    max={100}
                    size={80}
                    strokeWidth={8}
                    zone={getRateZone(criteria.productivityRate)}
                    valueFormat={(v) => `${v.toFixed(0)}%`}
                    delay={0.2}
                  />
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Productivity Rate</p>
                </>
              ) : (
                <>
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                    <span className="text-2xl font-bold text-gray-400">—</span>
                  </div>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Productivity Rate</p>
                  <p className="text-xs italic text-gray-400">No data this period</p>
                </>
              )}
            </CardBody>
          </Card>
        </motion.div>

        {/* Average Order Value */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' }}
        >
          <Card>
            <CardBody className="flex flex-col items-center gap-3 py-6 text-center">
              {criteria.aov !== null ? (
                <>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Your AOV</p>
                    <AnimatedCounter
                      value={criteria.aov}
                      decimals={0}
                      prefix="₱"
                      delay={0.3}
                      className={`text-2xl font-bold ${aovColors.text} ${aovColors.darkText}`}
                    />
                  </div>
                  {/* Comparison bars */}
                  <div className="w-full space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-16 text-right text-xs text-gray-400">Yours</span>
                      <div className="relative flex-1 h-3 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                        <motion.div
                          className={`absolute inset-y-0 left-0 rounded-full ${aovColors.bg}`}
                          style={{ backgroundColor: aovColors.stroke }}
                          initial={{ width: '0%' }}
                          animate={{ width: `${aovPercent}%` }}
                          transition={{ duration: 1.2, delay: 0.3, ease: 'easeOut' }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-16 text-right text-xs text-gray-400">Branch</span>
                      <div className="relative flex-1 h-3 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                        <motion.div
                          className="absolute inset-y-0 left-0 rounded-full bg-gray-300 dark:bg-gray-600"
                          initial={{ width: '0%' }}
                          animate={{ width: `${branchPercent}%` }}
                          transition={{ duration: 1.2, delay: 0.4, ease: 'easeOut' }}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-gray-400">
                      Branch avg: ₱{criteria.branchAov?.toFixed(0) ?? '—'}
                    </p>
                  </div>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Avg Order Value</p>
                </>
              ) : (
                <>
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                    <span className="text-2xl font-bold text-gray-400">—</span>
                  </div>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Avg Order Value</p>
                  <p className="text-xs italic text-gray-400">No data this period</p>
                </>
              )}
            </CardBody>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
