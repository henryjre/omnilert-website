import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronDown,
  Clock,
  LogOut,
  GitBranch,
  Building2,
  Coffee,
  MapPin,
  Loader2,
} from 'lucide-react';
import type { DashboardCheckInStatus } from '../../services/epi.api';
import {
  formatCheckInTimeInManila,
  formatDurationSince,
  parseOdooUtcDateTime,
} from './checkInStatusCard.utils';
import { api } from '@/shared/services/api.client';
import { useAppToast } from '@/shared/hooks/useAppToast';

interface CheckInStatusCardProps {
  status: DashboardCheckInStatus | null;
  loading?: boolean;
  onRefresh?: () => void;
}

export function CheckInStatusCard({ status, loading = false, onRefresh }: CheckInStatusCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const { error: showErrorToast } = useAppToast();

  // Reset confirmation state after 3 seconds
  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(null), 3000);
    return () => clearTimeout(timer);
  }, [confirming]);

  const checkInTime = useMemo(
    () => parseOdooUtcDateTime(status?.checkInTimeUtc),
    [status?.checkInTimeUtc],
  );

  const activityStartTime = useMemo(
    () => (status?.activeActivity?.startTimeUtc ? parseOdooUtcDateTime(status.activeActivity.startTimeUtc) : null),
    [status?.activeActivity?.startTimeUtc],
  );

  const isCheckedIn = Boolean(status?.checkedIn);
  
  const [duration, setDuration] = useState(() =>
    checkInTime ? formatDurationSince(checkInTime) : '0 mins',
  );
  
  const [activityDuration, setActivityDuration] = useState(() =>
    activityStartTime ? formatDurationSince(activityStartTime) : '',
  );

  useEffect(() => {
    if (!isCheckedIn || !checkInTime) {
      setDuration('0 mins');
      setActivityDuration('');
      return;
    }

    // Immediate initial update
    setDuration(formatDurationSince(checkInTime));
    if (activityStartTime) {
      setActivityDuration(formatDurationSince(activityStartTime));
    }

    const intervalId = setInterval(() => {
      setDuration(formatDurationSince(checkInTime));
      if (activityStartTime) {
        setActivityDuration(formatDurationSince(activityStartTime));
      }
    }, 60000); // Update every minute

    return () => clearInterval(intervalId);
  }, [isCheckedIn, checkInTime, activityStartTime]);

  const roleLabel = status?.roleType ?? 'Unknown Role';
  const companyLabel = status?.companyName ?? 'N/A';
  const branchLabel = status?.branchName ?? 'N/A';
  const checkInTimeLabel = checkInTime ? formatCheckInTimeInManila(checkInTime) : 'N/A';
  const durationLabel = checkInTime ? duration : 'N/A';

  return (
    <div className="relative z-0 flex flex-col items-center w-full">
      <div className="relative z-20 w-full">
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div
              key="checkin-panel"
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              transition={{ type: 'spring', bounce: 0, duration: 0.4 }}
              className="flex w-full flex-col justify-end overflow-hidden"
            >
              <div
                className="w-full shrink-0 rounded-b-[1.5rem] border-x border-b border-primary-900/50 px-6 pb-6 pt-10 shadow-inner"
                style={{
                  background:
                    'linear-gradient(135deg, rgb(var(--primary-800)) 0%, rgb(var(--primary-900)) 100%)',
                }}
              >
                {loading && !status ? (
                  <div className="flex flex-col items-center gap-3 py-6">
                    <Clock className="h-8 w-8 text-primary-400/50" />
                    <p className="text-base font-semibold text-primary-100">
                      Loading check-in status...
                    </p>
                  </div>
                ) : isCheckedIn ? (
                  <div className="flex flex-col gap-6">
                    {/* Status Info Grid */}
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                      {/* Left Column: Role Info */}
                      <div className="flex flex-col items-center space-y-3 sm:items-start">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-primary-200/70">
                          You are currently checked in as
                        </p>
                        <div className="flex flex-col items-center space-y-2 sm:items-start">
                          <p className="text-lg font-bold text-white">{roleLabel}</p>
                          <div className="flex items-center justify-center gap-2 sm:justify-start">
                            <Building2 className="h-4 w-4 shrink-0 text-primary-300/60" />
                            <p className="text-sm font-medium text-primary-100">{companyLabel}</p>
                          </div>
                          <div className="flex items-center justify-center gap-2 sm:justify-start">
                            <GitBranch className="h-4 w-4 shrink-0 text-primary-300/60" />
                            <p className="text-sm font-medium text-primary-100">{branchLabel}</p>
                          </div>
                        </div>
                      </div>

                      {/* Right Column: Time Info */}
                      <div className="flex flex-col space-y-8 sm:border-l sm:border-primary-700/50 sm:pl-6">
                        <div className={`grid gap-x-4 gap-y-6 ${status?.activeActivity ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-2'}`}>
                          <div className="flex flex-col items-center space-y-1.5 sm:items-start">
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-primary-200/70">
                              Check-in time
                            </p>
                            <div className="flex items-center justify-center gap-2 sm:justify-start">
                              <Clock className="h-4 w-4 shrink-0 text-primary-300/60" />
                              <p className="whitespace-nowrap text-sm font-bold text-white sm:text-lg">
                                {checkInTimeLabel}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-col items-center space-y-1.5 sm:items-start">
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-primary-200/70">
                              Active since
                            </p>
                            <p className="whitespace-nowrap text-sm font-bold text-green-400 sm:text-lg">
                              {durationLabel}
                            </p>
                          </div>

                          {status?.activeActivity && (
                            <div className="col-span-2 flex flex-col items-center space-y-1.5 border-t border-primary-700/30 pt-4 md:col-span-1 md:border-0 md:pt-0 sm:items-start">
                              <p className="text-[10px] font-semibold uppercase tracking-widest text-primary-200/70">
                                {status.activeActivity.activity_type === 'break'
                                  ? 'On Break Since'
                                  : 'In Field Task Since'}
                              </p>
                              <p className={`whitespace-nowrap text-sm font-bold sm:text-lg ${
                                status.activeActivity.activity_type === 'break'
                                  ? 'text-slate-400'
                                  : 'text-primary-300'
                              }`}>
                                {activityDuration}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Quick Action Buttons for Service Crew */}
                        {isCheckedIn && status?.roleType === 'Service Crew' && status.shiftId && (
                          <div className="flex gap-3 border-t border-primary-700/50 pt-6">
                            <AnimatePresence mode="popLayout" initial={false}>
                              {(!status.activeActivity ||
                                status.activeActivity.activity_type === 'break') && (
                                <motion.button
                                  key="break-btn"
                                  layout
                                  initial={{ opacity: 0, scale: 0.95 }}
                                  animate={{
                                    opacity: 1,
                                    scale: confirming === 'break' ? [1, 1.04, 1] : 1,
                                    borderColor: confirming === 'break' ? '#34d399' : undefined,
                                  }}
                                  exit={{ opacity: 0, scale: 0.95 }}
                                  transition={{
                                    type: 'spring',
                                    stiffness: 500,
                                    damping: 30,
                                    mass: 1,
                                    scale: {
                                      duration: 0.8,
                                      repeat: confirming === 'break' ? Infinity : 0,
                                    },
                                    borderColor: { duration: 0.1 },
                                    backgroundColor: { duration: 0.1 },
                                  }}
                                  type="button"
                                  disabled={isSubmitting !== null}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (confirming !== 'break') {
                                      setConfirming('break');
                                      return;
                                    }

                                    const isEnding = status.activeActivity?.activity_type === 'break';
                                    const action = isEnding ? 'end' : 'start';
                                    setIsSubmitting('break');
                                    setConfirming(null);
                                    try {
                                      if (isEnding) {
                                        await api.post(
                                          `/employee-shifts/${status.shiftId}/activities/end`,
                                          {
                                            activityId: status.activeActivity?.id,
                                          },
                                        );
                                      } else {
                                        await api.post(
                                          `/employee-shifts/${status.shiftId}/activities/start`,
                                          {
                                            activityType: 'break',
                                          },
                                        );
                                      }
                                      onRefresh?.();
                                    } catch (err) {
                                      showErrorToast(`Failed to ${action} break.`);
                                    } finally {
                                      setIsSubmitting(null);
                                    }
                                  }}
                                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold transition-colors active:scale-95 ${
                                    confirming === 'break'
                                      ? 'border-emerald-400 bg-emerald-400/10 text-emerald-400 shadow-lg shadow-emerald-400/10'
                                      : status.activeActivity?.activity_type === 'break'
                                        ? 'border-blue-500 bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                                        : 'border-primary-700 bg-primary-800/50 text-white hover:bg-primary-700/50'
                                  } disabled:opacity-50 disabled:active:scale-100`}
                                >
                                  {isSubmitting === 'break' ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Coffee className="h-4 w-4" />
                                  )}
                                  <span>
                                    {confirming === 'break'
                                      ? status.activeActivity
                                        ? 'Confirm End?'
                                        : 'Confirm Break?'
                                      : status.activeActivity?.activity_type === 'break'
                                        ? 'End Break'
                                        : 'Break'}
                                  </span>
                                </motion.button>
                              )}

                              {(!status.activeActivity ||
                                status.activeActivity.activity_type === 'field_task') && (
                                <motion.button
                                  key="field-task-btn"
                                  layout
                                  initial={{ opacity: 0, scale: 0.95 }}
                                  animate={{
                                    opacity: 1,
                                    scale: confirming === 'field-task' ? [1, 1.04, 1] : 1,
                                    borderColor: confirming === 'field-task' ? '#34d399' : undefined,
                                  }}
                                  exit={{ opacity: 0, scale: 0.95 }}
                                  transition={{
                                    type: 'spring',
                                    stiffness: 500,
                                    damping: 30,
                                    mass: 1,
                                    scale: {
                                      duration: 0.8,
                                      repeat: confirming === 'field-task' ? Infinity : 0,
                                    },
                                    borderColor: { duration: 0.1 },
                                    backgroundColor: { duration: 0.1 },
                                  }}
                                  type="button"
                                  disabled={isSubmitting !== null}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (confirming !== 'field-task') {
                                      setConfirming('field-task');
                                      return;
                                    }

                                    const isEnding =
                                      status.activeActivity?.activity_type === 'field_task';
                                    const action = isEnding ? 'end' : 'start';
                                    setIsSubmitting('field-task');
                                    setConfirming(null);
                                    try {
                                      if (isEnding) {
                                        await api.post(
                                          `/employee-shifts/${status.shiftId}/activities/end`,
                                          {
                                            activityId: status.activeActivity?.id,
                                          },
                                        );
                                      } else {
                                        await api.post(
                                          `/employee-shifts/${status.shiftId}/activities/start`,
                                          {
                                            activityType: 'field_task',
                                          },
                                        );
                                      }
                                      onRefresh?.();
                                    } catch (err) {
                                      showErrorToast(`Failed to ${action} field task.`);
                                    } finally {
                                      setIsSubmitting(null);
                                    }
                                  }}
                                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold transition-colors active:scale-95 ${
                                    confirming === 'field-task'
                                      ? 'border-emerald-400 bg-emerald-400/10 text-emerald-400 shadow-lg shadow-emerald-400/10'
                                      : status.activeActivity?.activity_type === 'field_task'
                                        ? 'border-primary-500 bg-primary-500 text-white shadow-lg shadow-primary-500/20'
                                        : 'border-primary-700 bg-primary-800/50 text-white hover:bg-primary-700/50'
                                  } disabled:opacity-50 disabled:active:scale-100`}
                                >
                                  {isSubmitting === 'field-task' ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <MapPin className="h-4 w-4" />
                                  )}
                                  <span>
                                    {confirming === 'field-task'
                                      ? status.activeActivity
                                        ? 'Confirm End?'
                                        : 'Start Field Task?'
                                      : status.activeActivity?.activity_type === 'field_task'
                                        ? 'End Field Task'
                                        : 'Field Task'}
                                  </span>
                                </motion.button>
                              )}
                            </AnimatePresence>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 py-6">
                    <LogOut className="h-8 w-8 text-primary-400/50" />
                    <p className="text-base font-semibold text-primary-100">
                      You're not checked in
                    </p>
                    <p className="text-center text-sm text-primary-200/70">
                      Your attendance for this session will appear here once you check in.
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="group relative z-10 flex cursor-pointer items-center justify-center gap-2 px-8 pb-3 pt-6 transition-all active:scale-95 bg-transparent"
        style={{
          minWidth: '220px',
          marginTop: isOpen ? '-20px' : '0px',
        }}
      >
        <svg
          className="absolute inset-0 -z-10 h-full w-full transition-all drop-shadow-md group-hover:brightness-110"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <path
            d="M 0,0 L 100,0 L 88,80 Q 85,100 75,100 L 25,100 Q 15,100 12,80 Z"
            fill={isOpen ? 'rgb(var(--primary-900))' : 'rgb(var(--primary-800))'}
          />
        </svg>

        <div className={`flex items-center gap-2 ${isCheckedIn ? 'animate-pulse' : ''}`}>
          {isCheckedIn ? (
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                status?.activeActivity?.activity_type === 'break'
                  ? 'bg-slate-400'
                  : status?.activeActivity?.activity_type === 'field_task'
                    ? 'bg-primary-300'
                    : 'bg-green-400'
              }`}
            />
          ) : (
            <span className="h-2 w-2 shrink-0 rounded-full bg-white/40" />
          )}

          <span
            className={`text-[11px] font-bold uppercase tracking-[0.2em] ${
              isCheckedIn
                ? status?.activeActivity?.activity_type === 'break'
                  ? 'text-slate-400'
                  : status?.activeActivity?.activity_type === 'field_task'
                    ? 'text-primary-300'
                    : 'text-green-400'
                : 'text-white'
            }`}
          >
            {isCheckedIn
              ? status?.activeActivity?.activity_type === 'break'
                ? 'On Break'
                : status?.activeActivity?.activity_type === 'field_task'
                  ? 'Field Task'
                  : 'Checked In'
              : 'Checked Out'}
          </span>
        </div>

        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="flex items-center text-white/70"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </motion.span>
      </button>
    </div>
  );
}
