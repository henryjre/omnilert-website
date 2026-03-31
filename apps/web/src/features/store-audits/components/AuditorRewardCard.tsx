import { motion } from 'framer-motion';
import { Banknote, CheckCircle, TrendingUp } from 'lucide-react';

interface AuditorRewardCardProps {
  /** Total earnings for the current period */
  totalEarnings: number;
  /** Number of audits completed this period */
  auditsCompleted: number;
  /** Average reward per completed audit (current period) */
  averageReward: number;
  /** Total earnings for the previous period */
  previousPeriodTotalEarnings?: number;
  /** Number of audits completed in the previous period */
  previousPeriodAuditsCompleted?: number;
}

const MotionNumber = ({ value }: { value: number }) => (
  <motion.span
    key={value}
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.35, ease: 'easeOut' }}
    className="tabular-nums"
  >
    {value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
  </motion.span>
);

export function AuditorRewardCard({
  totalEarnings,
  auditsCompleted,
  averageReward,
  previousPeriodTotalEarnings = 0,
  previousPeriodAuditsCompleted = 0,
}: AuditorRewardCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <div
        className="relative overflow-hidden rounded-2xl shadow-lg"
        style={{
          background:
            'linear-gradient(150deg, rgb(var(--primary-600)) 0%, rgb(var(--primary-700)) 60%, rgb(var(--primary-800)) 100%)',
        }}
      >
        {/* Animated background highlights for depth */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.4) 0%, transparent 40%)',
          }}
        />

        {/* Decorative elements */}
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
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 backdrop-blur-sm shadow-inner">
              <Banknote className="h-3.5 w-3.5 text-white" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/60">
              Audit Rewards Tracker
            </p>
          </div>

          {/* Amount and Previous Period Row */}
          <div className="mt-4 flex items-end justify-between gap-4">
            {/* Main amount - Back on the Left */}
            <div className="flex items-baseline gap-1.5">
              <span className="text-[11px] font-bold text-white/40 tracking-wider">PHP</span>
              <span
                className="text-4xl font-black leading-none text-white tracking-tight"
              >
                <MotionNumber value={totalEarnings} />
              </span>
            </div>

            {/* Previous Period Info - Back on the Right, with items-start alignment */}
            <div className="flex flex-col items-start border-l border-white/15 pl-4 py-0.5">
               <span className="text-[8px] font-semibold uppercase tracking-[0.2em] text-white/30 leading-none mb-1.5">Prev Period</span>
               <div className="flex items-center gap-1.5 mt-0.5">
                 <span className="text-[15px] font-black text-white/70 tabular-nums">
                   <span className="text-[10px] text-white/40 mr-1 font-bold">PHP</span>
                   {previousPeriodTotalEarnings.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                 </span>
                 <div className="h-1 w-1 rounded-full bg-white/20" aria-hidden="true" />
                 <span className="text-[12px] font-bold text-white/50 tracking-tight">
                   {previousPeriodAuditsCompleted} <span className="text-[9px] opacity-70 font-medium">audits</span>
                 </span>
               </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="mt-4 flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <CheckCircle className="h-3 w-3 text-emerald-300/70" />
              <span className="text-[11px] font-semibold text-white/70">
                <span className="text-white font-bold">{auditsCompleted}</span> audits
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3 text-emerald-300/70" />
              <span className="text-[11px] font-semibold text-white/70 tabular-nums">
                ₱ <span className="text-white font-bold">{averageReward.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>/audit
              </span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
