import { motion } from 'framer-motion';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import type { EpiDashboardData, EpiMonthEntry } from './types';
import { getEpiZone, formatThreshold } from './epiUtils';
import { OdometerGauge } from './OdometerGauge';
import { TrendChart } from './TrendChart';
import { getHeroZoneLabel, resolveHeroEpiComparison, type HeroEpiZone } from './heroEpiComparison';

const ZONE_COLOR: Record<HeroEpiZone, string> = {
  green: '#4ade80',
  amber: '#fbbf24',
  red: '#f87171',
  blue: '#60a5fa',
};
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

interface EpiHeroCardProps {
  data: EpiDashboardData;
  selectedEntry: EpiMonthEntry;
}

function formatEpiScore(score: number): string {
  if (!Number.isFinite(score)) return '-';
  return formatThreshold(score);
}

function getNextWeeklySnapshotDate(now: Date = new Date()): Date {
  const manilaNow = new Date(now.getTime() + MANILA_OFFSET_MS);
  const nextSnapshot = new Date(manilaNow.getTime());

  nextSnapshot.setUTCHours(17, 0, 0, 0);
  const daysUntilSunday = (7 - nextSnapshot.getUTCDay()) % 7;
  nextSnapshot.setUTCDate(nextSnapshot.getUTCDate() + daysUntilSunday);

  if (nextSnapshot.getTime() <= manilaNow.getTime()) {
    nextSnapshot.setUTCDate(nextSnapshot.getUTCDate() + 7);
  }

  return new Date(nextSnapshot.getTime() - MANILA_OFFSET_MS);
}

function formatSnapshotDate(date: Date): string {
  return `${new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)} PHT `;
}

function AnimatedBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Deep Layer - Large slow movement */}
      <motion.div
        animate={{
          x: [0, 30, -30, 0],
          y: [0, -50, 50, 0],
        }}
        transition={{
          duration: 30,
          repeat: Infinity,
          ease: "linear",
        }}
        className="absolute -top-[50%] -left-[50%] h-[200%] w-[200%] opacity-[0.2]"
        style={{
          background: 'radial-gradient(circle at center, rgb(var(--primary-400)) 0%, transparent 50%)',
          filter: 'blur(100px)',
          mixBlendMode: 'soft-light',
        }}
      />

      {/* Surface Layer - Slightly faster subtle shift */}
      <motion.div
        animate={{
          x: [0, -40, 40, 0],
          y: [0, 30, -30, 0],
        }}
        transition={{
          duration: 25,
          repeat: Infinity,
          ease: "linear",
          delay: -5,
        }}
        className="absolute -bottom-[50%] -right-[50%] h-[200%] w-[200%] opacity-[0.15]"
        style={{
          background: 'radial-gradient(circle at center, rgb(var(--primary-300)) 0%, transparent 45%)',
          filter: 'blur(120px)',
          mixBlendMode: 'overlay',
        }}
      />

      {/* Grain / Noise Texture for a premium paper-like feel */}
      <div
        className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3Y%3Cfilter id='noiseFilter'%3Y%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3Y%3C/filter%3Y%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3Y%3C/svg%3Y")`,
          filter: 'contrast(120%) brightness(100%)',
        }}
      />

      {/* Ambient subtle light leak */}
      <motion.div
        animate={{
          opacity: [0.05, 0.1, 0.05],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(45deg, transparent, rgba(255,255,255,0.03), transparent)',
        }}
      />

      {/* Periodic Glint / Sheen */}
      <motion.div
        animate={{
          left: ['-50%', '150%'],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          repeatDelay: 12, // Long delay for elegance
          ease: "easeInOut",
        }}
        className="absolute top-0 bottom-0 w-64 -skew-x-[25deg] opacity-[0.08]"
        style={{
          background: 'linear-gradient(to right, transparent, rgba(255,255,255,0), rgba(255,255,255,0.5), rgba(255,255,255,0), transparent)',
          mixBlendMode: 'overlay',
        }}
      />
    </div>
  );
}


