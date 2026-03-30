import { motion } from 'framer-motion';
import { Banknote, CheckCircle, TrendingUp } from 'lucide-react';

interface AuditorRewardCardProps {
  /** Total earnings for the current period (e.g. month) */
  totalEarnings: number;
  /** Number of audits completed this period */
  auditsCompleted: number;
  /** Reward per completed audit */
  ratePerAudit: number;
}

const MotionNumber = ({ value, prefix = '' }: { value: number; prefix?: string }) => (
  <motion.span
    key={value}
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.35, ease: 'easeOut' }}
    className="tabular-nums"
  >
    {prefix}{value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
  </motion.span>
);

export function AuditorRewardCard({
  totalEarnings,
  auditsCompleted,
  ratePerAudit,
}: AuditorRewardCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <div
        className="relative overflow-hidden rounded-xl shadow-sm"
        style={{
          background:
            'linear-gradient(150deg, rgb(var(--primary-600)) 0%, rgb(var(--primary-700)) 60%, rgb(var(--primary-800)) 100%)',
        }}
      >
        {/* Decorative circles — mirrors GlobalEpiCard */}
        <div
          className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full opacity-[0.08]"
          style={{ background: 'rgba(255,255,255,1)' }}
        />
        <div
          className="pointer-events-none absolute -right-2 top-16 h-20 w-20 rounded-full opacity-[0.04]"
          style={{ background: 'rgba(255,255,255,1)' }}
        />

        {/* Content */}
        <div className="relative px-5 py-4">
          {/* Header row */}
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15">
              <Banknote className="h-3.5 w-3.5 text-white" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/55">
              Audit Rewards Tracker
            </p>
          </div>

          {/* Main amount */}
          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-[11px] font-semibold text-white/50">PHP</span>
            <span
              className="text-[36px] font-bold leading-none text-white"
              style={{ letterSpacing: '-1.5px' }}
            >
              <MotionNumber value={totalEarnings} />
            </span>
          </div>

          {/* Stats row */}
          <div className="mt-3 flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <CheckCircle className="h-3 w-3 text-emerald-300/70" />
              <span className="text-[11px] font-semibold text-white/70">
                <span className="text-white font-bold">{auditsCompleted}</span> audits
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3 text-emerald-300/70" />
              <span className="text-[11px] font-semibold text-white/70">
                PHP <span className="text-white font-bold">{ratePerAudit.toFixed(2)}</span>/audit
              </span>
            </div>
          </div>
        </div>

      </div>
    </motion.div>
  );
}
