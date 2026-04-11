import { motion, animate as fmAnimate } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
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
  { top: '-30px',   left: '-20%', opacity: 0.60, duration: 10, delay:  0, driftX: 60, driftScaleY: 1.25 },
  { top: '20px',    left: '-40%', opacity: 0.70, duration: 13, delay: -4, driftX: 80, driftScaleY: 1.10 },
  { bottom: '-10px', left: '-10%', opacity: 0.65, duration: 11, delay: -7, driftX: 50, driftScaleY: 1.30 },
];

const BAND_STYLE: React.CSSProperties = {
  position: 'absolute',
  width: '200%',
  height: 100,
  borderRadius: '50%',
  filter: 'blur(32px)',
};

function bandGradient(zone: HeroEpiZone, bandIndex: number): string {
  const colors = ZONE_COLORS[zone];
  return `linear-gradient(90deg, ${colors[bandIndex]}cc, ${colors[(bandIndex + 1) % 3]}66, transparent)`;
}

export function AuroraBackground({ zone }: AuroraBackgroundProps) {
  const [fromZone, setFromZone] = useState<HeroEpiZone>(zone);
  const [toZone, setToZone] = useState<HeroEpiZone>(zone);
  const topOpacity = useRef(0);
  const topRefs = useRef<(HTMLDivElement | null)[]>([null, null, null]);

  useEffect(() => {
    if (zone === toZone) return;

    // Start cross-fade: bottom layer keeps fromZone, top layer fades in toZone
    setFromZone(toZone);
    setToZone(zone);
    topOpacity.current = 0;

    // Animate top layer opacity 0 → 1
    topRefs.current.forEach((el) => {
      if (!el) return;
      el.style.opacity = '0';
      fmAnimate(el, { opacity: 1 }, { duration: 0.8, ease: 'easeInOut' }).then(() => {
        topOpacity.current = 1;
      });
    });
  }, [zone, toZone]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        borderRadius: 'inherit',
        zIndex: 0,
      }}
    >
      {BANDS.map((band, i) => (
        <motion.div
          key={`aurora-band-${i}`}
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
            ...BAND_STYLE,
            top: band.top,
            bottom: band.bottom,
            left: band.left,
            opacity: band.opacity,
          }}
        >
          {/* Bottom layer: from-zone color (always visible) */}
          <div
            style={{
              ...BAND_STYLE,
              top: 0,
              left: 0,
              width: '100%',
              background: bandGradient(fromZone, i),
            }}
          />
          {/* Top layer: to-zone color (fades in on zone change) */}
          <div
            ref={(el) => { topRefs.current[i] = el; }}
            style={{
              ...BAND_STYLE,
              top: 0,
              left: 0,
              width: '100%',
              background: bandGradient(toZone, i),
              opacity: fromZone === toZone ? 1 : topOpacity.current,
            }}
          />
        </motion.div>
      ))}
    </div>
  );
}
