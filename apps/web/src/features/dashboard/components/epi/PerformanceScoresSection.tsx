import { motion } from 'framer-motion';
import type { EpiCriteria, WrsStatusSummary } from './types';
import { getScoreZone, getZoneColors } from './epiUtils';
import { SectionLabel } from './SectionLabel';
import { StarRating } from './StarRating';
import { Card, CardBody } from '@/shared/components/ui/Card';

interface PerformanceScoresSectionProps {
  criteria: EpiCriteria;
  wrsStatus?: WrsStatusSummary | null;
}

interface StarTileProps {
  label: string;
  score: number | null;
  subtext: string;
  delay: number;
}

function StarTile({ label, score, subtext, delay }: StarTileProps) {
  const zone = score !== null ? getScoreZone(score) : 'amber';
  const colors = getZoneColors(zone);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
      className="h-full"
    >
      <Card className="h-full">
        <CardBody className="flex h-full flex-col items-center justify-center gap-3 py-6 text-center">
          {score !== null ? (
            <>
              <StarRating score={score} zone={zone} delay={delay} size={24} gap={5} />
              <div>
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</p>
                <p className={`text-xs ${colors.text} ${colors.darkText}`}>{subtext}</p>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                {Array.from({ length: 5 }, (_, index) => (
                  <svg key={index} width={24} height={24} viewBox="0 0 24 24">
                    <path
                      d="M12 2.25l2.47 5.01 5.53.8-4 3.9.94 5.5L12 14.77l-4.94 2.69.94-5.5-4-3.9 5.53-.8z"
                      fill="#e5e7eb"
                    />
                  </svg>
                ))}
              </div>
              <div>
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</p>
                <p className="text-xs italic text-gray-400">{subtext}</p>
              </div>
            </>
          )}
        </CardBody>
      </Card>
    </motion.div>
  );
}

export function PerformanceScoresSection({ criteria, wrsStatus }: PerformanceScoresSectionProps) {
  const wrsDelayedText =
    wrsStatus && wrsStatus.delayedCount > 0
      ? `${wrsStatus.delayedCount} submission(s) delayed for privacy`
      : 'Contributes to EPI';
  const wrsEmptyText =
    wrsStatus && wrsStatus.delayedCount > 0
      ? `${wrsStatus.delayedCount} submission(s) delayed for privacy`
      : 'No effective peer evaluations yet';

  return (
    <div>
      <SectionLabel>Performance Scores</SectionLabel>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 items-stretch">
        <StarTile
          label="Customer Interaction"
          score={criteria.customerInteractionScore}
          subtext={criteria.customerInteractionScore !== null ? 'Contributes to EPI' : 'Awaiting CCTV audits'}
          delay={0}
        />
        <StarTile
          label="Cashiering"
          score={criteria.cashieringScore}
          subtext={criteria.cashieringScore !== null ? 'Contributes to EPI' : 'Awaiting CCTV audits'}
          delay={0.1}
        />
        <StarTile
          label="Suggestive Selling & Upselling"
          score={criteria.suggestiveSellingUpsellingScore}
          subtext={criteria.suggestiveSellingUpsellingScore !== null ? 'Contributes to EPI' : 'Awaiting CCTV audits'}
          delay={0.2}
        />
        <StarTile
          label="Service Efficiency"
          score={criteria.serviceEfficiencyScore}
          subtext={criteria.serviceEfficiencyScore !== null ? 'Contributes to EPI' : 'Awaiting CCTV audits'}
          delay={0.3}
        />
        <StarTile
          label="Workplace Relations Score"
          score={criteria.workplaceRelationsScore}
          subtext={criteria.workplaceRelationsScore !== null ? wrsDelayedText : wrsEmptyText}
          delay={0.4}
        />
        <StarTile
          label="Professional Conduct Score"
          score={criteria.professionalConductScore}
          subtext={criteria.professionalConductScore !== null ? 'Contributes to EPI' : 'Awaiting management evaluations'}
          delay={0.5}
        />
      </div>
    </div>
  );
}
