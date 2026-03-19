import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Star, AlertCircle } from 'lucide-react';
import type { EpiCriteria, EpiMonthEntry, LeaderboardEntry, WrsStatusSummary } from './types';
import { getAovZone, getEpiZone, getRateZone, getScoreZone, getZoneColors } from './epiUtils';
import { SectionLabel } from './SectionLabel';
import { AvatarFallback } from './AvatarFallback';
import { Card, CardBody } from '@/shared/components/ui/Card';
import { AWARD_BONUS, VIOLATION_DEDUCTION } from './mockData';

interface EpiLeaderboardProps {
  entries: LeaderboardEntry[];
  selectedMonthKey: string;
}

interface ResolvedLeaderboardEntry extends LeaderboardEntry {
  selectedEntry: EpiMonthEntry | null;
  displayScore: number | null;
  displayCriteria: EpiCriteria;
  displayWrsStatus: WrsStatusSummary | null;
  hasData: boolean;
}

function getEmptyCriteria(): EpiCriteria {
  return {
    sqaaScore: null,
    workplaceRelationsScore: null,
    professionalConductScore: null,
    productivityRate: null,
    punctualityRate: null,
    attendanceRate: null,
    aov: null,
    branchAov: null,
    violationCount: 0,
    awardCount: 0,
    uniformComplianceRate: null,
    hygieneComplianceRate: null,
    sopComplianceRate: null,
  };
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

function PodiumCard({
  entry,
  height,
  isExpanded,
  onToggle,
}: {
  entry: ResolvedLeaderboardEntry;
  height: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const zone = entry.displayScore !== null ? getEpiZone(entry.displayScore) : 'amber';
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
      className={`flex flex-col items-center justify-end rounded-xl border p-3 text-center cursor-pointer transition-shadow hover:shadow-md ${height} ${
        isExpanded
          ? entry.rank === 1
            ? 'border-yellow-400 ring-2 ring-yellow-200 dark:ring-yellow-800'
            : entry.rank === 2
              ? 'border-gray-400 ring-2 ring-gray-200 dark:ring-gray-700'
              : 'border-orange-300 ring-2 ring-orange-100 dark:ring-orange-900'
          : ''
      } ${
        entry.rank === 1
          ? 'border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-900/10'
          : entry.rank === 2
            ? 'border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/30'
            : 'border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/10'
      }`}
      onClick={onToggle}
    >
      <div className="mb-1 text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
        {entry.rank === 1 ? '1st' : entry.rank === 2 ? '2nd' : '3rd'}
      </div>
      <AvatarFallback
        firstName={entry.firstName}
        lastName={entry.lastName}
        size={entry.rank === 1 ? 'lg' : 'md'}
      />
      <p className="mt-2 max-w-[80px] truncate text-xs font-semibold text-gray-800 dark:text-gray-200">
        {entry.firstName}
      </p>
      <p className={`text-sm font-bold ${entry.displayScore !== null ? `${colors.text} ${colors.darkText}` : 'text-gray-400'}`}>
        {entry.displayScore !== null ? entry.displayScore.toFixed(1) : '--'}
      </p>
      <ChevronDown
        className={`mt-1 h-3 w-3 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
      />
    </motion.div>
  );
}

function MetricBar({ label, value, max, format }: {
  label: string;
  value: number;
  max: number;
  format: string;
}) {
  const zone = max === 5 ? getScoreZone(value) : getRateZone(value);
  const colors = getZoneColors(zone);
  const pct = Math.min(100, (value / max) * 100);

  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-gray-500 dark:text-gray-400">{label}</span>
        <span className={`font-semibold ${colors.text} ${colors.darkText}`}>{format}</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <motion.div
          className="h-1.5 rounded-full"
          style={{ backgroundColor: colors.stroke }}
          initial={{ width: '0%' }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

function NullMetric({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-gray-400">--</span>
    </div>
  );
}

function ExpandedMetrics({
  criteria,
  wrsStatus,
  isMissingData,
}: {
  criteria: EpiCriteria | null;
  wrsStatus: WrsStatusSummary | null;
  isMissingData: boolean;
}) {
  if (isMissingData || !criteria) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 px-4 py-5 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
        No saved data for this month.
      </div>
    );
  }

  const aovZone = criteria.aov !== null && criteria.branchAov !== null
    ? getAovZone(criteria.aov, criteria.branchAov)
    : null;
  const aovColors = aovZone ? getZoneColors(aovZone) : null;
  const violationImpact = criteria.violationCount * VIOLATION_DEDUCTION;
  const awardImpact = criteria.awardCount * AWARD_BONUS;

  return (
    <div className="space-y-4 text-xs">
      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Performance Scores</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {criteria.sqaaScore !== null
            ? <MetricBar label="Customer Service" value={criteria.sqaaScore} max={5} format={`${criteria.sqaaScore.toFixed(1)}/5`} />
            : <NullMetric label="Customer Service" />}
          {criteria.workplaceRelationsScore !== null
            ? <MetricBar label="Workplace Relations" value={criteria.workplaceRelationsScore} max={5} format={`${criteria.workplaceRelationsScore.toFixed(1)}/5`} />
            : <NullMetric label="Workplace Relations" />}
          {criteria.professionalConductScore !== null
            ? <MetricBar label="Professional Conduct" value={criteria.professionalConductScore} max={5} format={`${criteria.professionalConductScore.toFixed(1)}/5`} />
            : <NullMetric label="Professional Conduct" />}
        </div>
        {wrsStatus && wrsStatus.delayedCount > 0 && (
          <p className="mt-2 text-[10px] font-medium text-gray-400">
            {wrsStatus.delayedCount} peer evaluation submission(s) are still delayed for privacy.
          </p>
        )}
      </div>

      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Operational Metrics</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {criteria.attendanceRate !== null
            ? <MetricBar label="Attendance Rate" value={criteria.attendanceRate} max={100} format={`${criteria.attendanceRate.toFixed(0)}%`} />
            : <NullMetric label="Attendance Rate" />}
          {criteria.punctualityRate !== null
            ? <MetricBar label="Punctuality Rate" value={criteria.punctualityRate} max={100} format={`${criteria.punctualityRate.toFixed(0)}%`} />
            : <NullMetric label="Punctuality Rate" />}
          {criteria.productivityRate !== null
            ? <MetricBar label="Productivity Rate" value={criteria.productivityRate} max={100} format={`${criteria.productivityRate.toFixed(0)}%`} />
            : <NullMetric label="Productivity Rate" />}
          {criteria.aov !== null && aovColors
            ? (
              <div>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-gray-500 dark:text-gray-400">Avg Order Value</span>
                  <span className={`font-semibold ${aovColors.text} ${aovColors.darkText}`}>
                    P{criteria.aov.toFixed(0)}
                    {criteria.branchAov ? <span className="font-normal text-gray-400"> / P{criteria.branchAov.toFixed(0)}</span> : null}
                  </span>
                </div>
              </div>
            )
            : <NullMetric label="Avg Order Value" />}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Operational Compliance</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {criteria.uniformComplianceRate !== null
            ? <MetricBar label="Uniform Compliance" value={criteria.uniformComplianceRate} max={100} format={`${criteria.uniformComplianceRate.toFixed(0)}%`} />
            : <NullMetric label="Uniform Compliance" />}
          {criteria.hygieneComplianceRate !== null
            ? <MetricBar label="Hygiene Compliance" value={criteria.hygieneComplianceRate} max={100} format={`${criteria.hygieneComplianceRate.toFixed(0)}%`} />
            : <NullMetric label="Hygiene Compliance" />}
          {criteria.sopComplianceRate !== null
            ? <MetricBar label="SOP Compliance" value={criteria.sopComplianceRate} max={100} format={`${criteria.sopComplianceRate.toFixed(0)}%`} />
            : <NullMetric label="SOP Compliance" />}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Discipline &amp; Recognition</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/10 px-3 py-2">
            <Star className="h-4 w-4 flex-shrink-0 text-amber-500" />
            <div>
              <p className="font-bold text-amber-600 dark:text-amber-400">{criteria.awardCount} Awards</p>
              <p className="text-[10px] text-amber-500">{criteria.awardCount === 0 ? 'No bonus' : `+${awardImpact} pts`}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/10 px-3 py-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-500" />
            <div>
              <p className="font-bold text-red-600 dark:text-red-400">{criteria.violationCount} Violations</p>
              <p className="text-[10px] text-red-500">{criteria.violationCount === 0 ? 'Clean record' : `-${violationImpact} pts`}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const PAGE_SIZE = 10;

export function EpiLeaderboard({ entries, selectedMonthKey }: EpiLeaderboardProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    setExpandedId(null);
    setPage(0);
  }, [selectedMonthKey]);

  const rankedEntries = useMemo(() => {
    const resolved = entries.map((entry) => {
      const selectedEntry = entry.history.find((historyEntry) => historyEntry.monthKey === selectedMonthKey) ?? null;
      const hasData = selectedEntry !== null;

      return {
        ...entry,
        selectedEntry,
        displayScore: selectedEntry?.score ?? null,
        displayCriteria: selectedEntry?.criteria ?? getEmptyCriteria(),
        displayWrsStatus: selectedEntry?.wrsStatus ?? null,
        hasData,
      } satisfies ResolvedLeaderboardEntry;
    });

    resolved.sort((a, b) => {
      if (a.hasData && b.hasData) {
        if (a.displayScore !== b.displayScore) {
          return (b.displayScore ?? 0) - (a.displayScore ?? 0);
        }
        return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
      }
      if (a.hasData) return -1;
      if (b.hasData) return 1;
      return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    });

    return resolved.map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
  }, [entries, selectedMonthKey]);

  const top3 = useMemo(() => rankedEntries.filter((entry) => entry.rank <= 3), [rankedEntries]);
  const rest = useMemo(() => rankedEntries.filter((entry) => entry.rank > 3), [rankedEntries]);
  const totalPages = Math.ceil(rest.length / PAGE_SIZE);
  const pageEntries = rest.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const podiumOrder = [top3[1], top3[0], top3[2]].filter(
    (entry): entry is ResolvedLeaderboardEntry => Boolean(entry),
  );

  function handlePageChange(nextPage: number) {
    setExpandedId(null);
    setPage(nextPage);
  }

  return (
    <div>
      <SectionLabel>Leaderboard</SectionLabel>
      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-col gap-3">
            <div className="flex items-end justify-center gap-3">
              {podiumOrder.map((entry) => (
                <PodiumCard
                  key={entry.id}
                  entry={entry}
                  height={entry.rank === 1 ? 'min-h-[140px] w-[130px]' : entry.rank === 2 ? 'min-h-[120px] w-[110px]' : 'min-h-[100px] w-[110px]'}
                  isExpanded={expandedId === entry.id}
                  onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                />
              ))}
            </div>

            <AnimatePresence initial={false}>
              {top3.map((entry) =>
                expandedId === entry.id ? (
                  <motion.div
                    key={`podium-detail-${entry.id}`}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: 'easeInOut' }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div className={`rounded-xl border px-4 py-3 ${
                      entry.rank === 1
                        ? 'border-yellow-200 bg-yellow-50/50 dark:border-yellow-800 dark:bg-yellow-900/10'
                        : entry.rank === 2
                          ? 'border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-800/20'
                          : 'border-orange-100 bg-orange-50/50 dark:border-orange-900 dark:bg-orange-900/10'
                    }`}>
                      <p className="mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                        {entry.firstName} {entry.lastName} - Metrics
                      </p>
                      <ExpandedMetrics
                        criteria={entry.hasData ? entry.displayCriteria : null}
                        wrsStatus={entry.displayWrsStatus}
                        isMissingData={!entry.hasData}
                      />
                    </div>
                  </motion.div>
                ) : null,
              )}
            </AnimatePresence>
          </div>

          <div className="space-y-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={page}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="space-y-1"
              >
                {pageEntries.map((entry) => {
                  const zone = entry.displayScore !== null ? getEpiZone(entry.displayScore) : 'amber';
                  const colors = getZoneColors(zone);
                  const isExpanded = expandedId === entry.id;
                  const isHighlighted = entry.isCurrentUser;

                  return (
                    <div key={entry.id}>
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
                          <span className={`text-sm font-semibold ${entry.displayScore !== null ? `${colors.text} ${colors.darkText}` : 'text-gray-400'}`}>
                            {entry.displayScore !== null ? entry.displayScore.toFixed(1) : '--'}
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
                              <div className="px-4 pb-3 pt-1">
                                <ExpandedMetrics
                                  criteria={entry.hasData ? entry.displayCriteria : null}
                                  wrsStatus={entry.displayWrsStatus}
                                  isMissingData={!entry.hasData}
                                />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-800 pt-3">
              <p className="text-xs text-gray-400">
                Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, rest.length)} of {rest.length} employees
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page === 0}
                  className="rounded-md px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  Prev
                </button>
                {Array.from({ length: totalPages }, (_, index) => (
                  <button
                    key={index}
                    onClick={() => handlePageChange(index)}
                    className={`h-7 w-7 rounded-md text-xs font-medium transition-colors ${
                      index === page
                        ? 'bg-primary-600 text-white'
                        : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                    }`}
                  >
                    {index + 1}
                  </button>
                ))}
                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page === totalPages - 1}
                  className="rounded-md px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
