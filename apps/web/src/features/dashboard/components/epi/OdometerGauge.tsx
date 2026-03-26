import { motion } from 'framer-motion';
import type { EpiZone } from './types';

type OdometerZone = EpiZone | 'blue';

// Light tints that pop on any colored background.
const ZONE_ARC_STROKE: Record<OdometerZone, string> = {
  green: '#4ade80',
  amber: '#fbbf24',
  red: '#f87171',
  blue: '#60a5fa',
};

interface OdometerGaugeProps {
  value: number;
  max?: number;
  /** Value pinned at the 50% midpoint of the arc */
  neutralAt?: number;
  /** Width of the gauge SVG */
  width?: number;
  strokeWidth?: number;
  zone: OdometerZone;
  label?: string;
  delay?: number;
  duration?: number;
}

/**
 * Speedometer-style half-gauge.
 *
 * Geometry:
 * - Arc center is at the bottom-center of the SVG.
 * - Arc sweeps from 210deg to 330deg (120deg total).
 * - neutralAt is pinned at the midpoint (270deg).
 *
 * Two-segment scale:
 * [0, neutralAt]   -> [210deg, 270deg]
 * [neutralAt, max] -> [270deg, 330deg]
 */
export function OdometerGauge({
  value,
  max = 150,
  neutralAt = 100,
  width = 240,
  strokeWidth = 16,
  zone,
  label,
  delay = 0,
  duration = 1.4,
}: OdometerGaugeProps) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  // Guard against bad input that would break piecewise interpolation.
  const safeMax = Math.max(max, 2);
  const safeNeutralAt = Math.min(Math.max(neutralAt, 1), safeMax - 1);
  const roundedNeutralAt = Math.round(neutralAt * 10) / 10;
  const neutralLabel = Number.isInteger(roundedNeutralAt) ? roundedNeutralAt.toFixed(0) : roundedNeutralAt.toFixed(1);

  // Arc sweep: 210deg -> 330deg (120deg total), symmetric around 270deg.
  const arcStart = 210;
  const arcEnd = 330;
  const arcMid = 270;
  const arcTotal = arcEnd - arcStart;

  // Place arc center at bottom-center of SVG.
  const cx = width / 2;
  const r = width * 0.42;
  const topY = r + strokeWidth;
  const cy = topY;
  const svgHeight = topY + strokeWidth * 0.6;

  const pointOnArc = (angleDeg: number) => ({
    x: cx + r * Math.cos(toRad(angleDeg)),
    y: cy + r * Math.sin(toRad(angleDeg)),
  });

  const arcPath = (fromDeg: number, toDeg: number): string => {
    const s = pointOnArc(fromDeg);
    const e = pointOnArc(toDeg);
    const large = toDeg - fromDeg > 180 ? 1 : 0;
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
  };

  const angleForValue = (v: number): number => {
    const c = Math.max(0, Math.min(v, safeMax));
    if (c <= safeNeutralAt) {
      return arcStart + (c / safeNeutralAt) * (arcTotal / 2);
    }
    return arcMid + ((c - safeNeutralAt) / (safeMax - safeNeutralAt)) * (arcTotal / 2);
  };

  const valueAngle = angleForValue(value);
  const fullArcLen = (arcTotal / 360) * 2 * Math.PI * r;
  const fillFraction = (valueAngle - arcStart) / arcTotal;
  const dashOffset = fullArcLen * (1 - fillFraction);

  // Neutral tick at midpoint.
  const tickInner = pointOnArc(arcMid);
  const tickLen = strokeWidth * 1.1;
  const tick = {
    x1: tickInner.x,
    y1: tickInner.y - tickLen * 0.5,
    x2: tickInner.x,
    y2: tickInner.y + tickLen * 0.5,
  };

  const labelOutR = r - strokeWidth * 1.4;
  const neutralLabelPt = {
    x: cx + labelOutR * Math.cos(toRad(arcMid)),
    y: cy + labelOutR * Math.sin(toRad(arcMid)),
  };

  const textCenterY = cy - r * 0.28;
  const scoreFontSize = width * 0.19;
  const monthFontSize = width * 0.052;

  return (
    <div className="flex flex-col items-center" style={{ width }}>
      <div className="relative" style={{ width, height: svgHeight }}>
        <svg
          width={width}
          height={svgHeight}
          viewBox={`0 0 ${width} ${svgHeight}`}
          style={{ overflow: 'visible' }}
        >
          <motion.path
            d={arcPath(arcStart, arcEnd)}
            fill="none"
            stroke={ZONE_ARC_STROKE[zone]}
            strokeWidth={strokeWidth + 8}
            strokeLinecap="round"
            strokeOpacity={0.25}
            strokeDasharray={fullArcLen}
            initial={{ strokeDashoffset: fullArcLen }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration, delay, ease: 'easeOut' }}
          />

          <path
            d={arcPath(arcStart, arcEnd)}
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          <motion.path
            d={arcPath(arcStart, arcEnd)}
            fill="none"
            stroke={ZONE_ARC_STROKE[zone]}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={fullArcLen}
            initial={{ strokeDashoffset: fullArcLen }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration, delay, ease: 'easeOut' }}
          />

          <line
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
            stroke="rgba(255,255,255,0.85)"
            strokeWidth={2.5}
            strokeLinecap="round"
          />

          <text
            x={neutralLabelPt.x}
            y={neutralLabelPt.y + 4}
            fill="rgba(255,255,255,0.5)"
            fontSize={width * 0.058}
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily="inherit"
            fontWeight="600"
          >
            {neutralLabel}
          </text>

          <text
            x={cx}
            y={textCenterY}
            fill="white"
            fontSize={scoreFontSize}
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily="inherit"
            fontWeight="700"
            letterSpacing="-1"
          >
            {value.toFixed(1)}
          </text>

          {label && (
            <text
              x={cx}
              y={textCenterY + scoreFontSize * 0.62}
              fill="rgba(255,255,255,0.6)"
              fontSize={monthFontSize}
              textAnchor="middle"
              dominantBaseline="middle"
              fontFamily="inherit"
              fontWeight="500"
            >
              {label}
            </text>
          )}
        </svg>
      </div>
    </div>
  );
}