export function EpiHeroCard({ data, selectedEntry }: EpiHeroCardProps) {
  const isCurrentMonth = selectedEntry.monthKey === data.currentMonthKey;
  const displayScore = isCurrentMonth ? data.officialEpiScore : selectedEntry.score;
  const selectedMonthGlobalAverage = data.globalAverageByMonth[selectedEntry.monthKey] ?? null;
  const heroComparison = resolveHeroEpiComparison({
    userEpiScore: displayScore,
    globalAverageEpi: selectedMonthGlobalAverage,
  });
  const chartZone = getEpiZone(displayScore);

  const selectedIndex = data.history.findIndex((entry) => entry.monthKey === selectedEntry.monthKey);
  const previousEntry = selectedIndex > 0 ? data.history[selectedIndex - 1] : null;
  const delta = previousEntry ? displayScore - previousEntry.score : 0;
  const nextWeeklySnapshot = isCurrentMonth ? formatSnapshotDate(getNextWeeklySnapshotDate()) : null;
  const chartHistory = data.history.map((entry) => (
    entry.monthKey === data.currentMonthKey ? { ...entry, score: data.officialEpiScore } : entry
  ));

  const DeltaIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const zoneColor = ZONE_COLOR[heroComparison.zone];
  const deltaStyle = { color: delta === 0 ? 'rgba(255,255,255,0.5)' : zoneColor };

  return (
    <div
      className="relative overflow-hidden rounded-xl p-6 shadow-lg"
      style={{
        background: 'linear-gradient(135deg, rgb(var(--primary-600)) 0%, rgb(var(--primary-700)) 50%, rgb(var(--primary-800)) 100%)',
      }}
    >
      <AnimatedBackground />



      <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center">
        <div className="flex flex-col items-center gap-3">
          <OdometerGauge
            key={selectedEntry.monthKey}
            value={displayScore}
            max={150}
            neutralAt={heroComparison.neutralAt}
            width={220}
            strokeWidth={16}
            zone={heroComparison.zone}
            label={`${selectedEntry.month} ${selectedEntry.year}`}
          />

          {previousEntry && (
            <div className="flex w-full items-center justify-center gap-2.5 border-t border-white/10 pt-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-white/50">
                {previousEntry.month}
              </span>
              <span className="h-[3px] w-[3px] rounded-full bg-white/20" />
              <span className="text-sm font-bold tabular-nums text-white/70">
                {formatEpiScore(previousEntry.score)}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col items-center gap-3 lg:items-start lg:justify-center">
          <div className="text-center lg:text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
              Employee Performance Index
            </p>
            <div className="mt-1 flex items-center justify-center gap-2 lg:justify-start">
              <DeltaIcon className="h-5 w-5" style={deltaStyle} />
              <span className="text-sm font-semibold" style={deltaStyle}>
                {delta > 0 ? '+' : ''}
                {formatEpiScore(delta)} from {previousEntry?.month ?? 'last month'}
              </span>
            </div>
          </div>

          <div className="inline-flex w-fit items-center rounded-full bg-white/20 px-3 py-1 backdrop-blur-sm">
            <span className="text-sm font-medium text-white">{getHeroZoneLabel(heroComparison.zone)}</span>
          </div>

          {isCurrentMonth && (
            <div className="rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-center backdrop-blur-md lg:text-left">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/60">
                Projected EPI
              </p>
              <p className="text-lg font-bold text-white">{formatEpiScore(selectedEntry.score)}</p>
              <p className="mt-1 text-[10px] font-medium text-white/60">
                Next weekly calculation on:
              </p>
              <p className="text-xs font-semibold text-white/80">
                {nextWeeklySnapshot}
              </p>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs text-white/60">Last {chartHistory.length} months</p>
          <TrendChart
            history={chartHistory}
            zone={chartZone}
            height={120}
            strokeColor="rgba(255,255,255,0.8)"
            tickColor="rgba(255,255,255,0.35)"
          />
        </div>
      </div>
    </div>
  );
}

