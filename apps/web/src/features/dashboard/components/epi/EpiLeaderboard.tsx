import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import type { LeaderboardEntry } from './types';
import { getEpiZone, getZoneColors, getScoreZone } from './epiUtils';
import { SectionLabel } from './SectionLabel';
import { AvatarFallback } from './AvatarFallback';
import { Card, CardBody } from '@/shared/components/ui/Card';

interface EpiLeaderboardProps {
  entries: LeaderboardEntry[];
}

function RankBadge({ rank }: { rank: number }) {
  const badgeClass =
    rank === 1 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
    rank === 2 ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' :
    rank === 3 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
    'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400';

  return (
    <span className={`inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${badgeClass}`}>
      {rank}
    </span>
  );
}

function PodiumCard({ entry, height }: { entry: LeaderboardEntry; height: string }) {
  const zone = getEpiZone(entry.epiScore);
  const colors = getZoneColors(zone);

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.6,
        delay: entry.rank === 1 ? 0.4 : entry.rank === 2 ? 0.2 : 0.6,
        ease: 'easeOut',
      }}
      className={`flex flex-col items-center justify-end rounded-xl border p-3 text-center ${height} ${
        entry.rank === 1
          ? 'border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-900/10'
          : entry.rank === 2
          ? 'border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/30'
          : 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/10'
      }`}
    >
      <div className="mb-1 text-2xl">
        {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : '🥉'}
      </div>
      <AvatarFallback
        firstName={entry.firstName}
        lastName={entry.lastName}
        size={entry.rank === 1 ? 'lg' : 'md'}
      />
      <p className="mt-2 max-w-[80px] truncate text-xs font-semibold text-gray-800 dark:text-gray-200">
        {entry.firstName}
      </p>
      <p className={`text-sm font-bold ${colors.text} ${colors.darkText}`}>
        {entry.epiScore.toFixed(1)}
      </p>
    </motion.div>
  );
}

function ExpandedRow({ entry }: { entry: LeaderboardEntry }) {
  const criteria = entry.criteria;
  const metrics = [
    { label: 'SQAA Score', value: criteria.sqaaScore, max: 5, isRate: false },
    { label: 'SCSA Score', value: criteria.scsaScore, max: 5, isRate: false },
    { label: 'Cashier Accuracy', value: criteria.cashierAccuracyRate, max: 100, isRate: true },
    { label: 'Attendance Rate', value: criteria.attendanceRate, max: 100, isRate: true },
  ];

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 text-xs">
      {metrics.map((m) => {
        if (m.value === null) {
          return (
            <div key={m.label} className="flex items-center justify-between">
              <span className="text-gray-500 dark:text-gray-400">{m.label}</span>
              <span className="text-gray-400">—</span>
            </div>
          );
        }
        const zone = m.isRate ? getEpiZone(m.value) : getScoreZone(m.value);
        const colors = getZoneColors(zone);
        const pct = Math.min(100, (m.value / m.max) * 100);
        return (
          <div key={m.label}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-gray-500 dark:text-gray-400">{m.label}</span>
              <span className={`font-semibold ${colors.text} ${colors.darkText}`}>
                {m.isRate ? `${m.value.toFixed(0)}%` : `${m.value.toFixed(1)}/5`}
              </span>
            </div>
            <div className="h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <motion.div
                className="h-1 rounded-full"
                style={{ backgroundColor: colors.stroke }}
                initial={{ width: '0%' }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function EpiLeaderboard({ entries }: EpiLeaderboardProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const currentUser = entries.find((e) => e.isCurrentUser);
  const top3 = entries.filter((e) => e.rank <= 3).sort((a, b) => a.rank - b.rank);
  const top10rest = entries.filter((e) => e.rank > 3 && e.rank <= 10);
  const outsideTop10 = entries.filter((e) => e.rank > 10 && e.isCurrentUser);

  const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean); // 2nd, 1st, 3rd

  return (
    <div>
      <SectionLabel>Leaderboard</SectionLabel>
      <Card>
        <CardBody className="space-y-4">
          {/* Podium */}
          <div className="flex items-end justify-center gap-3">
            {podiumOrder.map((entry) => (
              <PodiumCard
                key={entry.id}
                entry={entry}
                height={entry.rank === 1 ? 'min-h-[140px]' : entry.rank === 2 ? 'min-h-[120px]' : 'min-h-[100px]'}
              />
            ))}
          </div>

          {/* Full list (ranks 4-10) */}
          <div className="space-y-1">
            {top10rest.map((entry, i) => {
              const zone = getEpiZone(entry.epiScore);
              const colors = getZoneColors(zone);
              const isExpanded = expandedId === entry.id;
              const isHighlighted = entry.isCurrentUser;

              return (
                <motion.div
                  key={entry.id}
                  custom={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.6 + i * 0.05 }}
                >
                  <div
                    className={`cursor-pointer rounded-lg ${
                      isHighlighted
                        ? 'border border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-900/20'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    }`}
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  >
                    <div className="flex items-center gap-3 px-3 py-2">
                      <RankBadge rank={entry.rank} />
                      <AvatarFallback firstName={entry.firstName} lastName={entry.lastName} size="sm" />
                      <span className="flex-1 truncate text-sm font-medium text-gray-800 dark:text-gray-200">
                        {entry.firstName} {entry.lastName}
                        {isHighlighted && (
                          <span className="ml-1 text-xs font-normal text-primary-600 dark:text-primary-400">(You)</span>
                        )}
                      </span>
                      <span className={`text-sm font-semibold ${colors.text} ${colors.darkText}`}>
                        {entry.epiScore.toFixed(1)}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      />
                    </div>

                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          key="expanded"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: 'easeInOut' }}
                          style={{ overflow: 'hidden' }}
                        >
                          <ExpandedRow entry={entry} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Outside top 10 separator */}
          {outsideTop10.length > 0 && currentUser && (
            <>
              <div className="flex items-center gap-2">
                <div className="flex-1 border-t border-dashed border-gray-200 dark:border-gray-700" />
                <span className="text-xs text-gray-400">Your rank</span>
                <div className="flex-1 border-t border-dashed border-gray-200 dark:border-gray-700" />
              </div>
              {outsideTop10.map((entry) => {
                const zone = getEpiZone(entry.epiScore);
                const colors = getZoneColors(zone);
                const isExpanded = expandedId === entry.id;
                return (
                  <div
                    key={entry.id}
                    className="cursor-pointer rounded-lg border border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-900/20"
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  >
                    <div className="flex items-center gap-3 px-3 py-2">
                      <RankBadge rank={entry.rank} />
                      <AvatarFallback firstName={entry.firstName} lastName={entry.lastName} size="sm" />
                      <span className="flex-1 truncate text-sm font-medium text-primary-700 dark:text-primary-300">
                        {entry.firstName} {entry.lastName} <span className="text-xs font-normal">(You)</span>
                      </span>
                      <span className={`text-sm font-semibold ${colors.text} ${colors.darkText}`}>
                        {entry.epiScore.toFixed(1)}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      />
                    </div>
                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          key="expanded-outside"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: 'easeInOut' }}
                          style={{ overflow: 'hidden' }}
                        >
                          <ExpandedRow entry={entry} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
