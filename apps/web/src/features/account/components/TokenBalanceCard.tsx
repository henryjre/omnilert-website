import React from 'react';
import { motion } from 'framer-motion';

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

export function TokenBalanceCard({ balance }: { balance: number }) {
  const formattedBalance = new Intl.NumberFormat('en-PH', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(balance);

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-8 shadow-lg md:p-10"
      style={{
        background: 'linear-gradient(135deg, rgb(var(--primary-600)) 0%, rgb(var(--primary-700)) 50%, rgb(var(--primary-800)) 100%)',
      }}
    >
      <AnimatedBackground />
      
      <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-white/60">
            Available Token Pay Balance
          </p>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white/70">₱</span>
            <span className="text-5xl font-extrabold tracking-tight text-white drop-shadow-sm md:text-6xl">
              {formattedBalance}
            </span>
            <span className="ml-1 text-lg font-medium tracking-wide text-white/60">PHP</span>
          </div>
        </div>
        
        <div className="flex gap-4">
          <div className="min-w-[120px] rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
             <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">30 Day Credits</p>
             <p className="mt-1.5 flex items-center gap-1.5 text-xl font-bold tracking-tight text-[#4ade80]">
               + 4,200.00
             </p>
          </div>
          <div className="min-w-[120px] rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
             <p className="text-[10px] font-bold uppercase tracking-widest text-white/50">30 Day Debits</p>
             <p className="mt-1.5 flex items-center gap-1.5 text-xl font-bold tracking-tight text-white/90">
               - 1,850.50
             </p>
          </div>
        </div>
      </div>
    </div>
  );
}
