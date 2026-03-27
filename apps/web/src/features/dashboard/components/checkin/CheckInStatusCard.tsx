import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Clock, LogOut, GitBranch, Building2 } from 'lucide-react';
import type { DashboardCheckInStatus } from '../../services/epi.api';
import {
  formatCheckInTimeInManila,
  formatDurationSince,
  parseOdooUtcDateTime,
} from './checkInStatusCard.utils';

interface CheckInStatusCardProps {
  status: DashboardCheckInStatus | null;
  loading?: boolean;
}

export function CheckInStatusCard({ status, loading = false }: CheckInStatusCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const checkInTime = useMemo(
    () => parseOdooUtcDateTime(status?.checkInTimeUtc),
    [status?.checkInTimeUtc],
  );
  const isCheckedIn = Boolean(status?.checkedIn);
  const [duration, setDuration] = useState(() => (checkInTime ? formatDurationSince(checkInTime) : '0 mins'));

  useEffect(() => {
    if (!isCheckedIn || !checkInTime) {
      setDuration('0 mins');
      return;
    }

    setDuration(formatDurationSince(checkInTime));
    const id = setInterval(() => {
      setDuration(formatDurationSince(checkInTime));
    }, 60_000);

    return () => clearInterval(id);
  }, [isCheckedIn, checkInTime]);

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
                  background: 'linear-gradient(135deg, rgb(var(--primary-800)) 0%, rgb(var(--primary-900)) 100%)',
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
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <div className="space-y-3">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-primary-200/70">
                        You are currently checked in as
                      </p>
                      <div className="space-y-2">
                        <p className="text-lg font-bold text-white">
                          {roleLabel}
                        </p>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 shrink-0 text-primary-300/60" />
                          <p className="text-sm font-medium text-primary-100">
                            {companyLabel}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <GitBranch className="h-4 w-4 shrink-0 text-primary-300/60" />
                          <p className="text-sm font-medium text-primary-100">
                            {branchLabel}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-5 sm:border-l sm:border-primary-700/50 sm:pl-6">
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-primary-200/70">
                          Check-in time
                        </p>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 shrink-0 text-primary-300/60" />
                          <p className="text-base font-semibold text-white">
                            {checkInTimeLabel}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-primary-200/70">
                          Active since
                        </p>
                        <p className="text-lg font-bold text-green-400">
                          {durationLabel}
                        </p>
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
            <span className="h-2 w-2 shrink-0 rounded-full bg-green-400" />
          ) : (
            <span className="h-2 w-2 shrink-0 rounded-full bg-white/40" />
          )}

          <span
            className={`text-[11px] font-bold uppercase tracking-[0.2em] ${
              isCheckedIn ? 'text-green-400' : 'text-white'
            }`}
          >
            {isCheckedIn ? 'Checked In' : 'Checked Out'}
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
