import { useId } from 'react';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import type { EpiZone } from './types';
import { getZoneColors, formatThreshold } from './epiUtils';

interface StarRatingProps {
  /** Score out of 5, supports decimals e.g. 4.2 */
  score: number;
  zone: EpiZone;
  /** Stagger delay for entrance animation */
  delay?: number;
  size?: number;
  gap?: number;
}

const STAR_COUNT = 5;

function getScoreLabel(score: number): string {
  if (score >= 5.0) return 'Excellent';
  if (score >= 4.0) return 'Very Good';
  if (score >= 3.0) return 'Average';
  if (score >= 2.0) return 'Poor';
  return 'Very Poor';
}

// Single star SVG path (standard 5-point star, viewBox 0 0 24 24, centered)
const STAR_PATH =
  'M12 2.25l2.47 5.01 5.53.8-4 3.9.94 5.5L12 14.77l-4.94 2.69.94-5.5-4-3.9 5.53-.8z';

function Star({
  fill,
  color,
  emptyColor,
  size,
  clipId,
  delay,
  index,
}: {
  fill: number; // 0 to 1
  color: string;
  emptyColor: string;
  size: number;
  clipId: string;
  delay: number;
  index: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true });

  const fillWidth = fill * size;

  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ flexShrink: 0 }}
    >
      <defs>
        <clipPath id={clipId}>
          <motion.rect
            x={0}
            y={0}
            height={24}
            initial={{ width: 0 }}
            animate={inView ? { width: fill * 24 } : { width: 0 }}
            transition={{
              duration: 0.7,
              delay: delay + index * 0.08,
              ease: 'easeOut',
            }}
          />
        </clipPath>
      </defs>

      {/* Empty star (track) */}
      <path d={STAR_PATH} fill={emptyColor} />

      {/* Filled star (clipped to fill ratio) */}
      <path d={STAR_PATH} fill={color} clipPath={`url(#${clipId})`} />
    </svg>
  );
}

export function StarRating({ score, zone, delay = 0, size = 22, gap = 4 }: StarRatingProps) {
  const baseId = useId().replace(/:/g, '');
  const colors = getZoneColors(zone);

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Stars row */}
      <div className="flex items-center" style={{ gap }}>
        {Array.from({ length: STAR_COUNT }, (_, i) => {
          const fill = Math.max(0, Math.min(1, score - i));
          return (
            <Star
              key={i}
              index={i}
              fill={fill}
              color={colors.stroke}
              emptyColor="#e5e7eb"
              size={size}
              clipId={`${baseId}-star-${i}`}
              delay={delay}
            />
          );
        })}
      </div>

      {/* Numeric score */}
      <div className="flex items-baseline gap-1">
        <span
          className={`text-2xl font-bold tabular-nums leading-none ${colors.text} ${colors.darkText}`}
        >
          {formatThreshold(score)}
        </span>
        <span className="text-xs text-gray-400 font-medium">/ 5</span>
      </div>

      {/* Level label pill */}
      <span
        className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest"
        style={{
          backgroundColor: `${colors.stroke}18`,
          color: colors.stroke,
        }}
      >
        {getScoreLabel(score)}
      </span>
    </div>
  );
}
