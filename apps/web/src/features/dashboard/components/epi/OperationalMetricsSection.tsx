import { motion } from 'framer-motion';
import { CalendarCheck, Clock, Zap, ShoppingCart } from 'lucide-react';
import type { EpiCriteria, EpiZone } from './types';
import {
  getRateZone,
  getAovZone,
  getZoneColors,
  getAttendanceImpact,
  getPunctualityImpact,
  getProductivityImpact,
  getAovImpact,
  formatRate,
  formatThreshold,
  renderEpiImpact,
} from './epiUtils';
import { SectionLabel } from './SectionLabel';
import { RadialGauge } from './RadialGauge';
import { AnimatedCounter } from './AnimatedCounter';
import { Card, CardBody } from '@/shared/components/ui/Card';

function getStatusLabel(zone: EpiZone): string {
  switch (zone) {
    case 'green':
      return 'On Track';
    case 'amber':
      return 'At Risk';
    case 'red':
      return 'Critical';
  }
}

function ZoneBadge({ zone }: { zone: EpiZone }) {
  const colors = getZoneColors(zone);
  return (
    <span
      className="rounded-full px-2.5 py-0.5 -mt-3 mb-1 text-[10px] font-semibold uppercase tracking-widest"
      style={{ backgroundColor: `${colors.stroke}18`, color: colors.stroke }}
    >
      {getStatusLabel(zone)}
    </span>
  );
}

function MetricIcon({ icon: Icon, zone }: { icon: React.ElementType; zone: EpiZone }) {
  const colors = getZoneColors(zone);
  return (
    <div
      className="flex h-7 w-7 items-center justify-center rounded-full"
      style={{ backgroundColor: `${colors.stroke}15` }}
    >
      <Icon size={14} style={{ color: colors.stroke }} strokeWidth={2} />
    </div>
  );
}

interface OperationalMetricsSectionProps {
  criteria: EpiCriteria;
}

export function OperationalMetricsSection({ criteria }: OperationalMetricsSectionProps) {
  const attendanceImpact = renderEpiImpact(
    criteria.attendanceRate !== null ? getAttendanceImpact(criteria.attendanceRate) : null,
  );
  const punctualityImpact = renderEpiImpact(
    criteria.punctualityRate !== null ? getPunctualityImpact(criteria.punctualityRate) : null,
  );
  const productivityImpact = renderEpiImpact(
    criteria.productivityRate !== null ? getProductivityImpact(criteria.productivityRate) : null,
  );

  const aovZone =
    criteria.aov !== null && criteria.branchAov !== null
      ? getAovZone(criteria.aov, criteria.branchAov)
      : 'amber';
  const aovColors = getZoneColors(aovZone);
  const aovPercent =
    criteria.aov !== null && criteria.branchAov !== null && criteria.branchAov > 0
      ? Math.min(100, (criteria.aov / (criteria.branchAov * 1.5)) * 100)
      : 0;
  const branchPercent =
    criteria.branchAov !== null
      ? Math.min(100, (criteria.branchAov / (criteria.branchAov * 1.5)) * 100)
      : 0;

  return (
    <div>
      <SectionLabel>Operational Performance Metrics</SectionLabel>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 items-stretch">
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
                    size={96}
                    strokeWidth={8}
                    zone={getRateZone(criteria.attendanceRate)}
                    valueFormat={formatRate}
                    delay={0.1}
                  />
                  <ZoneBadge zone={getRateZone(criteria.attendanceRate)} />
                  <div>
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      Attendance Rate
                    </p>
                    <p className={`text-[11px] ${attendanceImpact.className}`}>
                      {attendanceImpact.text}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                    <CalendarCheck size={14} className="text-gray-400" />
                  </div>
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                    <span className="text-2xl font-bold text-gray-400">---</span>
                  </div>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    Attendance Rate
                  </p>
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
                    size={96}
                    strokeWidth={8}
                    zone={getRateZone(criteria.punctualityRate)}
                    valueFormat={formatRate}
                    delay={0}
                  />
                  <ZoneBadge zone={getRateZone(criteria.punctualityRate)} />
                  <div>
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      Punctuality Rate
                    </p>
                    <p className={`text-[11px] ${punctualityImpact.className}`}>
                      {punctualityImpact.text}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                    <Clock size={14} className="text-gray-400" />
                  </div>
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                    <span className="text-2xl font-bold text-gray-400">---</span>
                  </div>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    Punctuality Rate
                  </p>
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
                    size={96}
                    strokeWidth={8}
                    zone={getRateZone(criteria.productivityRate)}
                    valueFormat={formatRate}
                    delay={0.2}
                  />
                  <ZoneBadge zone={getRateZone(criteria.productivityRate)} />
                  <div>
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      Productivity Rate
                    </p>
                    <p
                      className={`text-[11px] ${renderEpiImpact(getProductivityImpact(criteria.productivityRate)).className}`}
                    >
                      {renderEpiImpact(getProductivityImpact(criteria.productivityRate)).text}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                    <Zap size={14} className="text-gray-400" />
                  </div>
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                    <span className="text-2xl font-bold text-gray-400">---</span>
                  </div>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    Productivity Rate
                  </p>
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
                  <RadialGauge
                    value={criteria.aov}
                    max={criteria.branchAov !== null ? Math.max(criteria.aov, criteria.branchAov) : criteria.aov}
                    size={96}
                    strokeWidth={8}
                    zone={aovZone}
                    decimals={2}
                    prefix="₱"
                    delay={0.3}
                    markers={criteria.branchAov !== null && criteria.branchAov > 0 ? [{ value: criteria.branchAov, color: '#9ca3af' }] : undefined}
                  />
                  {criteria.branchAov !== null && criteria.branchAov > 0 && (
                    <p className="z-10 text-[10px] text-gray-500 -mt-6 mb-2">
                      Branch avg: ₱{formatThreshold(criteria.branchAov)}
                    </p>
                  )}
                  <ZoneBadge zone={aovZone} />
                  <div>
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      Average Order Value
                    </p>
                    <p
                      className={`text-[11px] ${renderEpiImpact(criteria.aov !== null && criteria.branchAov !== null && criteria.branchAov > 0 ? getAovImpact(((criteria.aov - criteria.branchAov) / criteria.branchAov) * 100) : null).className}`}
                    >
                      {
                        renderEpiImpact(
                          criteria.aov !== null &&
                            criteria.branchAov !== null &&
                            criteria.branchAov > 0
                            ? getAovImpact(
                                ((criteria.aov - criteria.branchAov) / criteria.branchAov) * 100,
                              )
                            : null,
                        ).text
                      }
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                    <ShoppingCart size={18} className="text-gray-400" />
                  </div>
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                    <span className="text-2xl font-bold text-gray-400">--</span>
                  </div>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    Average Order Value
                  </p>
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
