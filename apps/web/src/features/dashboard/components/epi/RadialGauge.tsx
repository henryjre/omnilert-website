import { motion } from 'framer-motion';
import type { EpiZone } from './types';
import { getZoneColors } from './epiUtils';
import { AnimatedCounter } from './AnimatedCounter';

interface RadialGaugeProps {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  zone: EpiZone;
  label?: string;
  showValue?: boolean;
  valueFormat?: (v: number) => string;
  delay?: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** Override track color */
  trackColor?: string;
  /** Override value color */
  valueColor?: string;
  /** Optional markers to draw on the gauge */
  markers?: Array<{ value: number; color?: string }>;
}

/**
 * C-shaped arc gauge matching the reference design.
 * Arc sweeps 260° starting from the bottom-left, gap at the bottom.
 * Thick stroke, rounded ends, value centered.
 */
export function RadialGauge({
  value,
  max,
  size = 120,
  strokeWidth = 10,
  zone,
  label,
  showValue = true,
  valueFormat,
  delay = 0,
  duration = 1.2,
  decimals = 1,
  prefix,
  suffix,
  trackColor,
  valueColor,
  markers,
}: RadialGaugeProps) {
  const colors = getZoneColors(zone);

  const cx = size / 2;
  const cy = size / 2;
  const r = (size - strokeWidth * 2) / 2;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  // Arc: 260° sweep, gap of 100° centered at the bottom (270°)
  // So arc runs from 140° to 40° going clockwise (via 270°, 360°, 90°, etc.)
  // Start: 140°, End: 40° (= 400° = 40° + 360°) for clockwise
  const arcStartDeg = 140;
  const arcSweepDeg = 260;
  const arcEndDeg = arcStartDeg + arcSweepDeg; // 400° = 40° visually

  const startX = cx + r * Math.cos(toRad(arcStartDeg));
  const startY = cy + r * Math.sin(toRad(arcStartDeg));
  const endX = cx + r * Math.cos(toRad(arcEndDeg));
  const endY = cy + r * Math.sin(toRad(arcEndDeg));

  // Full arc path (track)
  const trackPath = `M ${startX} ${startY} A ${r} ${r} 0 1 1 ${endX} ${endY}`;

  // Arc circumference for the 260° sweep
  const arcLen = (arcSweepDeg / 360) * 2 * Math.PI * r;

  const clampedValue = Math.max(0, Math.min(value, max));
  const fillRatio = max > 0 ? clampedValue / max : 0;
  const dashOffset = arcLen * (1 - fillRatio);

  const track = trackColor ?? '#e5e7eb';
  const stroke = colors.stroke;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ overflow: 'visible' }}
        >
          {/* Track arc */}
          <path
            d={trackPath}
            fill="none"
            stroke={track}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Value arc — same path, clipped with dashoffset */}
          <motion.path
            d={trackPath}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={arcLen}
            initial={{ strokeDashoffset: arcLen }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration, delay, ease: 'easeOut' }}
          />

          {/* Markers */}
          {markers?.map((marker, idx) => {
            const markerRatio = max > 0 ? Math.max(0, Math.min(marker.value / max, 1)) : 0;
            const markerDeg = arcStartDeg + markerRatio * arcSweepDeg;
            const innerR = r - strokeWidth / 1.5;
            const outerR = r + strokeWidth / 1.5;
            
            const x1 = cx + innerR * Math.cos(toRad(markerDeg));
            const y1 = cy + innerR * Math.sin(toRad(markerDeg));
            const x2 = cx + outerR * Math.cos(toRad(markerDeg));
            const y2 = cy + outerR * Math.sin(toRad(markerDeg));

            return (
              <line
                key={idx}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={marker.color ?? '#6b7280'}
                strokeWidth={3}
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        {/* Center content */}
        {showValue && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center"
            style={{ color: valueColor }}
          >
            {valueFormat ? (
              <span
                className={`font-bold leading-none ${valueColor ? '' : `${colors.text} ${colors.darkText}`}`}
                style={{ fontSize: size * 0.19 }}
              >
                {(() => {
                  const formatted = valueFormat(clampedValue);
                  if (formatted.endsWith('%')) {
                    return (
                      <>
                        {formatted.slice(0, -1)}
                        <span className="ml-0.5 text-[0.6em] font-medium opacity-80">%</span>
                      </>
                    );
                  }
                  return formatted;
                })()}
              </span>
            ) : (
              <div 
                className={`flex items-baseline justify-center font-bold leading-none ${valueColor ? '' : `${colors.text} ${colors.darkText}`}`}
                style={{ fontSize: decimals > 0 ? size * 0.16 : size * 0.22 }}
              >
                {prefix && <span className="mr-0.5 text-[0.85em] font-medium opacity-80">{prefix}</span>}
                <AnimatedCounter
                  value={clampedValue}
                  decimals={decimals}
                  delay={delay}
                  duration={duration}
                />
                {suffix && <span className="ml-0.5 text-[0.6em] font-medium opacity-80">{suffix}</span>}
              </div>
            )}
            {label && (
              <span
                className="text-gray-400 text-center leading-tight px-1"
                style={{ fontSize: size * 0.1 }}
              >
                {label}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
