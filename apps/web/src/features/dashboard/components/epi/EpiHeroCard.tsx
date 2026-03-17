import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { EpiDashboardData, EpiMonthEntry } from './types';
import { getEpiZone, getZoneLabel } from './epiUtils';

// Same light tints as the gauge arc — readable on any theme background
const ZONE_COLOR: Record<'green' | 'amber' | 'red', string> = {
  green: '#4ade80',
  amber: '#fbbf24',
  red:   '#f87171',
};
import { OdometerGauge } from './OdometerGauge';
import { TrendChart } from './TrendChart';

interface EpiHeroCardProps {
  data: EpiDashboardData;
  /** The month currently selected in the MonthSelector */
  selectedEntry: EpiMonthEntry;
  /** Index of selectedEntry — used to re-key the gauge for re-animation */
  selectedIndex: number;
}

export function EpiHeroCard({ data, selectedEntry, selectedIndex }: EpiHeroCardProps) {
  const zone = getEpiZone(selectedEntry.score);

  // Delta: difference from the previous month in history
  const selectedIdx = data.history.indexOf(selectedEntry);
  const prevEntry = selectedIdx > 0 ? data.history[selectedIdx - 1] : null;
  const delta = prevEntry ? selectedEntry.score - prevEntry.score : 0;

  const DeltaIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const zoneColor = ZONE_COLOR[zone];
  const deltaStyle = { color: delta === 0 ? 'rgba(255,255,255,0.5)' : zoneColor };

  const prevLabel = prevEntry ? prevEntry.month : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
      className="rounded-xl p-6 shadow-lg"
      style={{
        background: 'linear-gradient(135deg, rgb(var(--primary-600)) 0%, rgb(var(--primary-700)) 50%, rgb(var(--primary-800)) 100%)',
      }}
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
        {/* Left: Odometer gauge — re-keyed on month change to re-animate */}
        <div className="flex flex-col items-center gap-3">
          <OdometerGauge
            key={selectedIndex}
            value={selectedEntry.score}
            max={150}
            neutralAt={100}
            width={220}
            strokeWidth={16}
            zone={zone}
            label={`${selectedEntry.month} ${selectedEntry.year}`}
          />

          {/* Previous month readout beneath gauge */}
          {prevEntry && (
            <div className="flex items-center gap-2.5 border-t border-white/10 pt-2.5 w-full justify-center">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-white/50">
                {prevLabel}
              </span>
              <span className="h-[3px] w-[3px] rounded-full bg-white/20" />
              <span className="text-sm font-bold tabular-nums text-white/70">
                {prevEntry.score.toFixed(1)}
              </span>
            </div>
          )}
        </div>

        {/* Center: Stats */}
        <div className="flex flex-1 flex-col items-center gap-3 lg:items-start lg:justify-center">
          <div className="text-center lg:text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
              Employee Performance Index
            </p>
            <div className="mt-1 flex items-center justify-center gap-2 lg:justify-start">
              <DeltaIcon className="h-5 w-5" style={deltaStyle} />
              <span className="text-sm font-semibold" style={deltaStyle}>
                {delta > 0 ? '+' : ''}{delta.toFixed(1)} from {prevLabel ?? 'last month'}
              </span>
            </div>
          </div>
          {/* Zone badge */}
          <div className="inline-flex w-fit items-center rounded-full bg-white/20 px-3 py-1">
            <span className="text-sm font-medium text-white">{getZoneLabel(zone)}</span>
          </div>
        </div>

        {/* Right: Chart — always shows full history for context */}
        <div className="flex-1 min-w-0">
          <p className="mb-1 text-xs text-white/60">Last {data.history.length} months</p>
          <TrendChart history={data.history} zone={zone} height={120} strokeColor="rgba(255,255,255,0.8)" tickColor="rgba(255,255,255,0.35)" />
        </div>
      </div>
    </motion.div>
  );
}
