import { motion } from 'framer-motion';
import type { HeroEpiZone } from './heroEpiComparison';

interface AuroraBackgroundProps {
  zone: HeroEpiZone;
}

const ZONE_COLORS: Record<HeroEpiZone, [string, string, string]> = {
  green: ['#16a34a', '#059669', '#4ade80'],
  amber: ['#d97706', '#f59e0b', '#fbbf24'],
  red:   ['#dc2626', '#e11d48', '#f87171'],
  blue:  ['#2563eb', '#7c3aed', '#60a5fa'],
};

interface BandConfig {
  top?: string;
  bottom?: string;
  left: string;
  opacity: number;
  duration: number;
  delay: number;
  driftX: number;
  driftScaleY: number;
}

const BANDS: BandConfig[] = [
  { top: '-30px',  left: '-20%', opacity: 0.60, duration: 10, delay:  0, driftX: 60,  driftScaleY: 1.25 },
  { top: '20px',   left: '-40%', opacity: 0.70, duration: 13, delay: -4, driftX: 80,  driftScaleY: 1.10 },
  { bottom: '-10px', left: '-10%', opacity: 0.65, duration: 11, delay: -7, driftX: 50,  driftScaleY: 1.30 },
];

export function AuroraBackground({ zone }: AuroraBackgroundProps) {
  const colors = ZONE_COLORS[zone];

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        borderRadius: 'inherit',
      }}
    >
      {BANDS.map((band, i) => (
        <motion.div
          key={i}
          animate={{
            x: [0, band.driftX, 0],
            scaleY: [1, band.driftScaleY, 1],
          }}
          transition={{
            x: {
              duration: band.duration,
              delay: band.delay,
              repeat: Infinity,
              repeatType: 'mirror',
              ease: 'easeInOut',
            },
            scaleY: {
              duration: band.duration,
              delay: band.delay,
              repeat: Infinity,
              repeatType: 'mirror',
              ease: 'easeInOut',
            },
          }}
          style={{
            position: 'absolute',
            width: '200%',
            height: 100,
            top: band.top,
            bottom: band.bottom,
            left: band.left,
            borderRadius: '50%',
            filter: 'blur(32px)',
            opacity: band.opacity,
            background: `linear-gradient(90deg, ${colors[i]}cc, ${colors[(i + 1) % 3]}66, transparent)`,
            transition: 'background 0.8s ease-in-out',
          }}
        />
      ))}
    </div>
  );
}
