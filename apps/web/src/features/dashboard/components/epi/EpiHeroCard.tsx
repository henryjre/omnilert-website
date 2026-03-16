import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { EpiDashboardData } from './types';
import { getEpiZone, getZoneLabel } from './epiUtils';
import { RadialGauge } from './RadialGauge';
import { AnimatedCounter } from './AnimatedCounter';
import { TrendChart } from './TrendChart';

interface EpiHeroCardProps {
  data: EpiDashboardData;
}

export function EpiHeroCard({ data }: EpiHeroCardProps) {
  const zone = getEpiZone(data.epiScore);

  const DeltaIcon = data.epiDelta > 0 ? TrendingUp : data.epiDelta < 0 ? TrendingDown : Minus;
  const deltaColor = data.epiDelta > 0 ? 'text-green-300' : data.epiDelta < 0 ? 'text-red-300' : 'text-gray-300';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
      className="rounded-xl bg-gradient-to-r from-blue-600 to-blue-800 p-6 shadow-lg dark:from-blue-800 dark:to-blue-950"
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
        {/* Left: Gauge */}
        <div className="flex flex-col items-center gap-2">
          <RadialGauge
            value={data.epiScore}
            max={150}
            size={160}
            strokeWidth={12}
            zone={zone}
            showValue={false}
            trackColor="rgba(255,255,255,0.2)"
          />
          {/* Score overlay — shown as big number below gauge on mobile, centered on desktop */}
          <div className="text-center">
            <AnimatedCounter
              value={data.epiScore}
              decimals={1}
              className="text-4xl font-bold text-white"
            />
            <p className="text-xs text-blue-200">{data.currentMonth}</p>
          </div>
        </div>

        {/* Center: Stats */}
        <div className="flex flex-1 flex-col justify-center gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-200">
              Employee Performance Index
            </p>
            <div className="mt-1 flex items-center gap-2">
              <DeltaIcon className={`h-5 w-5 ${deltaColor}`} />
              <span className={`text-sm font-semibold ${deltaColor}`}>
                {data.epiDelta > 0 ? '+' : ''}{data.epiDelta.toFixed(1)} from last month
              </span>
            </div>
          </div>
          {/* Zone badge */}
          <div className="inline-flex w-fit items-center rounded-full bg-white/20 px-3 py-1">
            <span className="text-sm font-medium text-white">{getZoneLabel(zone)}</span>
          </div>
        </div>

        {/* Right: Chart */}
        <div className="flex-1 min-w-0">
          <p className="mb-1 text-xs text-blue-200">Last 6 months</p>
          <TrendChart history={data.history} zone={zone} height={120} />
        </div>
      </div>
    </motion.div>
  );
}
