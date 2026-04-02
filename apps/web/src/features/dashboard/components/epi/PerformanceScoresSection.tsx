import { motion } from 'framer-motion';
import type { EpiCriteria, WrsStatusSummary } from './types';
import { getScoreZone, getZoneColors, renderEpiImpact, getCustomerInteractionImpact, getCashieringImpact, getSuggestiveSellingImpact, getServiceEfficiencyImpact, getWrsImpact, getPcsImpact, type RenderedImpact } from './epiUtils';
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
  impact?: RenderedImpact;
  fallbackText: string;
  delay: number;
}

function StarTile({ label, score, impact, fallbackText, delay }: StarTileProps) {
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
                <p className={`text-xs ${impact?.className ?? `${colors.text} ${colors.darkText}`}`}>
                  {impact?.text ?? fallbackText}
                </p>
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
                <p className="text-xs italic text-gray-400">{fallbackText}</p>
              </div>
            </>
          )}
        </CardBody>
      </Card>
    </motion.div>
  );
}

export function PerformanceScoresSection({ criteria, wrsStatus }: PerformanceScoresSectionProps) {
  const ciImpact = renderEpiImpact(criteria.customerInteractionScore !== null ? getCustomerInteractionImpact(criteria.customerInteractionScore) : null);
  const cashieringImpact = renderEpiImpact(criteria.cashieringScore !== null ? getCashieringImpact(criteria.cashieringScore) : null);
  const ssImpact = renderEpiImpact(criteria.suggestiveSellingUpsellingScore !== null ? getSuggestiveSellingImpact(criteria.suggestiveSellingUpsellingScore) : null);
  const seImpact = renderEpiImpact(criteria.serviceEfficiencyScore !== null ? getServiceEfficiencyImpact(criteria.serviceEfficiencyScore) : null);
  const wrsImpact = renderEpiImpact(criteria.workplaceRelationsScore !== null ? getWrsImpact(criteria.workplaceRelationsScore) : null);
  const pcsImpact = renderEpiImpact(criteria.professionalConductScore !== null ? getPcsImpact(criteria.professionalConductScore) : null);

  return (
    <div>
      <SectionLabel>Performance Scores</SectionLabel>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 items-stretch">
        <StarTile
          label="Customer Interaction"
          score={criteria.customerInteractionScore}
          impact={criteria.customerInteractionScore !== null ? ciImpact : undefined}
          fallbackText="Awaiting CCTV audits"
          delay={0}
        />
        <StarTile
          label="Cashiering"
          score={criteria.cashieringScore}
          impact={criteria.cashieringScore !== null ? cashieringImpact : undefined}
          fallbackText="Awaiting CCTV audits"
          delay={0.1}
        />
        <StarTile
          label="Suggestive Selling & Upselling"
          score={criteria.suggestiveSellingUpsellingScore}
          impact={criteria.suggestiveSellingUpsellingScore !== null ? ssImpact : undefined}
          fallbackText="Awaiting CCTV audits"
          delay={0.2}
        />
        <StarTile
          label="Service Efficiency"
          score={criteria.serviceEfficiencyScore}
          impact={criteria.serviceEfficiencyScore !== null ? seImpact : undefined}
          fallbackText="Awaiting CCTV audits"
          delay={0.3}
        />
        <StarTile
          label="Workplace Relations Score"
          score={criteria.workplaceRelationsScore}
          impact={criteria.workplaceRelationsScore !== null ? wrsImpact : undefined}
          fallbackText={wrsStatus && wrsStatus.delayedCount > 0 ? "No EPI change" : "No effective evaluations yet"}
          delay={0.4}
        />
        <StarTile
          label="Professional Conduct Score"
          score={criteria.professionalConductScore}
          impact={criteria.professionalConductScore !== null ? pcsImpact : undefined}
          fallbackText="Awaiting management evaluations"
          delay={0.5}
        />
      </div>
    </div>
  );
}
