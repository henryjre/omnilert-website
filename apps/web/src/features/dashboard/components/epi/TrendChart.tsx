import { useId } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart,
  Area,
  XAxis,
  Tooltip,
  ResponsiveContainer,
  type TooltipProps,
} from 'recharts';
import type { EpiMonthEntry, EpiZone } from './types';
import { getZoneColors } from './epiUtils';

interface TrendChartProps {
  history: EpiMonthEntry[];
  zone: EpiZone;
  height?: number;
}

type CustomTooltipProps = TooltipProps<number, string> & {
  payload?: Array<{ value?: number }>;
  label?: string;
};

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md bg-gray-900 px-2 py-1 text-xs text-white shadow-lg">
      <p className="font-semibold">{label}</p>
      <p>{payload[0].value?.toFixed(1)}</p>
    </div>
  );
}

export function TrendChart({ history, zone, height = 120 }: TrendChartProps) {
  const colors = getZoneColors(zone);
  const gradientId = `gradient-${zone}-${useId().replace(/:/g, '')}`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      style={{ height }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={history} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={colors.stroke} stopOpacity={0.25} />
              <stop offset="95%" stopColor={colors.stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="score"
            stroke={colors.stroke}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            activeDot={{ r: 4, stroke: colors.stroke, strokeWidth: 2, fill: 'white' }}
            isAnimationActive
            animationDuration={1500}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
