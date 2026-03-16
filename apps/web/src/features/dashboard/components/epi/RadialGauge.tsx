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
  /** Override track color (for hero card white-on-blue usage) */
  trackColor?: string;
  /** Override value color */
  valueColor?: string;
}

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
  trackColor,
  valueColor,
}: RadialGaugeProps) {
  const colors = getZoneColors(zone);
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.75;
  const gapLength = circumference - arcLength;
  const clampedValue = Math.max(0, Math.min(value, max));
  const fillRatio = max > 0 ? clampedValue / max : 0;
  const dashOffset = arcLength * (1 - fillRatio);

  const track = trackColor ?? '#e5e7eb'; // gray-200 light track
  const stroke = colors.stroke;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
          {/* Background track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={track}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${gapLength}`}
            transform={`rotate(135 ${center} ${center})`}
          />
          {/* Animated value arc */}
          <motion.circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${gapLength}`}
            transform={`rotate(135 ${center} ${center})`}
            initial={{ strokeDashoffset: arcLength }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration, delay, ease: 'easeOut' }}
          />
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
                style={{ fontSize: size * 0.18 }}
              >
                {valueFormat(clampedValue)}
              </span>
            ) : (
              <AnimatedCounter
                value={clampedValue}
                decimals={decimals}
                delay={delay}
                duration={duration}
                className={`font-bold leading-none ${valueColor ? '' : `${colors.text} ${colors.darkText}`}`}
                style={{ fontSize: size * 0.18 }}
              />
            )}
            {label && (
              <span
                className="text-gray-400 text-center leading-tight px-1"
                style={{ fontSize: size * 0.09 }}
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
