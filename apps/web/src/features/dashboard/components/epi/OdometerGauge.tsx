import { motion } from 'framer-motion';
import type { EpiZone } from './types';
import { AnimatedCounter } from './AnimatedCounter';

// Light tints that pop on any colored background
const ZONE_ARC_STROKE: Record<EpiZone, string> = {
  green: '#4ade80',  // green-400
  amber: '#fbbf24',  // amber-400
  red:   '#f87171',  // red-400
};

interface OdometerGaugeProps {
  value: number;
  max?: number;
  /** Value pinned at the 50% midpoint of the arc */
  neutralAt?: number;
  /** Width of the gauge SVG */
  width?: number;
  strokeWidth?: number;
  zone: EpiZone;
  label?: string;
  delay?: number;
  duration?: number;
}

/**
 * Speedometer-style half-gauge.
 *
 * Geometry:
 *   - SVG is wider than tall (landscape half-circle crop)
 *   - Arc center is placed at the BOTTOM-CENTER of the SVG
 *   - Arc sweeps from 210° to 330° (a 120° arc NOT a full 180°, gives a
 *     sporty "odometer" look with flat ends at bottom-left and bottom-right)
 *   - neutralAt (100) is pinned at the exact midpoint (270° = top)
 *   - Score + month label float inside the open bowl of the arc
 *
 * Two-segment scale:
 *   [0, neutralAt]   → [210°, 270°]  (left half of arc)
 *   [neutralAt, max] → [270°, 330°]  (right half of arc)
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

  // Arc sweep: 210° → 330° (120° total, symmetric about 270°)
  const arcStart = 210;
  const arcEnd = 330;
  const arcMid = 270; // neutralAt lives here
  const arcTotal = arcEnd - arcStart; // 120°

  // Place arc center at bottom-center of SVG
  const cx = width / 2;
  const r = width * 0.42; // radius relative to width
  // SVG height: just enough to show the arc above the center point
  // At 210° and 330°, y = cy + r*sin(210°or330°) = cy - r*0.5
  // At 270°, y = cy + r*sin(270°) = cy - r (topmost point)
  // So we need height = r + strokeWidth/2 + label clearance above
  const topY = r + strokeWidth; // space above cx for the arc top
  const cy = topY; // center is at y=topY in SVG coords
  const svgHeight = topY + strokeWidth * 0.6; // just past the arc center

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

  // Map value → angle using two-segment scale
  const angleForValue = (v: number): number => {
    const c = Math.max(0, Math.min(v, max));
    if (c <= neutralAt) {
      return arcStart + (c / neutralAt) * (arcTotal / 2);
    }
    return arcMid + ((c - neutralAt) / (max - neutralAt)) * (arcTotal / 2);
  };

  const valueAngle = angleForValue(value);
  // Arc length for the full sweep
  const fullArcLen = (arcTotal / 360) * 2 * Math.PI * r;
  const fillFraction = (valueAngle - arcStart) / arcTotal;
  const dashOffset = fullArcLen * (1 - fillFraction);

  // Neutral tick (at arcMid = 270°) — spans across the stroke
  const tickInner = pointOnArc(arcMid);
  // Offset inward/outward along radius direction (at 270°: straight up)
  const tickLen = strokeWidth * 1.1;
  const tickX = tickInner.x; // same x (270° is straight up)
  const tick = {
    x1: tickX,
    y1: tickInner.y - tickLen * 0.5,
    x2: tickX,
    y2: tickInner.y + tickLen * 0.5,
  };

  // "100" label: above the tick, outside the arc
  const labelOutR = r - strokeWidth * 1.4;
  const neutralLabelPt = {
    x: cx + labelOutR * Math.cos(toRad(arcMid)),
    y: cy + labelOutR * Math.sin(toRad(arcMid)),
  };

  // Text block: centered horizontally, sits in lower portion of the arc bowl
  // Arc bowl bottom is at cy (the center). Place text so it's centered
  // vertically in the interior space between top of arc (cy - r) and cy.
  // Interior mid = cy - r/2. We push slightly lower toward cy.
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
          {/* Subtle glow behind value arc */}
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

          {/* Track arc */}
          <path
            d={arcPath(arcStart, arcEnd)}
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Value arc */}
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

          {/* Neutral tick — white bar crossing the arc at 100 */}
          <line
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
            stroke="rgba(255,255,255,0.85)"
            strokeWidth={2.5}
            strokeLinecap="round"
          />

          {/* "100" label inside the arc, just below the tick */}
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
            100
          </text>

          {/* Score value — rendered in SVG for precise placement */}
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

          {/* Month label below score */}
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

        {/* Animated counter overlay (invisible, drives the SVG text via framer) */}
        {/* We use SVG text directly above for precision — AnimatedCounter is not needed */}
      </div>

      {/* Animated number (hidden, used only to drive animation if needed in future) */}
    </div>
  );
}
