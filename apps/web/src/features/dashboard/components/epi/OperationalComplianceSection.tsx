import { motion } from 'framer-motion';
import { ShieldCheck, Sparkles, ClipboardList } from 'lucide-react';
import type { EpiCriteria, EpiZone } from './types';
import {
  getRateZone,
  getZoneColors,
  getUniformImpact,
  getHygieneImpact,
  getSopImpact,
  renderEpiImpact,
} from './epiUtils';
import { SectionLabel } from './SectionLabel';
import { RadialGauge } from './RadialGauge';
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
      className="flex h-9 w-9 items-center justify-center rounded-full"
      style={{ backgroundColor: `${colors.stroke}15` }}
    >
      <Icon size={18} style={{ color: colors.stroke }} strokeWidth={2} />
    </div>
  );
}

interface ComplianceCardProps {
  label: string;
  value: number | null;
  icon: React.ElementType;
  delay: number;
  impactValue: number | null;
  /** When true, the card spans full width on mobile (2 cols) and is constrained + centered */
  centerOnMobile?: boolean;
}

function ComplianceCard({
  label,
  value,
  icon: Icon,
  delay,
  impactValue,
  centerOnMobile,
}: ComplianceCardProps) {
  const zone = value !== null ? getRateZone(value) : 'amber';
  const impact = renderEpiImpact(impactValue);

  const card = (
    <Card className="h-full">
      <CardBody className="flex h-full flex-col items-center justify-center gap-2 py-6 text-center">
        {value !== null ? (
          <>
            <MetricIcon icon={Icon} zone={zone} />
            <RadialGauge
              value={value}
              max={100}
              size={80}
              strokeWidth={8}
              zone={zone}
              valueFormat={(v) => `${v.toFixed(0)}%`}
              delay={delay}
            />
            <ZoneBadge zone={zone} />
            <div>
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</p>
              <p className={`text-[11px] ${impact.className}`}>{impact.text}</p>
            </div>
          </>
        ) : (
          <>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
              <Icon size={18} className="text-gray-400" />
            </div>
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
              <span className="text-2xl font-bold text-gray-400">—</span>
            </div>
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</p>
            <p className="text-xs italic text-gray-400">No data this period</p>
          </>
        )}
      </CardBody>
    </Card>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
      className={centerOnMobile ? 'col-span-2 flex justify-center lg:col-span-1' : 'h-full'}
    >
      {centerOnMobile ? <div className="h-full w-[calc(50%-8px)] lg:w-full">{card}</div> : card}
    </motion.div>
  );
}

interface OperationalComplianceSectionProps {
  criteria: EpiCriteria;
}

export function OperationalComplianceSection({ criteria }: OperationalComplianceSectionProps) {
  return (
    <div>
      <SectionLabel>Operational Compliance Metrics</SectionLabel>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 items-stretch">
        <ComplianceCard
          label="Uniform Compliance"
          value={criteria.uniformComplianceRate}
          icon={ShieldCheck}
          impactValue={
            criteria.uniformComplianceRate !== null
              ? getUniformImpact(criteria.uniformComplianceRate)
              : null
          }
          delay={0}
        />
        <ComplianceCard
          label="Hygiene Compliance"
          value={criteria.hygieneComplianceRate}
          icon={Sparkles}
          impactValue={
            criteria.hygieneComplianceRate !== null
              ? getHygieneImpact(criteria.hygieneComplianceRate)
              : null
          }
          delay={0.1}
        />
        <ComplianceCard
          label="SOP Compliance"
          value={criteria.sopComplianceRate}
          icon={ClipboardList}
          impactValue={
            criteria.sopComplianceRate !== null ? getSopImpact(criteria.sopComplianceRate) : null
          }
          delay={0.2}
          centerOnMobile
        />
      </div>
    </div>
  );
}
