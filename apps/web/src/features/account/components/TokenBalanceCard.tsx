import { motion, type Variants } from 'framer-motion';
import { Coins } from 'lucide-react';

function AnimatedBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <motion.div
        animate={{ x: [0, 30, -30, 0], y: [0, -50, 50, 0] }}
        transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
        className="absolute -top-[50%] -left-[50%] h-[200%] w-[200%] opacity-[0.2]"
        style={{
          background: 'radial-gradient(circle at center, rgb(var(--primary-400)) 0%, transparent 50%)',
          filter: 'blur(100px)',
          mixBlendMode: 'soft-light',
        }}
      />
      <motion.div
        animate={{ x: [0, -40, 40, 0], y: [0, 30, -30, 0] }}
        transition={{ duration: 25, repeat: Infinity, ease: 'linear', delay: -5 }}
        className="absolute -bottom-[50%] -right-[50%] h-[200%] w-[200%] opacity-[0.15]"
        style={{
          background: 'radial-gradient(circle at center, rgb(var(--primary-300)) 0%, transparent 45%)',
          filter: 'blur(120px)',
          mixBlendMode: 'overlay',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          filter: 'contrast(120%) brightness(100%)',
        }}
      />
      <motion.div
        animate={{ opacity: [0.05, 0.1, 0.05] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute inset-0"
        style={{ background: 'linear-gradient(45deg, transparent, rgba(255,255,255,0.03), transparent)' }}
      />
      <motion.div
        animate={{ left: ['-50%', '150%'] }}
        transition={{ duration: 3, repeat: Infinity, repeatDelay: 12, ease: 'easeInOut' }}
        className="absolute top-0 bottom-0 w-64 -skew-x-[25deg] opacity-[0.08]"
        style={{
          background: 'linear-gradient(to right, transparent, rgba(255,255,255,0), rgba(255,255,255,0.5), rgba(255,255,255,0), transparent)',
          mixBlendMode: 'overlay',
        }}
      />
    </div>
  );
}

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: 'easeOut' },
  },
};

const contentVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.09, delayChildren: 0.12 },
  },
};

const rowVariant: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
};

export function TokenBalanceCard({ balance, isLoading = false }: { balance: number; isLoading?: boolean }) {
  const formattedBalance = new Intl.NumberFormat('en-PH', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(balance);

  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className="relative overflow-hidden rounded-2xl shadow-xl"
      style={{
        background:
          'linear-gradient(135deg, rgb(var(--primary-600)) 0%, rgb(var(--primary-700)) 50%, rgb(var(--primary-800)) 100%)',
      }}
    >
      <AnimatedBackground />

      <motion.div
        variants={contentVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 px-7 pb-7 pt-7 sm:px-9 sm:pb-8 sm:pt-8"
      >
        {/* Top row: label + chip */}
        <motion.div variants={rowVariant} className="flex items-start justify-between">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">
            Token Pay Balance
          </p>
          <Coins className="h-5 w-5 text-white/40" />
        </motion.div>

        {/* Balance — ₱ prefix, no PHP suffix */}
        <motion.div variants={rowVariant} className="mt-4 flex items-baseline gap-1">
          <span className="text-xl font-semibold text-white/60 sm:text-2xl">₱</span>
          {isLoading ? (
            <span className="text-4xl font-extrabold tracking-tight text-white/40 drop-shadow-sm sm:text-5xl md:text-6xl">—</span>
          ) : (
            <span className="text-4xl font-extrabold tracking-tight text-white drop-shadow-sm sm:text-5xl md:text-6xl">
              {formattedBalance}
            </span>
          )}
        </motion.div>

        {/* Divider */}
        <motion.div variants={rowVariant} className="my-6 h-px bg-white/10" />

        {/* Stats row */}
        <motion.div variants={rowVariant} className="flex gap-3 sm:gap-4">
          <div className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-3.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/45 sm:text-[10px]">
              Total Earned
            </p>
            <p className="mt-1.5 text-base font-bold tracking-tight text-[#4ade80] sm:mt-2 sm:text-lg">+ 4,200.00</p>
          </div>
          <div className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-3.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-white/45 sm:text-[10px]">
              Total Spent
            </p>
            <p className="mt-1.5 text-base font-bold tracking-tight text-[#fca5a5] sm:mt-2 sm:text-lg">− 1,850.50</p>
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
