import { motion } from 'framer-motion';
import type { EpiCriteria } from './types';
import { getScoreZone, getZoneColors } from './epiUtils';
import { SectionLabel } from './SectionLabel';
import { RadialGauge } from './RadialGauge';
import { Card, CardBody } from '@/shared/components/ui/Card';

interface PerformanceScoresSectionProps {
  criteria: EpiCriteria;
}

interface ScoreTileProps {
  label: string;
  score: number | null;
  max: number;
  contribution: string;
  delay: number;
}

function ScoreTile({ label, score, max, contribution, delay }: ScoreTileProps) {
  const zone = score !== null ? getScoreZone(score) : 'amber';
  const colors = getZoneColors(zone);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
    >
      <Card>
        <CardBody className="flex flex-col items-center gap-2 py-6 text-center">
          {score !== null ? (
            <>
              <RadialGauge
                value={score}
                max={max}
                size={80}
                strokeWidth={8}
                zone={zone}
                decimals={1}
                delay={delay}
              />
              <div>
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</p>
                <p className={`text-xs ${colors.text} ${colors.darkText}`}>{contribution}</p>
              </div>
            </>
          ) : (
            <>
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                <span className="text-2xl font-bold text-gray-400">—</span>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</p>
                <p className="text-xs italic text-gray-400">No data this period</p>
              </div>
            </>
          )}
        </CardBody>
      </Card>
    </motion.div>
  );
}

export function PerformanceScoresSection({ criteria }: PerformanceScoresSectionProps) {
  return (
    <div>
      <SectionLabel>Performance Scores</SectionLabel>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ScoreTile
          label="Avg. Service Crew QA Audit"
          score={criteria.sqaaScore}
          max={5}
          contribution="Contributes to EPI"
          delay={0}
        />
        <ScoreTile
          label="Avg. Store CCTV Spot Audit"
          score={criteria.scsaScore}
          max={5}
          contribution="Contributes to EPI"
          delay={0.15}
        />
        <ScoreTile
          label="Workplace Relations"
          score={criteria.workplaceRelationsScore}
          max={5}
          contribution="Contributes to EPI"
          delay={0.3}
        />
        <ScoreTile
          label="Productivity Rate"
          score={criteria.productivityRate}
          max={100}
          contribution="Contributes to EPI"
          delay={0.45}
        />
      </div>
    </div>
  );
}
