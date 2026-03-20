import { motion } from 'framer-motion';
import { CalendarCheck, Clock, Zap, ShoppingCart } from 'lucide-react';
import type { EpiCriteria, EpiZone } from './types';
import { getRateZone, getAovZone, getZoneColors } from './epiUtils';
import { SectionLabel } from './SectionLabel';
import { RadialGauge } from './RadialGauge';
import { AnimatedCounter } from './AnimatedCounter';
import { Card, CardBody } from '@/shared/components/ui/Card';

function getStatusLabel(zone: EpiZone): string {
  switch (zone) {
    case 'green': return 'On Track';
    case 'amber': return 'At Risk';
    case 'red': return 'Critical';
  }
}

function ZoneBadge({ zone }: { zone: EpiZone }) {
  const colors = getZoneColors(zone);
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest"
      style={{ backgroundColor: `${colors.stroke}18`, color: colors.stroke }}
    >
      {getStatusLabel(zone)}
    </span>
  );
}

function MetricIcon({
  icon: Icon,
  zone,
}: {
  icon: React.ElementType;
  zone: EpiZone;
}) {
  const colors = getZoneColors(zone);
  return (
    <div
      className="flex h-9 w-9 items-center justify-center rounded-full"
      style={{ backgroundColor: `${colors.stroke}15` }}
    >
      <Icon size={18} style={{ color: colors.stroke }} strokeWidth={2} />
    </div>
  );
}

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
      <SectionLabel>Operational Performance Metrics</SectionLabel>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 items-stretch">

        {/* Attendance Rate */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
          className="h-full"
        >
          <Card className="h-full">
            <CardBody className="flex h-full flex-col items-center justify-center gap-2 py-6 text-center">
              {criteria.attendanceRate !== null ? (
                <>
                  <MetricIcon icon={CalendarCheck} zone={getRateZone(criteria.attendanceRate)} />
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
                  <ZoneBadge zone={getRateZone(criteria.attendanceRate)} />
                </>
              ) : (
                <>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                    <CalendarCheck size={18} className="text-gray-400" />
                  </div>
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                    <span className="text-2xl font-bold text-gray-400">--</span>
                  </div>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Attendance Rate</p>
                  <p className="text-xs italic text-gray-400">No data this period</p>
                </>
              )}
            </CardBody>
          </Card>
        </motion.div>

        {/* Punctuality Rate */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0, ease: 'easeOut' }}
          className="h-full"
        >
          <Card className="h-full">
            <CardBody className="flex h-full flex-col items-center justify-center gap-2 py-6 text-center">
              {criteria.punctualityRate !== null ? (
                <>
                  <MetricIcon icon={Clock} zone={getRateZone(criteria.punctualityRate)} />
                  <RadialGauge
                    value={criteria.punctualityRate}
                    max={100}
                    size={80}
                    strokeWidth={8}
                    zone={getRateZone(criteria.punctualityRate)}
                    valueFormat={(v) => `${v.toFixed(0)}%`}
                    delay={0}
                  />
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Punctuality Rate</p>
                  <ZoneBadge zone={getRateZone(criteria.punctualityRate)} />
                </>
              ) : (
                <>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                    <Clock size={18} className="text-gray-400" />
                  </div>
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                    <span className="text-2xl font-bold text-gray-400">--</span>
                  </div>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Punctuality Rate</p>
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
          className="h-full"
        >
          <Card className="h-full">
            <CardBody className="flex h-full flex-col items-center justify-center gap-2 py-6 text-center">
              {criteria.productivityRate !== null ? (
                <>
                  <MetricIcon icon={Zap} zone={getRateZone(criteria.productivityRate)} />
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
                  <ZoneBadge zone={getRateZone(criteria.productivityRate)} />
                </>
              ) : (
                <>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                    <Zap size={18} className="text-gray-400" />
                  </div>
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                    <span className="text-2xl font-bold text-gray-400">--</span>
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
          className="h-full"
        >
          <Card className="h-full">
            <CardBody className="flex h-full flex-col items-center justify-center gap-3 py-6 text-center">
              {criteria.aov !== null ? (
                <>
                  <MetricIcon icon={ShoppingCart} zone={aovZone} />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Your AOV</p>
                    <AnimatedCounter
                      value={criteria.aov}
                      decimals={0}
                      prefix="P"
                      delay={0.3}
                      className={`text-xl lg:text-2xl font-bold ${aovColors.text} ${aovColors.darkText}`}
                    />
                  </div>
                  {/* Comparison bars */}
                  <div className="w-full space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-10 text-right text-[10px] text-gray-400">You</span>
                      <div className="relative flex-1 h-2.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                        <motion.div
                          className={`absolute inset-y-0 left-0 rounded-full ${aovColors.bg}`}
                          style={{ backgroundColor: aovColors.stroke }}
                          initial={{ width: '0%' }}
                          animate={{ width: `${aovPercent}%` }}
                          transition={{ duration: 1.2, delay: 0.3, ease: 'easeOut' }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-10 text-right text-[10px] text-gray-400">Branch</span>
                      <div className="relative flex-1 h-2.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                        <motion.div
                          className="absolute inset-y-0 left-0 rounded-full bg-gray-400 dark:bg-gray-500"
                          initial={{ width: '0%' }}
                          animate={{ width: `${branchPercent}%` }}
                          transition={{ duration: 1.2, delay: 0.4, ease: 'easeOut' }}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-gray-400">
                      Branch avg: P{criteria.branchAov?.toFixed(0) ?? '--'}
                    </p>
                  </div>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Average Order Value</p>
                  <ZoneBadge zone={aovZone} />
                </>
              ) : (
                <>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                    <ShoppingCart size={18} className="text-gray-400" />
                  </div>
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                    <span className="text-2xl font-bold text-gray-400">--</span>
                  </div>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Average Order Value</p>
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
