import { useEffect, useRef } from 'react';
import { useMotionValue, useTransform, animate, motion, useInView } from 'framer-motion';

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  delay?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function AnimatedCounter({
  value,
  duration = 1.2,
  delay = 0,
  decimals = 0,
  prefix = '',
  suffix = '',
  className,
  style,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) =>
    `${prefix}${v.toFixed(decimals)}${suffix}`
  );
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    const controls = animate(count, value, {
      duration,
      delay,
      ease: 'easeOut',
    });
    return controls.stop;
  }, [inView, value, duration, delay, count]);

  return (
    <motion.span ref={ref} className={className} style={style}>
      {rounded}
    </motion.span>
  );
}
